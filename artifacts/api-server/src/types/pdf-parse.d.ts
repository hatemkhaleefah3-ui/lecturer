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
