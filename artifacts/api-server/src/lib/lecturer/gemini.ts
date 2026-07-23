import { GoogleGenAI } from "@google/genai";
import type {
  TextBlock,
  ExtractedImage,
  SlideData,
  SlidesResult,
  IntegrityReport,
} from "./types.js";

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
}

function computeIntegrity(
  textBlocks: TextBlock[],
  images: ExtractedImage[],
  slides: SlideData[],
): IntegrityReport {
  const placedText = new Set<number>();
  const placedImages = new Set<number>();

  for (const slide of slides) {
    for (const idx of slide.textBlockIndices ?? []) {
      placedText.add(idx);
    }
    for (const img of slide.images ?? []) {
      placedImages.add(img.originalIndex);
    }
  }

  const unplacedTextIndices = textBlocks
    .map((b) => b.index)
    .filter((i) => !placedText.has(i));
  const unplacedImageIndices = images
    .map((img) => img.index)
    .filter((i) => !placedImages.has(i));

  return {
    textBlocksExtracted: textBlocks.length,
    textBlocksPlaced: placedText.size,
    imagesExtracted: images.length,
    imagesPlaced: placedImages.size,
    unplacedTextIndices,
    unplacedImageIndices,
    allPlaced:
      unplacedTextIndices.length === 0 && unplacedImageIndices.length === 0,
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
      (b) =>
        `[Block ${b.index}]${b.pageNum ? ` (page ${b.pageNum})` : ""}: ${b.text}`,
    )
    .join("\n\n");

  const imageSection =
    images.length > 0
      ? `\nIMAGES EXTRACTED (${images.length} total):\n` +
        images
          .map(
            (img) =>
              `[Image ${img.index}]: ${img.altText ?? "untitled image"}`,
          )
          .join("\n")
      : "\nNo images extracted from this file.";

  const prompt = `You are a professional presentation designer. Analyze the following extracted content from a lecture file named "${filename}" and reorganize it into a compelling, professionally structured slide deck.

EXTRACTED TEXT BLOCKS (${textBlocks.length} total):
${textSection}
${imageSection}

Return ONLY valid JSON (no markdown fences, no explanation text) with this exact structure:
{
  "slides": [
    {
      "index": 0,
      "type": "title",
      "title": "...",
      "subtitle": "...",
      "images": [],
      "textBlockIndices": [0]
    }
  ]
}

SLIDE TYPES AND THEIR FIELDS:
- "title": { title, subtitle?, images?, textBlockIndices } — use exactly once at the beginning
- "section_header": { title, subtitle?, textBlockIndices } — major section dividers (2-5 per deck)
- "content": { title, body, images?: [{originalIndex}], textBlockIndices } — standard content slide
- "data_table": { title, tableHeaders: string[], tableRows: string[][], textBlockIndices } — for tabular/structured data
- "chart": { title, chartType: "bar"|"line"|"pie", chartData: { labels: string[], datasets: [{label: string, values: number[]}] }, textBlockIndices } — for numeric data that can be visualized
- "comparison": { title, leftColumn: string, rightColumn: string, textBlockIndices } — comparing two concepts/approaches
- "callout": { title, body, calloutStyle: "definition"|"warning"|"takeaway", textBlockIndices } — definitions, warnings, or key takeaways

RULES:
1. CRITICAL: Every text block index from 0 to ${textBlocks.length - 1} MUST appear in exactly one slide's textBlockIndices
2. Each image index (0 to ${images.length - 1}) should appear in at most one slide's images array — assign it to the most semantically relevant slide
3. Do NOT preserve the original content order — create a new logical, professional structure
4. Aim for 8-20 slides total
5. Use diverse slide types — aim to use all 7 types at least once if content permits
6. Keep titles concise (max 8 words)
7. For "content" slides, keep body to 2-4 sentences
8. For "comparison" slides, each column should be 2-3 sentences
9. For "chart" slides, extract numeric data from the text into chartData — use realistic values from the content
10. For "data_table" slides, structure tabular data from the text into rows and columns

Return ONLY the JSON object.`;

  // Include small images as inline data (up to 8 images, max 0.5MB in base64)
  const inlineImages = images
    .filter((img) => img.dataBase64.length < 700_000)
    .slice(0, 8);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: prompt }];
  for (const img of inlineImages) {
    parts.push({ text: `\n[Image ${img.index} visual content:]` });
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.dataBase64,
      },
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });

  const jsonText = response.text;
  if (!jsonText) {
    throw new Error("Empty response from Gemini API");
  }

  let parsed: { slides: SlideData[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Failed to parse Gemini response as JSON: ${jsonText.slice(0, 300)}`,
    );
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    throw new Error("Invalid Gemini response: missing slides array");
  }

  const integrity = computeIntegrity(textBlocks, images, parsed.slides);

  // Attach image data to slide images (for PPTX generation)
  const imageMap = new Map(images.map((img) => [img.index, img]));
  for (const slide of parsed.slides) {
    if (slide.images && slide.images.length > 0) {
      slide.images = slide.images.map((si) => {
        const img = imageMap.get(si.originalIndex);
        if (img) {
          return {
            originalIndex: si.originalIndex,
            dataBase64: img.dataBase64,
            mimeType: img.mimeType,
            altText: img.altText,
          };
        }
        return si;
      });
    }
  }

  return { slides: parsed.slides, integrity };
}
