import path from "path";
import type OpenAI from "openai";
import JSZip from "jszip";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import * as XLSX from "xlsx";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_SLIDE_OCR_IMAGES,
  MAX_PDF_OCR_BYTES,
  MAX_PDF_OCR_PAGES,
  MAX_UPLOAD_BYTES,
  PDF_VISION_TEXT_THRESHOLD,
  SLIDE_OCR_TEXT_THRESHOLD
} from "./constants";
import { extractImageTextWithOpenAI, extractPdfStudyNotesWithOpenAI } from "./openai";
import type { UsageScope } from "./usage";

type ExtractionOptions = {
  enableImageOcr?: boolean;
  openai?: OpenAI;
  usageScope?: UsageScope;
};

type PptxSlide = {
  imageTargets: string[];
  lines: string[];
  slideNumber: number;
};

export function sanitizeFilename(filename: string) {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return base || "upload.txt";
}

export function validateUpload(file: File) {
  const filename = sanitizeFilename(file.name);
  const ext = path.extname(filename).toLowerCase();
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("This file is larger than the 100 MB upload limit. Compress or split it and upload again.");
  }
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error("Unsupported file type. Allowed: pdf, docx, pptx, txt, md, csv, xlsx.");
  }
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type) && ext !== ".md") {
    throw new Error("Unsupported MIME type.");
  }
  return { filename, ext };
}

export async function extractTextFromFile(file: File, options: ExtractionOptions = {}) {
  const { filename, ext } = validateUpload(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  try {
    if (ext === ".pdf") {
      const parsed = await pdf(buffer);
      text = parsed.text;

      if (shouldUsePdfVisionFallback({
        extractedText: text,
        enableImageOcr: options.enableImageOcr,
        openai: options.openai,
        fileSize: buffer.length,
        pageCount: parsed.numpages
      })) {
        text = await extractPdfStudyNotesWithOpenAI({
          openai: options.openai!,
          pdfBytes: buffer,
          filename,
          usageScope: options.usageScope
        });
      }
    } else if (ext === ".docx") {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (ext === ".pptx") {
      text = await extractTextFromPptx(buffer, options);
    } else if (ext === ".xlsx") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      text = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`;
      }).join("\n\n");
    } else {
      text = buffer.toString("utf8");
    }
  } catch (error) {
    throw new Error(`Could not extract text from ${filename}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const extractedText = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!extractedText) {
    if (ext === ".pdf") {
      if (options.enableImageOcr && buffer.length > MAX_PDF_OCR_BYTES) {
        throw new Error(
          `No readable text was extracted from ${filename}. OCR fallback only supports scanned PDFs up to 50 MB, so split or compress this file and upload again.`
        );
      }
      throw new Error(`No readable text was extracted from ${filename}. This PDF appears scanned, image-only, or protected.`);
    }
    throw new Error(`No readable text was extracted from ${filename}.`);
  }
  return {
    filename,
    mimeType: file.type || "application/octet-stream",
    extractedText,
    charCount: extractedText.length
  };
}

async function extractTextFromPptx(buffer: Buffer, options: ExtractionOptions) {
  const zip = await JSZip.loadAsync(buffer);
  const slides = await readPptxSlides(zip);
  const sections: string[] = [];
  let remainingOcrImages = options.enableImageOcr && options.openai ? MAX_SLIDE_OCR_IMAGES : 0;

  for (const slide of slides) {
    const parts: string[] = [];
    if (slide.lines.length) {
      parts.push(slide.lines.join("\n"));
    }

    if (shouldOcrSlide(slide.lines.join("\n"), slide.imageTargets, remainingOcrImages)) {
      const ocrSections: string[] = [];

      for (const imageTarget of slide.imageTargets) {
        if (remainingOcrImages <= 0) break;
        remainingOcrImages -= 1;

        const ocrText = await extractSlideImageText(
          zip,
          imageTarget,
          slide.slideNumber,
          options.openai!,
          options.usageScope
        );
        if (!ocrText) continue;
        ocrSections.push(ocrText);
      }

      if (ocrSections.length) {
        parts.push(`Image text\n${ocrSections.join("\n")}`);
      }
    }

    if (parts.length === 0) continue;
    sections.push(`Slide ${slide.slideNumber}\n${parts.join("\n")}`);
  }

  return sections.join("\n\n");
}

async function extractSlideImageText(
  zip: JSZip,
  imageTarget: string,
  slideNumber: number,
  openai: OpenAI,
  usageScope?: UsageScope
) {
  const mimeType = mimeTypeFromImagePath(imageTarget);
  if (!mimeType) return "";

  const imageFile = zip.file(imageTarget);
  if (!imageFile) return "";

  const imageBuffer = await imageFile.async("nodebuffer");
  if (imageBuffer.length === 0 || imageBuffer.length > 2_000_000) return "";

  try {
    return await extractImageTextWithOpenAI({
      openai,
      imageBytes: imageBuffer,
      mimeType,
      slideLabel: `slide ${slideNumber}`,
      usageScope
    });
  } catch {
    return "";
  }
}

async function readPptxSlides(zip: JSZip) {
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => getSlideNumber(left) - getSlideNumber(right));

  const slides: PptxSlide[] = [];
  for (const slidePath of slidePaths) {
    const xml = await zip.files[slidePath]?.async("string");
    if (!xml) continue;

    const lines = extractXmlTextRuns(xml);
    const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relsXml = await zip.files[relsPath]?.async("string");
    const imageTargets = extractSlideImageTargets(xml, relsXml || "", slidePath);

    slides.push({
      slideNumber: getSlideNumber(slidePath),
      lines,
      imageTargets
    });
  }

  return slides;
}

export function extractXmlTextRuns(xml: string) {
  return Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g), (match) => decodeXmlEntities(match[1]).trim()).filter(Boolean);
}

