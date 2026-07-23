import fs from "fs/promises";
import path from "path";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { GoogleGenAI } from "@google/genai";
import type { ExtractionResult, TextBlock, ExtractedImage } from "./types.js";

const require = createRequire(import.meta.url);
const PDF_IMAGE_OBJECT_TIMEOUT_MS = 1500;
const PDF_IMAGE_EXTRACTION_TIMEOUT_MS = 45_000;
const MAX_PDF_IMAGES = 60;

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeBlocks(raw: string): string[] {
  return raw
    .split(/\n{2,}/)
    .flatMap((part) => part.split(/\n/))
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function relationshipMap(xml: string, baseDir: string): Map<string, string> {
  const relationships = new Map<string, string>();
  for (const match of xml.matchAll(
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>(?:<\/Relationship>)?/g,
  )) {
    relationships.set(match[1], path.posix.normalize(path.posix.join(baseDir, match[2])));
  }
  return relationships;
}

function nearestTextIndex(textBlocks: TextBlock[], pageNum?: number): number | undefined {
  for (let i = textBlocks.length - 1; i >= 0; i -= 1) {
    if (pageNum === undefined || textBlocks[i].pageNum === pageNum) return textBlocks[i].index;
  }
  return textBlocks.at(-1)?.index;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function parseFile(
  filePath: string,
  _mimeType: string,
  originalFilename: string,
): Promise<ExtractionResult> {
  const ext = path.extname(originalFilename).toLowerCase();
  if (ext === ".txt" || ext === ".md") return parseTxtMd(filePath);
  if (ext === ".pdf") return parsePdf(filePath);
  if (ext === ".docx") return parseDocx(filePath);
  if (ext === ".pptx") return parsePptx(filePath);
  throw new Error(`Unsupported file type: ${ext}`);
}

async function parseTxtMd(filePath: string): Promise<ExtractionResult> {
  const content = await fs.readFile(filePath, "utf-8");
  return {
    textBlocks: normalizeBlocks(content).map((text, index) => ({ index, text })),
    images: [],
  };
}

async function extractScannedPdfText(buffer: Buffer): Promise<TextBlock[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "This PDF appears to be scanned and requires GEMINI_API_KEY for vision-based text extraction.",
    );
  }
  if (buffer.byteLength > 18 * 1024 * 1024) {
    throw new Error(
      "This scanned PDF is too large for inline vision extraction. Please split it into files smaller than 18 MB.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Extract all visible text from this scanned lecture PDF without summarizing or omitting short labels, equations, headings, captions, or footnotes. Return JSON only in the form {\"pages\":[{\"pageNum\":1,\"blocks\":[\"...\"]}]}. Preserve reading order within each page.",
          },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json", maxOutputTokens: 16384 },
  });

  if (!response.text) throw new Error("Gemini vision returned no OCR text for the scanned PDF.");
  let parsed: { pages?: Array<{ pageNum?: number; blocks?: string[] }> };
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error("Gemini vision returned invalid OCR JSON for the scanned PDF.");
  }

  const textBlocks: TextBlock[] = [];
  for (const page of parsed.pages ?? []) {
    for (const block of page.blocks ?? []) {
      const text = block.replace(/\s+/g, " ").trim();
      if (text) textBlocks.push({ index: textBlocks.length, text, pageNum: page.pageNum });
    }
  }
  return textBlocks;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function rawPdfImageToPng(image: {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}): string | null {
  const pixelCount = image.width * image.height;
  if (!pixelCount || pixelCount > 25_000_000) return null;
  const channels = image.data.length / pixelCount;
  if (![1, 3, 4].includes(channels)) return null;

  const scanlines = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (image.width * 4 + 1);
    for (let x = 0; x < image.width; x += 1) {
      const pixel = y * image.width + x;
      const src = pixel * channels;
      const dst = rowOffset + 1 + x * 4;
      const value = image.data[src];
      scanlines[dst] = channels === 1 ? value : image.data[src];
      scanlines[dst + 1] = channels === 1 ? value : image.data[src + 1];
      scanlines[dst + 2] = channels === 1 ? value : image.data[src + 2];
      scanlines[dst + 3] = channels === 4 ? image.data[src + 3] : 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

async function getPdfImageObject(page: any, objectName: string): Promise<any | null> {
  return withTimeout(
    new Promise<any | null>((resolve) => {
      try {
        page.objs.get(objectName, (value: unknown) => resolve(value ?? null));
      } catch {
        resolve(null);
      }
    }),
    PDF_IMAGE_OBJECT_TIMEOUT_MS,
    null,
  );
}

async function extractPdfImagesInternal(
  buffer: Buffer,
  textBlocks: TextBlock[],
): Promise<ExtractedImage[]> {
  type PdfLoadingOptions = {
    data: Uint8Array;
    disableFontFace: boolean;
    nativeImageDecoderSupport: "none";
    isEvalSupported: boolean;
    disableWorker: boolean;
  };
  const pdfjs = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js") as {
    getDocument: (options: PdfLoadingOptions) => { promise?: Promise<any> } | Promise<any>;
    OPS: { paintImageXObject: number; paintJpegXObject: number };
  };
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    nativeImageDecoderSupport: "none",
    isEvalSupported: false,
    disableWorker: true,
  });
  const document = await ("promise" in loadingTask && loadingTask.promise
    ? loadingTask.promise
    : loadingTask);
  const images: ExtractedImage[] = [];
  const seen = new Set<string>();

  for (let pageNum = 1; pageNum <= document.numPages; pageNum += 1) {
    if (images.length >= MAX_PDF_IMAGES) break;
    const page = await document.getPage(pageNum);
    const operations = await page.getOperatorList();
    for (let i = 0; i < operations.fnArray.length; i += 1) {
      if (images.length >= MAX_PDF_IMAGES) break;
      const fn = operations.fnArray[i];
      if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintJpegXObject) continue;
      const objectName = operations.argsArray[i]?.[0];
      if (typeof objectName !== "string") continue;
      const uniqueKey = `${pageNum}:${objectName}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const image = await getPdfImageObject(page, objectName);
      if (!image?.data || !image.width || !image.height) continue;
      const dataBase64 = rawPdfImageToPng(image);
      if (!dataBase64) continue;
      images.push({
        index: images.length,
        dataBase64,
        mimeType: "image/png",
        altText: `PDF page ${pageNum} image ${images.length + 1}`,
        pageNum,
        nearTextIndex: nearestTextIndex(textBlocks, pageNum),
      });
    }
    page.cleanup?.();
  }
  document.cleanup?.();
  document.destroy?.();
  return images;
}

async function extractPdfImages(
  buffer: Buffer,
  textBlocks: TextBlock[],
): Promise<ExtractedImage[]> {
  return withTimeout(
    extractPdfImagesInternal(buffer, textBlocks).catch(() => []),
    PDF_IMAGE_EXTRACTION_TIMEOUT_MS,
    [],
  );
}

async function parsePdf(filePath: string): Promise<ExtractionResult> {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  let textBlocks = normalizeBlocks(String(data.text ?? "")).map((text, index) => ({ index, text }));
  if (textBlocks.length === 0) textBlocks = await extractScannedPdfText(buffer);
  const images = await extractPdfImages(buffer, textBlocks);
  return { textBlocks, images };
}

async function parseDocx(filePath: string): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("DOCX is missing word/document.xml");
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const rels = relationshipMap(relsXml, "word");
  const textBlocks: TextBlock[] = [];
  const imageAssociations = new Map<string, number | undefined>();

  for (const paragraphMatch of documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const paragraph = paragraphMatch[0];
    const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXml(match[1]))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    let nearTextIndex = nearestTextIndex(textBlocks);
    if (text) {
      nearTextIndex = textBlocks.length;
      textBlocks.push({ index: nearTextIndex, text });
    }
    for (const imageMatch of paragraph.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)) {
      const target = rels.get(imageMatch[1]);
      if (target) imageAssociations.set(target, nearTextIndex);
    }
  }

  const images: ExtractedImage[] = [];
  for (const [name, file] of Object.entries(zip.files)) {
    if (!name.startsWith("word/media/") || file.dir) continue;
    const mimeType = MIME_BY_EXT[path.extname(name).toLowerCase()];
    if (!mimeType) continue;
    images.push({
      index: images.length,
      dataBase64: await file.async("base64"),
      mimeType,
      altText: path.basename(name),
      nearTextIndex: imageAssociations.get(name) ?? nearestTextIndex(textBlocks),
    });
  }
  return { textBlocks, images };
}

async function parsePptx(filePath: string): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const textBlocks: TextBlock[] = [];
  const imageAssociations = new Map<string, { pageNum: number; nearTextIndex?: number }>();
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));

  for (let i = 0; i < slideFiles.length; i += 1) {
    const slidePath = slideFiles[i];
    const pageNum = i + 1;
    const slideXml = await zip.files[slidePath].async("string");
    const texts = [...slideXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXml(match[1]).replace(/\s+/g, " ").trim())
      .filter(Boolean);
    let nearTextIndex = nearestTextIndex(textBlocks, pageNum);
    if (texts.length > 0) {
      nearTextIndex = textBlocks.length;
      textBlocks.push({ index: nearTextIndex, text: texts.join(" "), pageNum });
    }
    const relsPath = `ppt/slides/_rels/${path.posix.basename(slidePath)}.rels`;
    const rels = relationshipMap((await zip.file(relsPath)?.async("string")) ?? "", "ppt/slides");
    for (const imageMatch of slideXml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)) {
      const target = rels.get(imageMatch[1]);
      if (target) imageAssociations.set(target, { pageNum, nearTextIndex });
    }
  }

  const images: ExtractedImage[] = [];
  for (const [name, file] of Object.entries(zip.files)) {
    if (!name.startsWith("ppt/media/") || file.dir) continue;
    const mimeType = MIME_BY_EXT[path.extname(name).toLowerCase()];
    if (!mimeType) continue;
    const association = imageAssociations.get(name);
    images.push({
      index: images.length,
      dataBase64: await file.async("base64"),
      mimeType,
      altText: path.basename(name),
      pageNum: association?.pageNum,
      nearTextIndex: association?.nearTextIndex ?? nearestTextIndex(textBlocks),
    });
  }
  return { textBlocks, images };
}
