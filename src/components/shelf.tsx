import { BookOpen, Upload } from "lucide-react";
import type { ShelfItem } from "@/lib/library";

export function Shelf({
  items,
  onUpload,
  onSample,
  onOpen,
  onRemove,
}: {
  items: ShelfItem[];
  onUpload: (file: File) => void;
  onSample: () => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="px-6 pt-10">
        <p className="rise kicker text-xs font-medium text-brass uppercase">Night reading</p>
        <h1 className="rise-2 mt-3 font-serif text-5xl leading-none font-medium tracking-tight text-balance text-fg">
          Marginalia
        </h1>
        <p className="rise-3 mt-4 max-w-sm text-base leading-relaxed text-pretty text-muted">
          Open a PDF and it reads aloud. Ask anything — it answers from the book, and from the web when the
          pages don’t — then continues where it stopped.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-3 px-6">
        <label className="tap flex h-14 items-center justify-center gap-2 rounded-full bg-brass px-5 font-medium text-ink">
          <Upload className="size-5" strokeWidth={1.75} aria-hidden="true" />
          Open a PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
        <button
          type="button"
          className="tap h-14 rounded-full border border-line bg-surface font-medium text-fg"
          onClick={onSample}
        >
          Hear a sample chapter
        </button>
      </div>

      {items.length > 0 ? (
        <section className="mt-10 px-6">
          <h2 className="kicker text-xs font-medium text-muted uppercase">On the shelf</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  className="tap flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left"
                  onClick={() => onOpen(item.id)}
                >
                  <BookOpen className="size-5 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-muted tabular-nums">
                      {item.count} {item.count === 1 ? "passage" : "passages"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="tap rounded-2xl px-3 text-sm text-muted"
                  onClick={() => onRemove(item.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-auto px-6 pt-10 pb-8 text-sm leading-relaxed text-muted">
        On Android, open the browser menu and choose Add to Home screen. Marginalia then opens full screen,
        like an app you installed.
      </p>
    </div>
  );
}
