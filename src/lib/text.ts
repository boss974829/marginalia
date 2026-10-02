const MAX = 420;

export function chunkPassage(raw: string): string[] {
  const text = raw
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 1 && !/^\d{1,4}$/.test(p));

  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const paragraph of paragraphs) {
    for (const sentence of splitSentences(paragraph)) {
      if (sentence.length > MAX) {
        flush();
        for (let i = 0; i < sentence.length; i += MAX) {
          const piece = sentence.slice(i, i + MAX).trim();
          if (piece) chunks.push(piece);
        }
        continue;
      }
      if (!buf) {
        buf = sentence;
        continue;
      }
      if (buf.length + 1 + sentence.length <= MAX) buf = `${buf} ${sentence}`;
      else {
        flush();
        buf = sentence;
      }
    }
    if (buf.length > 240) flush();
  }
  flush();
  return chunks;
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?]["”']?)\s+(?=[A-Z“"'])/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function buildExcerpt(chunks: string[], cursor: number, question: string): string {
  const parts: string[] = [];
  const used = new Set<number>();
  const add = (i: number, label: string) => {
    if (i < 0 || i >= chunks.length || used.has(i)) return;
    used.add(i);
    parts.push(`${label}\n${chunks[i]}`);
  };
  add(cursor, "Current passage:");
  add(cursor - 1, "Just before:");
  add(cursor + 1, "Coming next:");

  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f']+/i)
    .filter((w) => w.length > 3);
  if (terms.length) {
    const ranked = chunks
      .map((c, i) => ({
        i,
        score: terms.reduce((n, t) => n + (c.toLowerCase().includes(t) ? 1 : 0), 0),
      }))
      .filter((r) => r.score > 0 && !used.has(r.i))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const r of ranked) add(r.i, "Elsewhere in the book:");
  }

  let out = "";
  for (const p of parts) {
    if (out.length + p.length + 2 > 11000) break;
    out = out ? `${out}\n\n${p}` : p;
  }
  return out;
}
