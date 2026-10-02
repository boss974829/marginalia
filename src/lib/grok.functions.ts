import { createServerFn } from "@tanstack/react-start";

const VOICES = new Set(["eve", "ara", "leo", "helios"]);
const LANGS = new Set(["en", "hi", "es", "fr", "de", "ar"]);

export type Source = { url: string; title: string };

export type AskResult =
  | { ok: true; answer: string; speech: string; sources: Source[]; usedWeb: boolean }
  | { ok: false; error: string };

export type NarrateResult = { ok: true; audioBase64: string } | { ok: false; error: string };

type OutputItem = {
  type?: string;
  action?: { sources?: Array<{ url?: string; title?: string }> };
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ type?: string; url?: string; title?: string }>;
  }>;
};

export const askBook = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Ask a question about the book.");
    const o = input as Record<string, unknown>;
    const question = typeof o.question === "string" ? o.question.trim() : "";
    const excerpt = typeof o.excerpt === "string" ? o.excerpt.trim() : "";
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 180) : "Untitled";
    if (question.length < 2 || question.length > 500) {
      throw new Error("Keep the question to a sentence or two.");
    }
    if (excerpt.length < 1 || excerpt.length > 12000) {
      throw new Error("That passage is too long to send.");
    }
    return { question, excerpt, title };
  })
  .handler(async ({ data }): Promise<AskResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Answers are not available right now. Reading still works." };

    try {
      const res = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(35000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          instructions: [
            "You are Marginalia, sitting with someone who paused a book to ask a question.",
            "Answer in two to four spoken sentences. No markdown, no bullet lists, no headings, and no URLs in the prose.",
            "Use the passages from the book first. If they answer the question, do not use web search.",
            "If the passages do not contain the answer, or the question is about the world outside the book, use web search and say what you found in plain speech.",
            "Never invent scenes, characters, or facts that are not in the passages or the search results.",
            "If you still do not know, say so in one sentence.",
          ].join(" "),
          input: [
            {
              role: "user",
              content: `Book title: ${data.title}\n\nPassages from the book:\n${data.excerpt}\n\nQuestion: ${data.question}`,
            },
          ],
          tools: [{ type: "web_search" }],
          reasoning: { effort: "low" },
          max_output_tokens: 700,
          temperature: 0.3,
        }),
      });
      if (!res.ok) return { ok: false, error: "Could not look that up just now. Try again." };
      const body = (await res.json()) as {
        output?: OutputItem[];
        usage?: { num_server_side_tools_used?: number };
      };
      const parsed = parseOutput(body);
      if (!parsed.speech) return { ok: false, error: "No answer came back. Try asking again." };
      return { ok: true, ...parsed };
    } catch {
      return { ok: false, error: "Could not look that up just now. Try again." };
    }
  });

export const narrate = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Nothing to read.");
    const o = input as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.replace(/\s+/g, " ").trim() : "";
    const voice = typeof o.voice === "string" ? o.voice : "eve";
    const language = typeof o.language === "string" ? o.language : "en";
    if (text.length < 1 || text.length > 900) throw new Error("That passage is too long to speak at once.");
    if (!VOICES.has(voice)) throw new Error("Unknown voice.");
    if (!LANGS.has(language)) throw new Error("Unknown language.");
    return { text, voice, language };
  })
  .handler(async ({ data }): Promise<NarrateResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Voice is not available." };
    try {
      const res = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text: data.text,
          voice_id: data.voice,
          language: data.language,
        }),
      });
      if (!res.ok) return { ok: false, error: "The voice could not read that just now." };
      const audioBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      if (!audioBase64) return { ok: false, error: "The voice came back empty." };
      return { ok: true, audioBase64 };
    } catch {
      return { ok: false, error: "The voice could not read that just now." };
    }
  });

function parseOutput(body: {
  output?: OutputItem[];
  usage?: { num_server_side_tools_used?: number };
}): { answer: string; speech: string; sources: Source[]; usedWeb: boolean } {
  const cited: Source[] = [];
  const searched: Source[] = [];
  const seen = new Set<string>();
  const texts: string[] = [];
  const push = (list: Source[], url?: string, title?: string) => {
    if (!url || !/^https?:\/\//.test(url)) return;
    const clean = url.replace(/[),.;]+$/, "");
    if (seen.has(clean)) return;
    seen.add(clean);
    let label = title && !/^\d+$/.test(title) ? title : "";
    if (!label) {
      try {
        label = new URL(clean).hostname.replace(/^www\./, "");
      } catch {
        label = "Source";
      }
    }
    list.push({ url: clean, title: label.slice(0, 120) });
  };

  for (const item of body.output ?? []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources ?? []) push(searched, source.url, source.title);
    }
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) texts.push(part.text);
        for (const note of part.annotations ?? []) {
          if (note.type === "url_citation") push(cited, note.url, note.title);
        }
      }
    }
  }

  const speech = texts
    .join(" ")
    .replace(/\[\[\d+\]\]\([^)]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sources = (cited.length ? cited : searched).slice(0, 4);
  const usedWeb = sources.length > 0 || (body.usage?.num_server_side_tools_used ?? 0) > 0;
  return { answer: speech, speech, sources, usedWeb };
}
