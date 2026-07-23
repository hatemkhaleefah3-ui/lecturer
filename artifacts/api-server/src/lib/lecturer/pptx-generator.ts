import PptxGenJS from "pptxgenjs";
import fs from "fs/promises";
import path from "path";
import type { SlideData, ExtractedImage, ChartData } from "./types.js";

// Monochrome palette
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
const CHART_COLORS = ["0A0A0A", "404040", "757575", "A0A0A0", "C0C0C0", "E0E0E0"];

// Slide dimensions: LAYOUT_WIDE = 10" x 5.63"
const W = 10;
const H = 5.63;
const MARGIN = 0.4;
const CONTENT_W = W - MARGIN * 2;
const TITLE_H = 0.65;
const TITLE_Y = 0.3;
const BODY_Y = TITLE_Y + TITLE_H + 0.1;
const BODY_H = H - BODY_Y - MARGIN;

function addSlideTitle(
  pSlide: PptxGenJS.Slide,
  title: string,
  color = C.black,
  fontSize = 18,
): void {
  pSlide.addText(title, {
    x: MARGIN,
    y: TITLE_Y,
    w: CONTENT_W,
    h: TITLE_H,
    fontFace: FONT,
    fontSize,
    bold: true,
    color,
    align: "left",
  });
}

function addDivider(pSlide: PptxGenJS.Slide, y: number): void {
  pSlide.addShape(PptxGenJS.ShapeType.line, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    h: 0,
    line: { color: C.lightGray, width: 0.75 },
  });
}

function renderTitle(pSlide: PptxGenJS.Slide, slide: SlideData): void {
  pSlide.background = { color: C.white };

  // Centered large title
  pSlide.addText(slide.title ?? "Untitled", {
    x: MARGIN,
    y: 1.2,
    w: CONTENT_W,
    h: 1.4,
    fontFace: FONT,
    fontSize: 36,
    bold: true,
    color: C.black,
    align: "center",
    valign: "middle",
  });

  // Divider
  addDivider(pSlide, 2.8);

  // Subtitle
  if (slide.subtitle) {
    pSlide.addText(slide.subtitle, {
      x: MARGIN,
      y: 3.0,
      w: CONTENT_W,
      h: 0.7,
      fontFace: FONT,
      fontSize: 18,
      color: C.darkGray,
      align: "center",
    });
  }
}

function renderSectionHeader(pSlide: PptxGenJS.Slide, slide: SlideData): void {
  pSlide.background = { color: C.nearBlack };

  pSlide.addText(slide.title ?? "", {
    x: MARGIN,
    y: 1.5,
    w: CONTENT_W,
    h: 1.5,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
  });

  if (slide.subtitle) {
    pSlide.addText(slide.subtitle, {
      x: MARGIN,
      y: 3.2,
      w: CONTENT_W,
      h: 0.6,
      fontFace: FONT,
      fontSize: 16,
      color: C.lightGray,
      align: "center",
    });
  }
}

function renderContent(
  pSlide: PptxGenJS.Slide,
  slide: SlideData,
  imageMap: Map<number, ExtractedImage>,
): void {
  pSlide.background = { color: C.white };
  addSlideTitle(pSlide, slide.title ?? "");
  addDivider(pSlide, BODY_Y);

  const hasImages =
    slide.images && slide.images.length > 0;
  const textW = hasImages ? CONTENT_W * 0.57 : CONTENT_W;
  const imgX = MARGIN + CONTENT_W * 0.6;
  const imgW = CONTENT_W * 0.37;

  if (slide.body) {
    pSlide.addText(slide.body, {
      x: MARGIN,
      y: BODY_Y + 0.15,
      w: textW,
      h: BODY_H - 0.15,
      fontFace: FONT,
      fontSize: 13,
      color: C.darkGray,
      valign: "top",
      wrap: true,
    });
  }

  if (hasImages && slide.images) {
    const img = slide.images[0];
    const imgData = imageMap.get(img.originalIndex) ?? img;
    if (imgData.dataBase64 && imgData.mimeType) {
      try {
        pSlide.addImage({
          data: `data:${imgData.mimeType};base64,${imgData.dataBase64}`,
          x: imgX,
          y: BODY_Y + 0.15,
          w: imgW,
          h: BODY_H - 0.15,
          sizing: { type: "contain", w: imgW, h: BODY_H - 0.15 },
        });
      } catch {
        // If image embed fails, add a placeholder text
        pSlide.addText(`[Image ${img.originalIndex}]`, {
          x: imgX,
          y: BODY_Y + 0.15,
          w: imgW,
          h: BODY_H - 0.15,
          fontFace: FONT,
          fontSize: 11,
          color: C.medGray,
          align: "center",
          valign: "middle",
        });
      }
    }
  }
}

