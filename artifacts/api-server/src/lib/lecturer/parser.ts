import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { PNG } from "pngjs";
import type { ExtractionResult, TextBlock, ExtractedImage } from "./types.js";

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
  const textBlocks = normalizeBlocks(content).map((text, index) => ({ index, text }));
  return { textBlocks, images: [] };
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
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
    },
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
      if (!text) continue;
      textBlocks.push({ index: textBlocks.length, text, pageNum: page.pageNum });
    }
  }
  return textBlocks;
}

function rawPdfImageToPng(image: {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}): string | null {
  const pixelCount = image.width * image.height;
  if (!pixelCount || pixelCount > 25_000_000) return null;

  const source = image.data;
  const channels = source.length / pixelCount;
  if (![1, 3, 4].includes(channels)) return null;

  const png = new PNG({ width: image.width, height: image.height });
  for (let i = 0; i < pixelCount; i += 1) {
    const src = i * channels;
    const dst = i * 4;
    if (channels === 1) {
      png.data[dst] = source[src];
      png.data[dst + 1] = source[src];
      png.data[dst + 2] = source[src];
      png.data[dst + 3] = 255;
    } else {
      png.data[dst] = source[src];
      png.data[dst + 1] = source[src + 1];
      png.data[dst + 2] = source[src + 2];
      png.data[dst + 3] = channels === 4 ? source[src + 3] : 255;
    }
  }
  return PNG.sync.write(png).toString("base64");
}

async function extractPdfImages(
  buffer: Buffer,
  textBlocks: TextBlock[],
): Promise<ExtractedImage[]> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useSystemFonts: true,
    }).promise;
    const images: ExtractedImage[] = [];
    const seen = new Set<string>();

    for (let pageNum = 1; pageNum <= document.numPages; pageNum += 1) {
      const page = await document.getPage(pageNum);
      const operations = await page.getOperatorList();
      for (let i = 0; i < operations.fnArray.length; i += 1) {
        const fn = operations.fnArray[i];
        if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintJpegXObject) continue;
        const objectName = operations.argsArray[i]?.[0];
        if (typeof objectName !== "string") continue;
        const uniqueKey = `${pageNum}:${objectName}`;
        if (seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);

        const image = await new Promise<any>((resolve) => {
          try {
            const immediate = page.objs.get(objectName, resolve);
            if (immediate) resolve(immediate);
          } catch {
            resolve(null);
          }
        });
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
    }
    return images;
  } catch {
    return [];
  }
}

async function parsePdf(filePath: string): Promise<ExtractionResult> {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);

  let textBlocks = normalizeBlocks(String(data.text ?? "")).map((text, index) => ({
    index,
    text,
  }));
  if (textBlocks.length === 0) textBlocks = await extractScannedPdfText(buffer);

  const images = await extractPdfImages(buffer, textBlocks);
  return { textBlocks, images };
}

async function parseDocx(filePath: string): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
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
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
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
    const relsXml = (await zip.file(relsPath)?.async("string")) ?? "";
    const rels = relationshipMap(relsXml, "ppt/slides");
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
