import PptxGenJS from "pptxgenjs";
import fs from "fs/promises";
import path from "path";
import type { SlideData, ExtractedImage, ChartData } from "./types.js";

const C = {
  black: "0A0A0A",
  nearBlack: "1A1A1A",
  darkGray: "3D3D3D",
  medGray: "757575",
  lightGray: "C4C4C4",
  veryLight: "F2F2F2",
  white: "FFFFFF",
};
const FONT = "Arial";
const W = 10;
const H = 5.63;
const M = 0.4;
const CONTENT_W = W - M * 2;
const BODY_Y = 1.05;
const BODY_H = H - BODY_Y - M;
const CHART_COLORS = [C.black, "404040", C.medGray, "A0A0A0", "C0C0C0", "E0E0E0"];

function addShape(slide: PptxGenJS.Slide, type: string, options: Record<string, unknown>): void {
  slide.addShape(type as never, options as never);
}

function addTitle(slide: PptxGenJS.Slide, title = ""): void {
  slide.addText(title, {
    x: M,
    y: 0.28,
    w: CONTENT_W,
    h: 0.6,
    fontFace: FONT,
    fontSize: 18,
    bold: true,
    color: C.black,
    margin: 0,
  });
  addShape(slide, "line", {
    x: M,
    y: 0.95,
    w: CONTENT_W,
    h: 0,
    line: { color: C.lightGray, width: 0.75 },
  });
}

function addBody(slide: PptxGenJS.Slide, body = "", x = M, w = CONTENT_W): void {
  slide.addText(body, {
    x,
    y: BODY_Y + 0.12,
    w,
    h: BODY_H - 0.12,
    fontFace: FONT,
    fontSize: 13,
    color: C.darkGray,
    valign: "top",
    margin: 0.05,
    breakLine: false,
    fit: "shrink",
  });
}

function renderTitle(slide: PptxGenJS.Slide, data: SlideData): void {
  slide.background = { color: C.white };
  slide.addText(data.title ?? "Untitled", {
    x: M,
    y: 1.15,
    w: CONTENT_W,
    h: 1.35,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: C.black,
    align: "center",
    valign: "middle",
    margin: 0,
    fit: "shrink",
  });
  addShape(slide, "line", {
    x: M,
    y: 2.8,
    w: CONTENT_W,
    h: 0,
    line: { color: C.lightGray, width: 0.75 },
  });
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: M,
      y: 3.05,
      w: CONTENT_W,
      h: 0.8,
      fontFace: FONT,
      fontSize: 18,
      color: C.darkGray,
      align: "center",
      valign: "middle",
      margin: 0,
      fit: "shrink",
    });
  }
}

function renderSection(slide: PptxGenJS.Slide, data: SlideData): void {
  slide.background = { color: C.nearBlack };
  slide.addText(data.title ?? "", {
    x: M,
    y: 1.45,
    w: CONTENT_W,
    h: 1.5,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
    margin: 0,
    fit: "shrink",
  });
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: M,
      y: 3.2,
      w: CONTENT_W,
      h: 0.7,
      fontFace: FONT,
      fontSize: 16,
      color: C.lightGray,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  }
}

function renderContent(
  slide: PptxGenJS.Slide,
  data: SlideData,
  imageMap: Map<number, ExtractedImage>,
): void {
  slide.background = { color: C.white };
  addTitle(slide, data.title);
  const imageRef = data.images?.[0];
  const image = imageRef ? imageMap.get(imageRef.originalIndex) ?? imageRef : undefined;
  const hasImage = Boolean(image?.dataBase64 && image?.mimeType);
  addBody(slide, data.body ?? data.subtitle ?? "", M, hasImage ? CONTENT_W * 0.57 : CONTENT_W);
  if (hasImage && image?.dataBase64 && image.mimeType) {
    slide.addImage({
      data: `data:${image.mimeType};base64,${image.dataBase64}`,
      x: M + CONTENT_W * 0.61,
      y: BODY_Y + 0.12,
      w: CONTENT_W * 0.36,
      h: BODY_H - 0.12,
      sizing: { type: "contain", w: CONTENT_W * 0.36, h: BODY_H - 0.12 },
    });
  }
}

function renderTable(slide: PptxGenJS.Slide, data: SlideData): void {
  slide.background = { color: C.white };
  addTitle(slide, data.title);
  const headers = (data.tableHeaders ?? []).map(String);
  const rows = (data.tableRows ?? []).map((row) => row.map(String));
  const width = Math.max(headers.length, ...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array(Math.max(0, width - row.length)).fill(""),
  ]);
  const tableRows: Array<Array<string | { text: string; options: Record<string, unknown> }>> = [];
  if (headers.length) {
    tableRows.push(
      [...headers, ...Array(Math.max(0, width - headers.length)).fill("")].map((text) => ({
        text,
        options: { fill: { color: C.nearBlack }, color: C.white, bold: true },
      })),
    );
  }
  tableRows.push(...normalizedRows);
  if (!tableRows.length) {
    addBody(slide, data.body ?? "");
    return;
  }
  slide.addTable(tableRows as never, {
    x: M,
    y: BODY_Y + 0.12,
    w: CONTENT_W,
    h: BODY_H - 0.12,
    colW: Array(width).fill(CONTENT_W / width),
    fontFace: FONT,
    fontSize: 10,
    color: C.darkGray,
    border: { pt: 0.5, color: C.lightGray },
    margin: 0.05,
    autoFit: false,
  } as never);
}