export function extractSlideImageTargets(slideXml: string, relsXml: string, slidePath: string) {
  if (!relsXml) return [];

  const embeddedIds = Array.from(slideXml.matchAll(/<a:blip[^>]*r:embed="([^"]+)"/g), (match) => match[1]);
  const targets = new Map<string, string>();

  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0];
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    const type = tag.match(/\bType="([^"]+)"/)?.[1] || "";

    if (!id || !target || !/\/image\b/.test(type)) continue;
    targets.set(id, target);
  }

  const dirname = path.posix.dirname(slidePath);
  return [...new Set(embeddedIds.map((id) => targets.get(id)).filter(Boolean).map((target) => path.posix.normalize(path.posix.join(dirname, target!))))];
}

export function shouldOcrSlide(text: string, imageTargets: string[], remainingOcrImages: number) {
  if (remainingOcrImages <= 0 || imageTargets.length === 0) return false;
  return text.replace(/\s+/g, " ").trim().length < SLIDE_OCR_TEXT_THRESHOLD;
}

export function shouldUsePdfVisionFallback({
  extractedText,
  enableImageOcr,
  openai,
  fileSize,
  pageCount
}: {
  extractedText: string;
  enableImageOcr?: boolean;
  openai?: OpenAI;
  fileSize: number;
  pageCount: number;
}) {
  if (!enableImageOcr || !openai) return false;
  if (fileSize > MAX_PDF_OCR_BYTES) return false;
  if (pageCount > MAX_PDF_OCR_PAGES) return false;
  return extractedText.replace(/\s+/g, " ").trim().length < PDF_VISION_TEXT_THRESHOLD;
}

function getSlideNumber(pathname: string) {
  return Number(pathname.match(/slide(\d+)\.xml$/)?.[1] || 0);
}

function mimeTypeFromImagePath(imagePath: string) {
  const ext = path.posix.extname(imagePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "";
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}
