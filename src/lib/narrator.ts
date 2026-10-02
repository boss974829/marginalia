import { narrate } from "@/lib/grok.functions";

function silentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 160;
  const dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export class Narrator {
  readonly audio: HTMLAudioElement;
  private cache = new Map<string, string>();
  private urls: string[] = [];
  private token = 0;
  private rate = 1;
  private cancelPlayback: (() => void) | null = null;
  deviceVoice = false;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.src = silentWavUrl();
  }

  setRate(rate: number) {
    this.rate = rate;
    this.audio.playbackRate = rate;
  }

  unlock() {
    this.audio.playbackRate = this.rate;
    void this.audio.play().catch(() => undefined);
  }

  stop() {
    this.token++;
    this.cancelPlayback?.();
    this.cancelPlayback = null;
    this.audio.onended = null;
    this.audio.onerror = null;
    this.audio.onplaying = null;
    this.audio.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  warm(text: string, voice: string, language: string) {
    if (this.deviceVoice) return;
    void this.load(text, voice, language).catch(() => undefined);
  }

  async speak(
    text: string,
    voice: string,
    language: string,
    onStart?: () => void,
  ): Promise<"ended" | "stopped" | "blocked"> {
    const token = ++this.token;
    this.cancelPlayback?.();
    this.cancelPlayback = null;
    this.audio.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();

    if (!this.deviceVoice) {
      try {
        const url = await this.load(text, voice, language);
        if (token !== this.token) return "stopped";
        await this.playUrl(url, token, onStart);
        return token === this.token ? "ended" : "stopped";
      } catch (err) {
        if (token !== this.token) return "stopped";
        if (!(err instanceof Error && err.message === "blocked")) this.deviceVoice = true;
      }
    }

    if (token !== this.token) return "stopped";
    onStart?.();
    return this.speakBrowser(text, token);
  }

  dispose() {
    this.stop();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    this.cache.clear();
  }

  private async playUrl(url: string, token: number, onStart?: () => void): Promise<void> {
    const audio = this.audio;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer = 0;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        this.cancelPlayback = null;
        window.clearTimeout(timer);
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
        fn();
      };
      this.cancelPlayback = () => finish(resolve);
      audio.onended = () => finish(resolve);
      audio.onerror = () => finish(() => reject(new Error("audio")));
      audio.onplaying = () => {
        audio.playbackRate = this.rate;
        onStart?.();
        const seconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 40;
        timer = window.setTimeout(() => finish(resolve), seconds * 1000 + 2500);
      };
      audio.src = url;
      audio.playbackRate = this.rate;
      void audio.play().catch(() => finish(() => reject(new Error("blocked"))));
    });
    if (token !== this.token) return;
  }

  private speakBrowser(text: string, token: number): Promise<"ended" | "stopped" | "blocked"> {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve("blocked");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.min(1.5, Math.max(0.75, this.rate));
      let settled = false;
      const finish = (result: "ended" | "stopped") => {
        if (settled) return;
        settled = true;
        this.cancelPlayback = null;
        window.clearTimeout(timer);
        resolve(token === this.token ? result : "stopped");
      };
      this.cancelPlayback = () => finish("stopped");
      utterance.onend = () => finish("ended");
      utterance.onerror = () => finish("stopped");
      const timer = window.setTimeout(() => finish("ended"), Math.min(45000, text.length * 80 + 4000));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  private async load(text: string, voice: string, language: string): Promise<string> {
    const key = `${voice}|${language}|${text}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const res = await narrate({ data: { text, voice, language } });
    if (!res.ok) throw new Error(res.error);
    const binary = atob(res.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    this.urls.push(url);
    this.cache.set(key, url);
    return url;
  }
}
