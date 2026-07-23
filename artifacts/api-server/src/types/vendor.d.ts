declare module "pdf-parse" {
  interface PdfParseResult {
    text?: string;
    numpages?: number;
    numrender?: number;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  }

  function pdfParse(data: Uint8Array | Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "pptxgenjs" {
  interface TextPropsOptions {
    /** @deprecated Use charSpacing in new code. Kept for compatibility with the existing renderer. */
    characterSpacing?: number;
  }
}
