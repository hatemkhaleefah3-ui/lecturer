import fs from "fs/promises";
import path from "path";
import type { ExtractionResult, TextBlock, ExtractedImage } from "./types.js";

export async function parseFile(
  filePath: string,
  _mimeType: string,
  originalFilename: string,
): Promise<ExtractionResult> {
  const ext = path.extname(originalFilename).toLowerCase();

  if (ext === ".txt" || ext === ".md") {
    return parseTxtMd(filePath);
  } else if (ext === ".pdf") {
    return parsePdf(filePath);
  } else if (ext === ".docx") {
    return parseDocx(filePath);
  } else if (ext === ".pptx") {
    return parsePptx(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

async function parseTxtMd(filePath: string): Promise<ExtractionResult> {
  const content = await fs.readFile(filePath, "utf-8");

  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 30);

  const textBlocks: TextBlock[] = paragraphs.map((text, index) => ({
    index,
    text,
  }));

  return { textBlocks, images: [] };
}

async function parsePdf(filePath: string): Promise<ExtractionResult> {
  // Dynamic import to avoid bundling issues
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = await fs.readFile(filePath);

  const data = await pdfParse(buffer);

  const rawText = data.text as string;
  const paragraphs = rawText
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 30);

  const textBlocks: TextBlock[] = paragraphs.map((text, index) => ({
    index,
    text,
  }));

  return { textBlocks, images: [] };
}

async function parseDocx(filePath: string): Promise<ExtractionResult> {
  const [mammothMod, JSZip] = await Promise.all([
    import("mammoth"),
    import("jszip").then((m) => m.default),
  ]);

  // Extract text
  const result = await mammothMod.extractRawText({ path: filePath });
  const paragraphs = result.value
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 30);

  const textBlocks: TextBlock[] = paragraphs.map((text, index) => ({
    index,
    text,
  }));

  // Extract images from docx zip (word/media/)
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const images: ExtractedImage[] = [];
  let imgIndex = 0;

  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };

  for (const [name, file] of Object.entries(zip.files)) {
    if (name.startsWith("word/media/") && !file.dir) {
      const ext = path.extname(name).toLowerCase();
      const mimeType = mimeMap[ext];
      if (mimeType) {
        const data = await file.async("base64");
        images.push({
          index: imgIndex++,
          dataBase64: data,
          mimeType,
          altText: path.basename(name),
        });
      }
    }
  }

  return { textBlocks, images };
}

async function parsePptx(filePath: string): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const textBlocks: TextBlock[] = [];
  const images: ExtractedImage[] = [];
  let imgIndex = 0;

  // Find and sort slide XML files
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)?.[0] ?? "0");
      const bNum = parseInt(b.match(/\d+/)?.[0] ?? "0");
      return aNum - bNum;
    });

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.files[slideFiles[i]].async("string");
    // Extract text runs from PPTX XML (<a:t> tags)
    const texts = [...slideXml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)]
      .map((m) => m[1].trim())
      .filter((t) => t.length > 0);

    if (texts.length > 0) {
      textBlocks.push({
        index: textBlocks.length,
        text: texts.join(" "),
        pageNum: i + 1,
      });
    }
  }

  // Extract images from ppt/media/
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };

  for (const [name, file] of Object.entries(zip.files)) {
    if (name.startsWith("ppt/media/") && !file.dir) {
      const ext = path.extname(name).toLowerCase();
      const mimeType = mimeMap[ext];
      if (mimeType) {
        const data = await file.async("base64");
        images.push({
          index: imgIndex++,
          dataBase64: data,
          mimeType,
          altText: path.basename(name),
        });
      }
    }
  }

  return { textBlocks, images };
}
