import { useEffect, useRef, useState } from "react";
import { ChevronLeft, LoaderCircle, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { AskSheet } from "@/components/ask-sheet";
import { Shelf } from "@/components/shelf";
import { askBook, type Source } from "@/lib/grok.functions";
import {
  LANGS,
  VOICES,
  deleteBook,
  getCursor,
  getPrefs,
  listShelf,
  loadBook,
  saveBook,
  savePrefs,
  setCursor,
  type LangId,
  type ShelfItem,
  type StoredBook,
  type VoiceId,
} from "@/lib/library";
import { Narrator } from "@/lib/narrator";
import { SAMPLE_ID, SAMPLE_TEXT, SAMPLE_TITLE } from "@/lib/sample";
import { buildExcerpt, chunkPassage } from "@/lib/text";

type PlayState = "idle" | "loading" | "playing" | "paused";
type AskState = "idle" | "thinking" | "speaking";

const RATES = [0.85, 1, 1.15, 1.35];

export function ReaderApp() {
  const [view, setView] = useState<"shelf" | "importing" | "reader">("shelf");
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [book, setBook] = useState<StoredBook | null>(null);
  const [cursor, setCursorState] = useState(0);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [voice, setVoice] = useState<VoiceId>("eve");
  const [language, setLanguage] = useState<LangId>("en");
  const [rate, setRate] = useState(1);
  const [importing, setImporting] = useState({ page: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [deviceNote, setDeviceNote] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [listening, setListening] = useState(false);
  const [askState, setAskState] = useState<AskState>("idle");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [usedWeb, setUsedWeb] = useState(false);
  const [stay, setStay] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const narratorRef = useRef<Narrator | null>(null);
  const runRef = useRef(0);
  const askRef = useRef(0);
  const bookRef = useRef<StoredBook | null>(null);
  const cursorRef = useRef(0);
  const playRef = useRef<PlayState>("idle");
  const voiceRef = useRef<VoiceId>("eve");
  const langRef = useRef<LangId>("en");
  const rateRef = useRef(1);
  const stayRef = useRef(false);
  const prefsReady = useRef(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    bookRef.current = book;
  }, [book]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    playRef.current = playState;
  }, [playState]);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    langRef.current = language;
  }, [language]);
  useEffect(() => {
    rateRef.current = rate;
    narratorRef.current?.setRate(rate);
  }, [rate]);
  useEffect(() => {
    stayRef.current = stay;
  }, [stay]);

  useEffect(() => {
    const prefs = getPrefs();
    setVoice(prefs.voice);
    setLanguage(prefs.language);
    setRate(prefs.rate);
    setItems(listShelf());
    prefsReady.current = true;
    const narrator = new Narrator();
    narratorRef.current = narrator;
    return () => {
      narrator.dispose();
      narratorRef.current = null;
      recRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!prefsReady.current) return;
    savePrefs({ voice, rate, language });
  }, [voice, rate, language]);

  useEffect(() => {
    if (!book) return;
    setCursor(book.id, cursor);
  }, [book, cursor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT")) {
        return;
      }
      if (event.key === " " && view === "reader") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function remember(index: number) {
    cursorRef.current = index;
    setCursorState(index);
  }

  async function playFrom(index: number) {
    const current = bookRef.current;
    const narrator = narratorRef.current;
    if (!current || !narrator) return;
    const run = ++runRef.current;
    const nextIndex = Math.max(0, Math.min(current.chunks.length - 1, index));
    remember(nextIndex);
    const chunk = current.chunks[nextIndex];
    if (!chunk) {
      setPlayState("paused");
      return;
    }
    setPlayState("loading");
    setError(null);
    const upcoming = current.chunks[nextIndex + 1];
    if (upcoming) narrator.warm(upcoming, voiceRef.current, langRef.current);
    narrator.setRate(rateRef.current);
    const wasDevice = narrator.deviceVoice;
    const result = await narrator.speak(chunk, voiceRef.current, langRef.current, () => {
      if (run === runRef.current) setPlayState("playing");
    });
    if (run !== runRef.current) return;
    if (!wasDevice && narrator.deviceVoice) setDeviceNote(true);
    if (result === "ended") {
      if (nextIndex + 1 < current.chunks.length) void playFrom(nextIndex + 1);
      else setPlayState("paused");
    } else if (result === "blocked") {
      setPlayState("paused");
      setError("Tap play to keep the voice going.");
    } else {
      setPlayState("paused");
    }
  }

  function toggle() {
    narratorRef.current?.unlock();
    if (playRef.current === "playing" || playRef.current === "loading") {
      runRef.current++;
      narratorRef.current?.stop();
      setPlayState("paused");
      return;
    }
    askRef.current++;
    setAskOpen(false);
    setAskState("idle");
    void playFrom(cursorRef.current);
  }

  function skip(delta: number) {
    const current = bookRef.current;
    if (!current) return;
    narratorRef.current?.unlock();
    const wasPlaying = playRef.current === "playing" || playRef.current === "loading";
    const next = Math.max(0, Math.min(current.chunks.length - 1, cursorRef.current + delta));
    remember(next);
    if (wasPlaying) void playFrom(next);
    else {
      runRef.current++;
      narratorRef.current?.stop();
      setPlayState("paused");
    }
  }

  async function openStored(stored: StoredBook, at?: number) {
    await saveBook(stored);
    setItems(listShelf());
    setBook(stored);
    const start = at ?? Math.min(getCursor(stored.id), Math.max(0, stored.chunks.length - 1));
    remember(start);
    setPlayState("paused");
    setError(null);
    setAnswer("");
    setView("reader");
  }

  async function openSample() {
    setError(null);
    const existing = await loadBook(SAMPLE_ID).catch(() => null);
    if (existing) {
      setBook(existing);
      remember(Math.min(getCursor(existing.id), Math.max(0, existing.chunks.length - 1)));
      setView("reader");
      setItems(listShelf());
      return;
    }
    const chunks = chunkPassage(SAMPLE_TEXT);
    await openStored({ id: SAMPLE_ID, title: SAMPLE_TITLE, chunks, createdAt: Date.now() }, 0);
  }

  async function openSaved(id: string) {
    setError(null);
    const stored = await loadBook(id);
    if (!stored) {
      setItems(listShelf().filter((item) => item.id !== id));
      setError("That book is no longer on this phone.");
      return;
    }
    setBook(stored);
    remember(Math.min(getCursor(id), Math.max(0, stored.chunks.length - 1)));
    setPlayState("paused");
    setView("reader");
  }

  async function onUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setError("That PDF is over 40 MB. Try a smaller one.");
      return;
    }
    setError(null);
    setView("importing");
    setImporting({ page: 0, total: 0 });
    try {
      const { extractPdfText } = await import("@/lib/pdf-text");
      const data = new Uint8Array(await file.arrayBuffer());
      const extracted = await extractPdfText(data, (page, total) => setImporting({ page, total }));
      const letters = extracted.text.replace(/\s/g, "").length;
      if (letters < 12) {
        setView("shelf");
        setError("This PDF looks scanned, so there is almost no text to read. Use a digital PDF.");
        return;
      }
      const chunks = chunkPassage(extracted.text);
      if (!chunks.length) {
        setView("shelf");
        setError("No readable text turned up in that PDF.");
        return;
      }
      const title = cleanTitle(extracted.title) || file.name.replace(/\.pdf$/i, "");
      await openStored(
        { id: crypto.randomUUID(), title, chunks, createdAt: Date.now() },
        0,
      );
    } catch {
      setView("shelf");
      setError("That PDF could not be opened. Try another file.");
    }
  }

  async function onRemove(id: string) {
    await deleteBook(id);
    setItems(listShelf());
    if (bookRef.current?.id === id) {
      runRef.current++;
      narratorRef.current?.stop();
      setBook(null);
      setView("shelf");
    }
  }

  function goShelf() {
    askRef.current++;
    runRef.current++;
    narratorRef.current?.stop();
    recRef.current?.stop();
    setPlayState("paused");
    setAskOpen(false);
    setAskState("idle");
    setListening(false);
    setView("shelf");
    setItems(listShelf());
  }

  function resumeBook() {
    askRef.current++;
    setAskOpen(false);
    setAskState("idle");
    setAskError(null);
    narratorRef.current?.unlock();
    void playFrom(cursorRef.current);
  }

  async function submitQuestion() {
    const current = bookRef.current;
    const q = question.trim();
    if (!current || q.length < 2) return;
    const token = ++askRef.current;
    runRef.current++;
    narratorRef.current?.stop();
    narratorRef.current?.unlock();
    setPlayState("paused");
    setAskState("thinking");
    setAskError(null);
    setAnswer("");
    setSources([]);
    try {
      const excerpt = buildExcerpt(current.chunks, cursorRef.current, q);
      const res = await askBook({ data: { question: q, excerpt, title: current.title } });
      if (token !== askRef.current) return;
      if (!res.ok) {
        setAskState("idle");
        setAskError(res.error);
        return;
      }
      setAnswer(res.answer);
      setSources(res.sources);
      setUsedWeb(res.usedWeb);
      setAskState("speaking");
      const narrator = narratorRef.current;
      if (!narrator) return;
      narrator.setRate(rateRef.current);
      const spoken = await narrator.speak(res.speech, voiceRef.current, langRef.current, () => {
        if (token === askRef.current) setAskState("speaking");
      });
      if (token !== askRef.current) return;
      setAskState("idle");
      if (spoken !== "stopped" && !stayRef.current) {
        setAskOpen(false);
        void playFrom(cursorRef.current);
      }
    } catch (err) {
      if (token !== askRef.current) return;
      setAskState("idle");
      setAskError(err instanceof Error ? err.message : "Could not look that up just now.");
    }
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as Window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setAskError("Dictation isn’t available in this browser. Type the question instead.");
      return;
    }
    const rec = new Ctor();
    const lang = LANGS.find((item) => item.id === langRef.current);
    rec.lang = lang?.rec ?? "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i]?.[0]?.transcript ?? "";
      setQuestion(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    setAskError(null);
    try {
      rec.start();
    } catch {
      setListening(false);
      setAskError("The microphone didn’t start. Type the question instead.");
    }
  }

  return (
    <main className="relative mx-auto flex h-dvh max-w-lg flex-col bg-bg text-fg">
      {view === "shelf" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {error ? <p className="px-6 pt-4 text-sm text-brass-bright">{error}</p> : null}
          <div className="min-h-0 flex-1">
            <Shelf
              items={items}
              onUpload={onUpload}
              onSample={() => void openSample()}
              onOpen={(id) => void openSaved(id)}
              onRemove={(id) => void onRemove(id)}
            />
          </div>
        </div>
      ) : null}

      {view === "importing" ? (
        <section className="flex flex-1 flex-col justify-center px-6">
          <p className="kicker text-xs font-medium text-brass uppercase">Opening the pages</p>
          <h1 className="mt-3 font-serif text-4xl text-fg">Reading the PDF</h1>
          <p className="mt-3 text-muted tabular-nums">
            {importing.total > 0 ? `Page ${importing.page} of ${importing.total}` : "Starting"}
          </p>
          <div className="mt-6 h-0.5 overflow-hidden rounded-full bg-line">
            <div
              className="meter h-full bg-brass"
              style={{
                width: importing.total ? `${Math.round((importing.page / importing.total) * 100)}%` : "8%",
              }}
            />
          </div>
        </section>
      ) : null}

      {view === "reader" && book ? (
        <Reader
          book={book}
          cursor={cursor}
          playState={playState}
          voice={voice}
          language={language}
          rate={rate}
          error={error}
          deviceNote={deviceNote}
          answer={answer}
          onBack={goShelf}
          onToggle={toggle}
          onSkip={skip}
          onScrub={(index) => {
            const was = playRef.current === "playing" || playRef.current === "loading";
            remember(index);
            if (was) void playFrom(index);
          }}
          onVoice={(value) => setVoice(value)}
          onLanguage={(value) => setLanguage(value)}
          onRate={() => {
            const i = RATES.indexOf(rate);
            setRate(RATES[(i + 1) % RATES.length] ?? 1);
          }}
          onAsk={() => {
            runRef.current++;
            narratorRef.current?.stop();
            setPlayState("paused");
            setAskOpen(true);
            setAskError(null);
          }}
          onReview={() => setAskOpen(true)}
        />
      ) : null}

      <AskSheet
        open={askOpen && view === "reader"}
        question={question}
        listening={listening}
        askState={askState}
        answer={answer}
        sources={sources}
        usedWeb={usedWeb}
        stay={stay}
        error={askError}
        onQuestion={setQuestion}
        onClose={() => {
          if (askState === "idle") setAskOpen(false);
          else resumeBook();
        }}
        onAsk={() => void submitQuestion()}
        onMic={toggleMic}
        onStay={setStay}
        onResume={resumeBook}
      />
    </main>
  );
}

