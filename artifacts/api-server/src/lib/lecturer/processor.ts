import fs from "fs/promises";
import path from "path";
import { logger } from "../../lib/logger.js";
import { parseFile } from "./parser.js";
import { analyzeWithGemini } from "./gemini.js";
import { generatePptxFile } from "./pptx-generator.js";
import { updateJob } from "./db-helpers.js";
import type { SlideData } from "./types.js";

export const PPTX_DIR = "/tmp/lecturer-pptx";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function processJob(
  jobId: string,
  filePath: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const log = logger.child({ jobId, filename });

  try {
    log.info("Starting content extraction");
    await updateJob(jobId, {
      status: "extracting",
      progressStep: "Extracting content from file",
      progressPct: 10,
    });

    const extraction = await withTimeout(
      parseFile(filePath, mimeType, filename),
      3 * 60 * 1000,
      "Content extraction timed out after 3 minutes. The PDF may contain unusually complex or corrupted embedded objects.",
    );
    log.info(
      { textBlocks: extraction.textBlocks.length, images: extraction.images.length },
      "Extraction complete",
    );

    if (extraction.textBlocks.length === 0) {
      throw new Error(
        "No text content could be extracted. The file may be empty, corrupted, image-only, or password-protected.",
      );
    }

    await updateJob(jobId, {
      extractedTextCount: extraction.textBlocks.length,
      extractedImageCount: extraction.images.length,
      progressPct: 30,
    });

    log.info("Calling Gemini API");
    await updateJob(jobId, {
      status: "analyzing",
      progressStep: "Analyzing content with Gemini AI",
      progressPct: 40,
    });

    const { slides, integrity } = await withTimeout(
      analyzeWithGemini(extraction.textBlocks, extraction.images, filename),
      4 * 60 * 1000,
      "Gemini analysis timed out after 4 minutes. Please retry the upload.",
    );
    log.info({ slides: slides.length }, "Gemini analysis complete");

    await updateJob(jobId, { progressPct: 65 });

    log.info("Generating PPTX");
    await updateJob(jobId, {
      status: "generating",
      progressStep: "Generating PowerPoint deck",
      progressPct: 70,
    });

    await fs.mkdir(PPTX_DIR, { recursive: true });
    const pptxPath = path.join(PPTX_DIR, `${jobId}.pptx`);

    const slidesForDb = slides.map((slide) => ({
      ...slide,
      images: slide.images?.map((img) => ({
        originalIndex: img.originalIndex,
        altText: img.altText,
        mimeType: img.mimeType,
      })),
    }));

    await withTimeout(
      generatePptxFile(slides, extraction.images, pptxPath),
      3 * 60 * 1000,
      "PowerPoint generation timed out after 3 minutes.",
    );
    log.info({ pptxPath }, "PPTX generated");

    await updateJob(jobId, {
      status: "completed",
      progressStep: "Deck ready",
      progressPct: 100,
      slideCount: slides.length,
      slidesJson: slidesForDb as SlideData[],
      integrityJson: integrity,
      pptxPath,
    });

    log.info("Job completed successfully");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error({ err: error }, "Job processing failed");
    await updateJob(jobId, {
      status: "failed",
      error: msg,
      progressStep: null,
    }).catch(() => {});
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}