function renderDataTable(pSlide: PptxGenJS.Slide, slide: SlideData): void {
  pSlide.background = { color: C.white };
  addSlideTitle(pSlide, slide.title ?? "");
  addDivider(pSlide, BODY_Y);

  const headers = slide.tableHeaders ?? [];
  const rows = slide.tableRows ?? [];

  if (headers.length === 0 && rows.length === 0) return;

  // Build table data: header row + data rows
  type TableCell = {
    text: string;
    options: {
      fill: { color: string };
      color: string;
      bold: boolean;
      fontFace: string;
      fontSize: number;
      align: "left";
      border: { pt: number; color: string };
      valign: "middle";
    };
  };

  const allRows: TableCell[][] = [];

  if (headers.length > 0) {
    allRows.push(
      headers.map((h) => ({
        text: h,
        options: {
          fill: { color: C.nearBlack },
          color: C.white,
          bold: true,
          fontFace: FONT,
          fontSize: 11,
          align: "left" as const,
          border: { pt: 0.5, color: C.lightGray },
          valign: "middle" as const,
        },
      })),
    );
  }

  rows.forEach((row, rowIdx) => {
    allRows.push(
      row.map((cell) => ({
        text: cell,
        options: {
          fill: { color: rowIdx % 2 === 0 ? C.veryLight : C.white },
          color: C.darkGray,
          bold: false,
          fontFace: FONT,
          fontSize: 10,
          align: "left" as const,
          border: { pt: 0.5, color: C.lightGray },
          valign: "middle" as const,
        },
      })),
    );
  });

  const numCols = Math.max(headers.length, ...rows.map((r) => r.length));
  const colW = CONTENT_W / Math.max(numCols, 1);

  pSlide.addTable(allRows, {
    x: MARGIN,
    y: BODY_Y + 0.15,
    w: CONTENT_W,
    rowH: 0.35,
    colW: Array(numCols).fill(colW),
  });
}

function renderChart(pSlide: PptxGenJS.Slide, slide: SlideData): void {
  pSlide.background = { color: C.white };
  addSlideTitle(pSlide, slide.title ?? "");
  addDivider(pSlide, BODY_Y);

  const chartData: ChartData = slide.chartData ?? {
    labels: ["A", "B", "C"],
    datasets: [{ label: "Value", values: [1, 2, 3] }],
  };

  const pptxChartData = chartData.datasets.map((ds) => ({
    name: ds.label,
    labels: chartData.labels,
    values: ds.values,
  }));

  const chartTypeMap: Record<string, PptxGenJS.CHART_NAME> = {
    bar: "bar",
    line: "line",
    pie: "pie",
  } as Record<string, PptxGenJS.CHART_NAME>;

  const chartType = chartTypeMap[slide.chartType ?? "bar"] ?? "bar";

  pSlide.addChart(chartType, pptxChartData, {
    x: MARGIN,
    y: BODY_Y + 0.15,
    w: CONTENT_W,
    h: BODY_H - 0.15,
    chartColors: CHART_COLORS,
    showLegend: chartData.datasets.length > 1,
    legendPos: "b",
    showTitle: false,
    valAxisLineColor: C.lightGray,
    catAxisLineColor: C.lightGray,
    valGridLine: { style: "solid", color: C.veryLight },
    dataLabelColor: C.darkGray,
    dataLabelFontSize: 9,
  });
}

