import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

type Glyph = { str?: string; transform?: number[]; width?: number };

export async function extractPdfText(
  data: Uint8Array,
  onPage: (page: number, total: number) => void,
): Promise<{ title: string; text: string; pages: number }> {
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const total = doc.numPages;
  let title = "";
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Title?: string };
    if (info?.Title && info.Title !== "undefined") title = String(info.Title).trim();
  } catch {
    title = "";
  }

  const pages: string[] = [];
  for (let i = 1; i <= total; i++) {
    onPage(i, total);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = pageToText(content.items as Glyph[]);
    if (text) pages.push(text);
  }
  await doc.destroy();
  return { title, text: pages.join("\n\n"), pages: total };
}

function pageToText(items: Glyph[]): string {
  const rows: { y: number; parts: { x: number; s: string; w: number }[] }[] = [];
  for (const item of items) {
    if (!item?.str || !item.transform) continue;
    const s = item.str;
    if (!s.trim()) continue;
    const y = item.transform[5] ?? 0;
    const x = item.transform[4] ?? 0;
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, s, w: item.width ?? 0 });
  }
  rows.sort((a, b) => b.y - a.y);

  const blocks: string[] = [];
  let lines: string[] = [];
  let prevY: number | null = null;
  const pushBlock = () => {
    const block = lines.join("\n").trim();
    if (block && !/^\d{1,4}$/.test(block)) blocks.push(block);
    lines = [];
  };

  for (const row of rows) {
    if (prevY != null && prevY - row.y > 16 && lines.length) pushBlock();
    row.parts.sort((a, b) => a.x - b.x);
    let line = "";
    let cursor = 0;
    for (const part of row.parts) {
      if (line && part.x - cursor > 1.8 && !line.endsWith(" ") && !line.endsWith("-") && !part.s.startsWith(" ")) {
        line += " ";
      }
      line += part.s;
      cursor = part.x + part.w;
    }
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (trimmed && !/^\d{1,4}$/.test(trimmed)) lines.push(trimmed);
    prevY = row.y;
  }
  pushBlock();
  return blocks.join("\n\n");
}