function Reader({
  book,
  cursor,
  playState,
  voice,
  language,
  rate,
  error,
  deviceNote,
  answer,
  onBack,
  onToggle,
  onSkip,
  onScrub,
  onVoice,
  onLanguage,
  onRate,
  onAsk,
  onReview,
}: {
  book: StoredBook;
  cursor: number;
  playState: PlayState;
  voice: VoiceId;
  language: LangId;
  rate: number;
  error: string | null;
  deviceNote: boolean;
  answer: string;
  onBack: () => void;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onScrub: (index: number) => void;
  onVoice: (voice: VoiceId) => void;
  onLanguage: (language: LangId) => void;
  onRate: () => void;
  onAsk: () => void;
  onReview: () => void;
}) {
  const passage = book.chunks[cursor] ?? "";
  const upcoming = book.chunks[cursor + 1];
  const active = playState === "playing" || playState === "loading";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 px-3 pt-3">
        <button
          type="button"
          className="tap grid size-12 place-items-center rounded-full text-fg"
          aria-label="Back to shelf"
          onClick={onBack}
        >
          <ChevronLeft className="size-6" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg">{book.title}</p>
          <p className="text-sm text-muted tabular-nums">
            Passage {cursor + 1} of {book.chunks.length}
          </p>
        </div>
      </header>

      <div className="flex gap-2 px-4 pt-2">
        <label className="sr-only" htmlFor="voice">
          Voice
        </label>
        <select
          id="voice"
          value={voice}
          className="h-11 flex-1 rounded-full bg-surface px-3 text-sm text-fg"
          onChange={(event) => onVoice(event.target.value as VoiceId)}
        >
          {VOICES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="language">
          Language
        </label>
        <select
          id="language"
          value={language}
          className="h-11 flex-1 rounded-full bg-surface px-3 text-sm text-fg"
          onChange={(event) => onLanguage(event.target.value as LangId)}
        >
          {LANGS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <article className="min-h-0 flex-1 overflow-y-auto px-6 pt-8 pb-6">
        <p className="kicker text-xs font-medium text-brass uppercase">Now reading</p>
        <p className="mt-4 font-serif text-2xl leading-relaxed text-pretty text-fg">{passage}</p>
        {upcoming ? (
          <p className="mt-8 line-clamp-3 text-base leading-relaxed text-muted">{upcoming}</p>
        ) : (
          <p className="mt-8 text-base text-muted">End of the book.</p>
        )}
      </article>

      {answer ? (
        <button type="button" className="mx-4 mb-2 truncate rounded-full bg-surface px-4 py-2 text-left text-sm text-brass-bright" onClick={onReview}>
          Last answer · {answer}
        </button>
      ) : null}
      {error ? <p className="px-5 pb-2 text-sm text-brass-bright">{error}</p> : null}
      {deviceNote ? (
        <p className="px-5 pb-2 text-sm text-muted">Using this phone’s voice for the rest of the session.</p>
      ) : null}

      <footer className="dock border-t border-line px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="w-10 text-xs text-muted tabular-nums">{cursor + 1}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, book.chunks.length - 1)}
            value={cursor}
            aria-label="Reading position"
            onChange={(event) => onScrub(Number(event.target.value))}
          />
          <span className="w-10 text-right text-xs text-muted tabular-nums">{book.chunks.length}</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-3">
          <button
            type="button"
            className="tap grid size-12 place-items-center rounded-full border border-line text-fg"
            aria-label="Previous passage"
            onClick={() => onSkip(-1)}
          >
            <SkipBack className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="tap relative grid size-16 place-items-center rounded-full bg-brass text-ink"
            aria-label={active ? "Pause" : "Play"}
            onClick={onToggle}
          >
            <span className="relative grid size-7 place-items-center">
            <Play
              className="icon-swap absolute inset-0 m-auto size-7"
              data-on={playState === "paused" || playState === "idle" ? "true" : "false"}
              strokeWidth={1.75}
            />
            <Pause
              className="icon-swap absolute inset-0 m-auto size-7"
              data-on={playState === "playing" ? "true" : "false"}
              strokeWidth={1.75}
            />
            <LoaderCircle
              className={["icon-swap absolute inset-0 m-auto size-7", playState === "loading" ? "spin" : ""].join(" ")}
              data-on={playState === "loading" ? "true" : "false"}
              strokeWidth={1.75}
            />
            </span>
          </button>
          <button
            type="button"
            className="tap grid size-12 place-items-center rounded-full border border-line text-fg"
            aria-label="Next passage"
            onClick={() => onSkip(1)}
          >
            <SkipForward className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="tap h-12 min-w-12 rounded-full border border-line px-3 text-sm font-medium text-fg tabular-nums"
            aria-label="Reading speed"
            onClick={onRate}
          >
            {rate}×
          </button>
        </div>
        <button
          type="button"
          className="tap mt-3 flex h-12 w-full items-center justify-center rounded-full bg-raised font-medium text-fg"
          onClick={onAsk}
        >
          Ask this book
        </button>
      </footer>
    </div>
  );
}

function cleanTitle(title: string): string {
  return title.replace(/\0/g, "").replace(/\s+/g, " ").trim();
}

type RecognitionResult = { results: Array<Array<{ transcript: string }> | undefined> };

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionResult) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
