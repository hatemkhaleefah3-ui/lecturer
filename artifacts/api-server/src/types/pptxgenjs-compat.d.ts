import "pptxgenjs";

declare module "pptxgenjs" {
  interface TextPropsOptions {
    /** @deprecated Use charSpacing in new code. Kept for compatibility with the existing renderer. */
    characterSpacing?: number;
  }
}
