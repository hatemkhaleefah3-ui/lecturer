export interface TextBlock {
  index: number;
  text: string;
  pageNum?: number;
}

export interface ExtractedImage {
  index: number;
  dataBase64: string;
  mimeType: string;
  altText?: string;
  nearTextIndex?: number;
  pageNum?: number;
}

export interface ExtractionResult {
  textBlocks: TextBlock[];
  images: ExtractedImage[];
}

export type SlideType =
  | "title"
  | "section_header"
  | "content"
  | "data_table"
  | "chart"
  | "comparison"
  | "callout";

export type ChartType = "bar" | "line" | "pie";
export type CalloutStyle = "definition" | "warning" | "takeaway";

export interface SlideImage {
  originalIndex: number;
  dataBase64?: string;
  mimeType?: string;
  altText?: string;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{ label: string; values: number[] }>;
}

export interface SlideData {
  index: number;
  type: SlideType;
  title?: string;
  subtitle?: string;
  body?: string;
  images?: SlideImage[];
  tableHeaders?: string[];
  tableRows?: string[][];
  chartType?: ChartType;
  chartData?: ChartData;
  leftColumn?: string;
  rightColumn?: string;
  calloutIcon?: string;
  calloutStyle?: CalloutStyle;
  textBlockIndices: number[];
}

export interface IntegrityReport {
  textBlocksExtracted: number;
  textBlocksPlaced: number;
  imagesExtracted: number;
  imagesPlaced: number;
  unplacedTextIndices: number[];
  unplacedImageIndices: number[];
  allPlaced: boolean;
}

export interface SlidesResult {
  slides: SlideData[];
  integrity: IntegrityReport;
}
