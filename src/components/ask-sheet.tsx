import { ArrowUp, Mic, X } from "lucide-react";
import type { Source } from "@/lib/grok.functions";

const CHIPS = ["Who is this about?", "Explain this passage", "What just happened?"];

export function AskSheet({
  open,
  question,
  listening,
  askState,
  answer,
  sources,
  usedWeb,
  stay,
  error,
  onQuestion,
  onClose,
  onAsk,
  onMic,
  onStay,
  onResume,
}: {
  open: boolean;
  question: string;
  listening: boolean;
  askState: "idle" | "thinking" | "speaking";
  answer: string;
  sources: Source[];
  usedWeb: boolean;
  stay: boolean;
  error: string | null;
  onQuestion: (value: string) => void;
  onClose: () => void;
  onAsk: () => void;
  onMic: () => void;
  onStay: (value: boolean) => void;
  onResume: () => void;
}) {
  return (
    <div
      className={[
        "absolute inset-0 z-20 flex flex-col justify-end bg-ink/55 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none hidden opacity-0",
      ].join(" ")}
      inert={open ? undefined : true}
    >
      <button type="button" className="min-h-16 flex-1" aria-label="Close question" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-title"
        className={[
          "ask-panel overflow-y-auto rounded-t-3xl border border-line bg-surface px-5 pt-4 transition-transform duration-200",
          open ? "translate-y-0" : "translate-y-8",
        ].join(" ")}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="ask-title" className="font-serif text-2xl text-fg">
              Ask the book
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              It looks at these pages first, then the web if the book is silent.
            </p>
          </div>
          <button
            type="button"
            className="tap grid size-11 shrink-0 place-items-center rounded-full bg-raised text-fg"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex gap-2">
          <label className="sr-only" htmlFor="question">
            Question
          </label>
          <textarea
            id="question"
            rows={3}
            value={question}
            placeholder="Ask in your own words"
            className="min-h-24 flex-1 resize-none rounded-2xl border border-line bg-raised px-4 py-3 text-base leading-relaxed text-fg placeholder:text-muted"
            onChange={(event) => onQuestion(event.target.value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="tap h-10 rounded-full bg-raised px-3 text-sm text-fg"
              onClick={() => onQuestion(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={[
              "tap grid size-12 place-items-center rounded-full border border-line",
              listening ? "bg-brass text-ink" : "bg-raised text-fg",
            ].join(" ")}
            aria-label={listening ? "Stop dictation" : "Dictate a question"}
            aria-pressed={listening}
            onClick={onMic}
          >
            <Mic className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="tap flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brass font-medium text-ink disabled:opacity-50"
            disabled={askState !== "idle" || question.trim().length < 2}
            onClick={onAsk}
          >
            <ArrowUp className="size-5" strokeWidth={1.75} />
            {askState === "thinking" ? "Looking it up" : askState === "speaking" ? "Answering" : "Ask"}
          </button>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            className="size-5 accent-brass"
            checked={stay}
            onChange={(event) => onStay(event.target.checked)}
          />
          Stay on the answer instead of reading on
        </label>

        {error ? <p className="mt-3 text-sm leading-relaxed text-brass-bright">{error}</p> : null}

        {answer ? (
          <div className="mt-4 rounded-2xl bg-bg px-4 py-4">
            <p className="kicker text-xs font-medium text-brass uppercase">
              {usedWeb ? "From the book and the web" : "From the book"}
            </p>
            <p className="mt-2 font-serif text-lg leading-relaxed text-pretty text-fg">{answer}</p>
            {sources.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1">
                {sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="block truncate text-sm text-brass-bright underline decoration-line underline-offset-4"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="tap mt-4 h-12 w-full rounded-full bg-brass font-medium text-ink"
              onClick={onResume}
            >
              Keep reading
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
