export const MAX_CONTEXT_CHARS = 25_000;
export const MAX_OUTPUT_TOKENS = 6_000;
export const MAX_QUESTIONS = 40;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const COST_LIMIT_USD = 0.1;
export const SUMMARY_CONTEXT_CHARS = 20_000;
export const SUMMARY_MAX_OUTPUT_TOKENS = 900;
export const MAX_SLIDE_OCR_IMAGES = 6;
export const SLIDE_OCR_TEXT_THRESHOLD = 160;
export const OCR_MAX_OUTPUT_TOKENS = 220;
export const MAX_PDF_OCR_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_OCR_PAGES = 40;
export const PDF_VISION_TEXT_THRESHOLD = 200;

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
export const GRADING_MODEL = process.env.OPENAI_GRADING_MODEL || DEFAULT_MODEL;
export const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md", ".csv", ".xlsx"];
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
