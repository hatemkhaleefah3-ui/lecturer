import { GoogleGenAI } from "@google/genai";
import type {
  TextBlock,
  ExtractedImage,
  SlideData,
  SlidesResult,
  IntegrityReport,
} from "./types.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set");
  return new GoogleGenAI({ apiKey });
}

function slideText(slide: SlideData): string {
  return [
    slide.title,
    slide.subtitle,
    slide.body,
    slide.leftColumn,
    slide.rightColumn,
    ...(slide.tableHeaders ?? []),
    ...(slide.tableRows ?? []).flat(),
    ...(slide.chartData?.labels ?? []),
    ...(slide.chartData?.datasets ?? []).flatMap((dataset) => [
      dataset.label,
      ...dataset.values.map(String),
    ]),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function normalizedWords(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function contentIsRetained(source: string, placed: string): boolean {
  const sourceWords = normalizedWords(source);
  const placedWords = normalizedWords(placed);
  if (sourceWords.length === 0) return true;
  if (placedWords.length === 0) return false;

  const normalizedSource = sourceWords.join(" ");
  const normalizedPlaced = placedWords.join(" ");
  if (normalizedPlaced.includes(normalizedSource)) return true;

  const placedSet = new Set(placedWords);
  const distinctSource = [...new Set(sourceWords)];
  const matched = distinctSource.filter((word) => placedSet.has(word)).length;
  const threshold = distinctSource.length <= 5 ? 1 : 0.7;
  return matched / distinctSource.length >= threshold;
}

function duplicates(values: number[]): number[] {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

function computeIntegrity(
  textBlocks: TextBlock[],
  images: ExtractedImage[],
  slides: SlideData[],
): IntegrityReport {
  const validText = new Set(textBlocks.map((block) => block.index));
  const validImages = new Set(images.map((image) => image.index));
  const allTextRefs = slides.flatMap((slide) => slide.textBlockIndices ?? []);
  const allImageRefs = slides.flatMap((slide) =>
    (slide.images ?? []).map((image) => image.originalIndex),
  );
  const placedText = new Set(allTextRefs.filter((index) => validText.has(index)));
  const placedImages = new Set(allImageRefs.filter((index) => validImages.has(index)));

  const invalidTextIndices = [...new Set(allTextRefs.filter((index) => !validText.has(index)))].sort(
    (a, b) => a - b,
  );
  const invalidImageIndices = [
    ...new Set(allImageRefs.filter((index) => !validImages.has(index))),
  ].sort((a, b) => a - b);
  const duplicateTextIndices = duplicates(allTextRefs).filter((index) => validText.has(index));
  const duplicateImageIndices = duplicates(allImageRefs).filter((index) => validImages.has(index));
  const unplacedTextIndices = textBlocks
    .map((block) => block.index)
    .filter((index) => !placedText.has(index));
  const unplacedImageIndices = images
    .map((image) => image.index)
    .filter((index) => !placedImages.has(index));

  const slideByTextIndex = new Map<number, string[]>();
  for (const slide of slides) {
    const text = slideText(slide);
    for (const index of slide.textBlockIndices ?? []) {
      if (!validText.has(index)) continue;
      const values = slideByTextIndex.get(index) ?? [];
      values.push(text);
      slideByTextIndex.set(index, values);
    }
  }

  const referencedButMissingTextIndices = textBlocks
    .filter((block) => {
      const destinations = slideByTextIndex.get(block.index);
      return destinations && !destinations.some((text) => contentIsRetained(block.text, text));
    })
    .map((block) => block.index);
  const textBlocksRetained = textBlocks.length - unplacedTextIndices.length - referencedButMissingTextIndices.length;
  const textRetentionPct =
    textBlocks.length === 0 ? 100 : Math.round((textBlocksRetained / textBlocks.length) * 10_000) / 100;

  return {
    textBlocksExtracted: textBlocks.length,
    textBlocksPlaced: placedText.size,
    textBlocksRetained,
    imagesExtracted: images.length,
    imagesPlaced: placedImages.size,
    unplacedTextIndices,
    unplacedImageIndices,
    duplicateTextIndices,
    duplicateImageIndices,
    invalidTextIndices,
    invalidImageIndices,
    referencedButMissingTextIndices,
    textRetentionPct,
    allPlaced:
      unplacedTextIndices.length === 0 &&
      unplacedImageIndices.length === 0 &&
      duplicateTextIndices.length === 0 &&
      duplicateImageIndices.length === 0 &&
      invalidTextIndices.length === 0 &&
      invalidImageIndices.length === 0 &&
      referencedButMissingTextIndices.length === 0,
  };
}

export async function analyzeWithGemini(
  textBlocks: TextBlock[],
  images: ExtractedImage[],
  filename: string,
): Promise<SlidesResult> {
  const ai = getGenAI();
  const textSection = textBlocks
    .map(
      (block) =>
        `[Block ${block.index}]${block.pageNum ? ` (page ${block.pageNum})` : ""}: ${block.text}`,
    )
    .join("\n\n");
  const imageSection =
    images.length > 0
      ? `\nIMAGES EXTRACTED (${images.length} total):\n` +
        images
          .map(
            (image) =>
              `[Image ${image.index}]${image.pageNum ? ` (page ${image.pageNum})` : ""}${image.nearTextIndex !== undefined ? ` near Block ${image.nearTextIndex}` : ""}: ${image.altText ?? "untitled image"}`,
          )
          .join("\n")
      : "\nNo images extracted from this file.";

  const prompt = `You are a professional presentation designer. Analyze the following extracted content from a lecture file named "${filename}" and reorganize it into a compelling, professionally structured slide deck.

EXTRACTED TEXT BLOCKS (${textBlocks.length} total):
${textSection}
${imageSection}

Return ONLY valid JSON with this structure: {"slides":[{"index":0,"type":"title","title":"...","subtitle":"...","images":[],"textBlockIndices":[0]}]}.

SLIDE TYPES:
- title: title, subtitle?, images?, textBlockIndices
- section_header: title, subtitle?, images?, textBlockIndices
- content: title, body, images?, textBlockIndices
- data_table: title, tableHeaders, tableRows, images?, textBlockIndices
- chart: title, chartType, chartData, images?, textBlockIndices
- comparison: title, leftColumn, rightColumn, images?, textBlockIndices
- callout: title, body, calloutStyle, images?, textBlockIndices

RETENTION RULES:
1. Every text block index from 0 to ${textBlocks.length - 1} must appear exactly once.
2. Every assigned block's factual content, numbers, equations, labels, definitions, and qualifications must be present in that slide's visible fields. Do not merely reference an index while omitting its content.
3. Every image index from 0 to ${images.length - 1} must appear exactly once when images exist. Prefer the slide containing its nearTextIndex.
4. Never invent chart values. Use a chart only when the source provides explicit numeric values.
5. Reorganize for clarity, but do not discard or materially alter source content.
6. Use one title slide, concise titles, and as many slides as necessary to preserve all content legibly.

Return ONLY the JSON object.`;

  const inlineImages = images
    .filter((image) => image.dataBase64.length < 700_000)
    .slice(0, 8);
  const parts: any[] = [{ text: prompt }];
  for (const image of inlineImages) {
    parts.push({ text: `\n[Image ${image.index} visual content:]` });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", maxOutputTokens: 16384 },
  });
  const jsonText = response.text;
  if (!jsonText) throw new Error("Empty response from Gemini API");

  let parsed: { slides: SlideData[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${jsonText.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed.slides)) {
    throw new Error("Invalid Gemini response: missing slides array");
  }

  const integrity = computeIntegrity(textBlocks, images, parsed.slides);
  const imageMap = new Map(images.map((image) => [image.index, image]));
  for (const slide of parsed.slides) {
    slide.images = (slide.images ?? []).map((slideImage) => {
      const image = imageMap.get(slideImage.originalIndex);
      return image
        ? {
            originalIndex: slideImage.originalIndex,
            dataBase64: image.dataBase64,
            mimeType: image.mimeType,
            altText: image.altText,
          }
        : slideImage;
    });
  }

  return { slides: parsed.slides, integrity };
}
