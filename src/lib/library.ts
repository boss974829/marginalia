export const VOICES = [
  { id: "eve", label: "Eve" },
  { id: "ara", label: "Ara" },
  { id: "leo", label: "Leo" },
  { id: "helios", label: "Helios" },
] as const;

export const LANGS = [
  { id: "en", label: "English", rec: "en-US" },
  { id: "hi", label: "Hindi", rec: "hi-IN" },
  { id: "es", label: "Spanish", rec: "es-ES" },
  { id: "fr", label: "French", rec: "fr-FR" },
  { id: "de", label: "German", rec: "de-DE" },
  { id: "ar", label: "Arabic", rec: "ar" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];
export type LangId = (typeof LANGS)[number]["id"];

export type ShelfItem = {
  id: string;
  title: string;
  count: number;
  updatedAt: number;
};

export type StoredBook = {
  id: string;
  title: string;
  chunks: string[];
  createdAt: number;
};

export type Prefs = {
  voice: VoiceId;
  rate: number;
  language: LangId;
};

const META = "marginalia.shelf";
const PREFS = "marginalia.prefs";
const DEFAULT_PREFS: Prefs = { voice: "eve", rate: 1, language: "en" };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listShelf(): ShelfItem[] {
  const items = readJson<ShelfItem[]>(META, []);
  return Array.isArray(items) ? items : [];
}

function writeShelf(items: ShelfItem[]) {
  localStorage.setItem(META, JSON.stringify(items));
}

export function getPrefs(): Prefs {
  const prefs = readJson<Prefs>(PREFS, DEFAULT_PREFS);
  const voice = VOICES.some((v) => v.id === prefs.voice) ? prefs.voice : DEFAULT_PREFS.voice;
  const language = LANGS.some((l) => l.id === prefs.language) ? prefs.language : DEFAULT_PREFS.language;
  const rate = typeof prefs.rate === "number" ? prefs.rate : 1;
  return { voice, language, rate };
}

export function savePrefs(prefs: Prefs) {
  localStorage.setItem(PREFS, JSON.stringify(prefs));
}

export function getCursor(id: string): number {
  const n = Number(localStorage.getItem(`marginalia.cursor.${id}`) ?? "0");
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function setCursor(id: string, index: number) {
  localStorage.setItem(`marginalia.cursor.${id}`, String(index));
  const items = listShelf();
  const next = items.map((item) => (item.id === id ? { ...item, updatedAt: Date.now() } : item));
  writeShelf(next);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("marginalia", 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains("books")) {
        database.createObjectStore("books", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the shelf."));
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const tx = database.transaction("books", mode);
        const req = fn(tx.objectStore("books"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("The shelf could not be saved."));
      }),
  );
}

export async function saveBook(book: StoredBook): Promise<void> {
  await withStore("readwrite", (store) => store.put(book));
  const items = listShelf().filter((item) => item.id !== book.id);
  items.unshift({
    id: book.id,
    title: book.title,
    count: book.chunks.length,
    updatedAt: Date.now(),
  });
  writeShelf(items);
}

export function loadBook(id: string): Promise<StoredBook | null> {
  return withStore<StoredBook | undefined>("readonly", (store) => store.get(id)).then((book) => book ?? null);
}

export async function deleteBook(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  writeShelf(listShelf().filter((item) => item.id !== id));
  localStorage.removeItem(`marginalia.cursor.${id}`);
}