function renderComparison(pSlide: PptxGenJS.Slide, slide: SlideData): void {
  pSlide.background = { color: C.white };
  addSlideTitle(pSlide, slide.title ?? "");
  addDivider(pSlide, BODY_Y);

  const colW = (CONTENT_W - 0.15) / 2;
  const rightX = MARGIN + colW + 0.15;

  // Left column
  pSlide.addText(slide.leftColumn ?? "", {
    x: MARGIN,
    y: BODY_Y + 0.2,
    w: colW,
    h: BODY_H - 0.2,
    fontFace: FONT,
    fontSize: 12,
    color: C.darkGray,
    valign: "top",
    wrap: true,
  });

  // Vertical divider
  pSlide.addShape(PptxGenJS.ShapeType.line, {
    x: MARGIN + colW + 0.07,
    y: BODY_Y + 0.2,
    w: 0,
    h: BODY_H - 0.2,
    line: { color: C.lightGray, width: 1 },
  });

  // Right column
  pSlide.addText(slide.rightColumn ?? "", {
    x: rightX,
    y: BODY_Y + 0.2,
    w: colW,
    h: BODY_H - 0.2,
    fontFace: FONT,
    fontSize: 12,
    color: C.darkGray,
    valign: "top",
    wrap: true,
  });
}

function renderCallout(pSlide: PptxGenJS.Slide, slide: SlideData): void {
  pSlide.background = { color: C.white };
  addSlideTitle(pSlide, slide.title ?? "");
  addDivider(pSlide, BODY_Y);

  const styleLabels: Record<string, string> = {
    definition: "DEFINITION",
    warning: "WARNING",
    takeaway: "KEY TAKEAWAY",
  };

  const label = styleLabels[slide.calloutStyle ?? "takeaway"] ?? "NOTE";

  // Callout box background
  pSlide.addShape(PptxGenJS.ShapeType.roundRect, {
    x: MARGIN,
    y: BODY_Y + 0.2,
    w: CONTENT_W,
    h: BODY_H - 0.2,
    fill: { color: C.veryLight },
    line: { color: C.lightGray, width: 1 },
  });

  // Left accent bar
  pSlide.addShape(PptxGenJS.ShapeType.rect, {
    x: MARGIN,
    y: BODY_Y + 0.2,
    w: 0.08,
    h: BODY_H - 0.2,
    fill: { color: C.nearBlack },
    line: { color: C.nearBlack, width: 0 },
  });

  // Style label
  pSlide.addText(label, {
    x: MARGIN + 0.2,
    y: BODY_Y + 0.35,
    w: CONTENT_W - 0.3,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: C.medGray,
    characterSpacing: 2,
  });

  // Body text
  pSlide.addText(slide.body ?? "", {
    x: MARGIN + 0.2,
    y: BODY_Y + 0.75,
    w: CONTENT_W - 0.3,
    h: BODY_H - 0.75,
    fontFace: FONT,
    fontSize: 14,
    color: C.black,
    valign: "top",
    wrap: true,
  });
}

export async function generatePptxFile(
  slides: SlideData[],
  allImages: ExtractedImage[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const prs = new PptxGenJS();
  prs.layout = "LAYOUT_WIDE";
  prs.title = "Lecturer Deck";
  prs.subject = "Generated by Lecturer";

  const imageMap = new Map(allImages.map((img) => [img.index, img]));

  for (const slide of slides) {
    const pSlide = prs.addSlide();

    switch (slide.type) {
      case "title":
        renderTitle(pSlide, slide);
        break;
      case "section_header":
        renderSectionHeader(pSlide, slide);
        break;
      case "content":
        renderContent(pSlide, slide, imageMap);
        break;
      case "data_table":
        renderDataTable(pSlide, slide);
        break;
      case "chart":
        renderChart(pSlide, slide);
        break;
      case "comparison":
        renderComparison(pSlide, slide);
        break;
      case "callout":
        renderCallout(pSlide, slide);
        break;
      default:
        renderContent(pSlide, slide, imageMap);
    }
  }

  await prs.writeFile({ fileName: outputPath });
}
