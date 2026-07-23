import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuid } from "uuid";
import type {
  ExtractedImage,
  IntegrityReport,
  SlideData,
  SlidesResult,
  TextBlock,
} from "../../lib/lecturer/types.js";

const WORK_DIR = "/tmp/lecturer-convert";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

await fs.mkdir(WORK_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, WORK_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([".pdf", ".docx", ".pptx", ".txt", ".md"]);
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.has(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext || "unknown"}`));
  },
});

function safeFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const normalized = base
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${normalized || "lecture"}-deck.pptx`;
}

function slideTitle(blocks: TextBlock[], index: number): string {
  const source = blocks[0]?.text.trim() || `Section ${index + 1}`;
  const firstLine = source.split(/\n|(?<=[.!?])\s+/)[0]?.trim() || source;
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 69).trimEnd()}…`;
}

function groupBlocks(textBlocks: TextBlock[]): TextBlock[][] {
  const groups: TextBlock[][] = [];
  let current: TextBlock[] = [];
  let currentChars = 0;

  for (const block of textBlocks) {
    const text = block.text.replace(/\s+/g, " ").trim();
    if (!text) continue;

    const shouldFlush =
      current.length > 0 && (current.length >= 5 || currentChars + text.length > 1_250);
    if (shouldFlush) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }

    current.push({ ...block, text });
    currentChars += text.length;
  }

  if (current.length) groups.push(current);
  return groups;
}

function buildFallbackSlides(
  textBlocks: TextBlock[],
  images: ExtractedImage[],
  filename: string,
): SlidesResult {
  const title = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, " ").trim();
  const slides: SlideData[] = [
    {
      index: 0,
      type: "title",
      title: title || "Lecture Deck",
      subtitle: "Structured automatically by Lecturer",
      images: [],
      textBlockIndices: [],
    },
  ];

  const usedImages = new Set<number>();
  for (const [groupIndex, blocks] of groupBlocks(textBlocks).entries()) {
    const blockIndices = blocks.map((block) => block.index);
    const nearbyImages = images
      .filter(
        (image) =>
          !usedImages.has(image.index) &&
          image.nearTextIndex !== undefined &&
          blockIndices.includes(image.nearTextIndex),
      )
      .slice(0, 1);

    for (const image of nearbyImages) usedImages.add(image.index);

    slides.push({
      index: slides.length,
      type: "content",
      title: slideTitle(blocks, groupIndex),
      body: blocks.map((block) => `• ${block.text}`).join("\n\n"),
      images: nearbyImages.map((image) => ({
        originalIndex: image.index,
        dataBase64: image.dataBase64,
        mimeType: image.mimeType,
        altText: image.altText,
      })),
      textBlockIndices: blockIndices,
    });
  }

  const contentSlides = slides.filter((slide) => slide.type === "content");
  for (const image of images) {
    if (usedImages.has(image.index) || contentSlides.length === 0) continue;
    const target = contentSlides.find((slide) => !slide.images?.length) ?? contentSlides.at(-1);
    if (!target) continue;
    target.images = [
      {
        originalIndex: image.index,
        dataBase64: image.dataBase64,
        mimeType: image.mimeType,
        altText: image.altText,
      },
    ];
    usedImages.add(image.index);
  }

  const unplacedImageIndices = images
    .map((image) => image.index)
    .filter((index) => !usedImages.has(index));
  const integrity: IntegrityReport = {
    textBlocksExtracted: textBlocks.length,
    textBlocksPlaced: textBlocks.length,
    textBlocksRetained: textBlocks.length,
    imagesExtracted: images.length,
    imagesPlaced: usedImages.size,
    unplacedTextIndices: [],
    unplacedImageIndices,
    duplicateTextIndices: [],
    duplicateImageIndices: [],
    invalidTextIndices: [],
    invalidImageIndices: [],
    referencedButMissingTextIndices: [],
    textRetentionPct: 100,
    allPlaced: unplacedImageIndices.length === 0,
  };

  return { slides, integrity };
}

async function analyzeDocument(
  textBlocks: TextBlock[],
  images: ExtractedImage[],
  filename: string,
): Promise<SlidesResult> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const { analyzeWithGemini } = await import("../../lib/lecturer/gemini.js");
      return await analyzeWithGemini(textBlocks, images, filename);
    } catch (error) {
      console.warn("Gemini analysis failed; using deterministic fallback", error);
    }
  }

  return buildFallbackSlides(textBlocks, images, filename);
}

const router: IRouter = Router();

router.post(
  "/lecturer/convert",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const uploadedPath = req.file.path;
    const outputPath = path.join(WORK_DIR, `${uuid()}.pptx`);

    try {
      const [{ parseFile }, { generatePptxFile }] = await Promise.all([
        import("../../lib/lecturer/parser.js"),
        import("../../lib/lecturer/pptx-generator.js"),
      ]);

      const extraction = await parseFile(
        uploadedPath,
        req.file.mimetype,
        req.file.originalname,
      );
      if (extraction.textBlocks.length === 0) {
        res.status(422).json({ error: "No readable text was found in the document." });
        return;
      }

      const { slides } = await analyzeDocument(
        extraction.textBlocks,
        extraction.images,
        req.file.originalname,
      );
      await generatePptxFile(slides, extraction.images, outputPath);

      const downloadName = safeFilename(req.file.originalname);
      res.download(outputPath, downloadName, async (error) => {
        await Promise.allSettled([fs.unlink(uploadedPath), fs.unlink(outputPath)]);
        if (error && !res.headersSent) {
          res.status(500).json({ error: "Failed to send the generated PowerPoint." });
        }
      });
    } catch (error) {
      await Promise.allSettled([fs.unlink(uploadedPath), fs.unlink(outputPath)]);
      const message = error instanceof Error ? error.message : String(error);
      console.error("Stateless conversion failed", error);
      res.status(422).json({ error: message || "Document conversion failed." });
    }
  },
);

export default router;