function validChartData(value: ChartData | undefined): value is ChartData {
  return Boolean(
    value?.labels?.length &&
      value.datasets?.length &&
      value.datasets.every(
        (dataset) =>
          Array.isArray(dataset.values) &&
          dataset.values.length === value.labels.length &&
          dataset.values.every((item) => Number.isFinite(Number(item))),
      ),
  );
}

function renderChart(slide: PptxGenJS.Slide, data: SlideData): void {
  slide.background = { color: C.white };
  addTitle(slide, data.title);
  if (!validChartData(data.chartData)) {
    addBody(slide, data.body ?? "Chart data was unavailable or invalid.");
    return;
  }
  const chartData = data.chartData;
  const series = chartData.datasets.map((dataset) => ({
    name: dataset.label || "Value",
    labels: chartData.labels,
    values: dataset.values.map(Number),
  }));
  const chartType = ["bar", "line", "pie"].includes(data.chartType ?? "")
    ? (data.chartType as "bar" | "line" | "pie")
    : "bar";
  slide.addChart(chartType as never, series as never, {
    x: M,
    y: BODY_Y + 0.12,
    w: CONTENT_W,
    h: BODY_H - 0.12,
    chartColors: CHART_COLORS,
    showLegend: series.length > 1,
    legendPos: "b",
    showTitle: false,
    valAxisLineColor: C.lightGray,
    catAxisLineColor: C.lightGray,
    dataLabelColor: C.darkGray,
    dataLabelFontSize: 9,
  } as never);
}

function renderComparison(slide: PptxGenJS.Slide, data: SlideData): void {
  slide.background = { color: C.white };
  addTitle(slide, data.title);
  const gap = 0.18;
  const colW = (CONTENT_W - gap) / 2;
  addBody(slide, data.leftColumn ?? "", M, colW);
  addShape(slide, "line", {
    x: M + colW + gap / 2,
    y: BODY_Y + 0.12,
    w: 0,
    h: BODY_H - 0.12,
    line: { color: C.lightGray, width: 1 },
  });
  addBody(slide, data.rightColumn ?? "", M + colW + gap, colW);
}

function renderCallout(slide: PptxGenJS.Slide, data: SlideData): void {
  slide.background = { color: C.white };
  addTitle(slide, data.title);
  addShape(slide, "roundRect", {
    x: M,
    y: BODY_Y + 0.18,
    w: CONTENT_W,
    h: BODY_H - 0.18,
    rectRadius: 0.05,
    fill: { color: C.veryLight },
    line: { color: C.lightGray, width: 1 },
  });
  const labels: Record<string, string> = {
    definition: "DEFINITION",
    warning: "WARNING",
    takeaway: "KEY TAKEAWAY",
  };
  slide.addText(labels[data.calloutStyle ?? "takeaway"] ?? "NOTE", {
    x: M + 0.22,
    y: BODY_Y + 0.35,
    w: CONTENT_W - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: C.medGray,
    charSpacing: 2,
    margin: 0,
  });
  slide.addText(data.body ?? "", {
    x: M + 0.22,
    y: BODY_Y + 0.78,
    w: CONTENT_W - 0.44,
    h: BODY_H - 0.9,
    fontFace: FONT,
    fontSize: 14,
    color: C.black,
    valign: "top",
    margin: 0,
    fit: "shrink",
  });
}

export async function generatePptxFile(
  slides: SlideData[],
  allImages: ExtractedImage[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Lecturer";
  pptx.company = "Lecturer";
  pptx.title = "Lecturer Deck";
  pptx.subject = "Generated by Lecturer";
  pptx.theme = {
    headFontFace: FONT,
    bodyFontFace: FONT,
  };

  const imageMap = new Map(allImages.map((image) => [image.index, image]));
  for (const data of slides) {
    const slide = pptx.addSlide();
    switch (data.type) {
      case "title":
        renderTitle(slide, data);
        break;
      case "section_header":
        renderSection(slide, data);
        break;
      case "data_table":
        renderTable(slide, data);
        break;
      case "chart":
        renderChart(slide, data);
        break;
      case "comparison":
        renderComparison(slide, data);
        break;
      case "callout":
        renderCallout(slide, data);
        break;
      default:
        renderContent(slide, data, imageMap);
    }
  }
  await pptx.writeFile({ fileName: outputPath });
}
