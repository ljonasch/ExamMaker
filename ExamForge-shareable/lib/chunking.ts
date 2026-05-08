import { MAX_CONTEXT_CHARS } from "./constants";
import { dedupeCourseFiles } from "./course-files";
import type { CourseContextFile } from "./types";

export type RankedChunk = {
  filename: string;
  text: string;
  score: number;
  sourceNote: string;
};

export function splitIntoChunks(text: string, wordsPerChunk = 1500) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
}

export function buildCourseContext(
  files: CourseContextFile[],
  options: { focusTopics?: string; maxChars?: number; includeSyllabusWeighting?: boolean } = {}
) {
  const uniqueFiles = dedupeCourseFiles(files);
  const maxChars = options.maxChars ?? MAX_CONTEXT_CHARS;
  const keywords = extractKeywords(options.focusTopics || "");
  const syllabusFiles = uniqueFiles.filter((file) => isSyllabus(file.filename));
  const materialFiles = uniqueFiles.filter((file) => !isSyllabus(file.filename));
  const sections: string[] = [];
  let remainingChars = maxChars;

  const syllabusBudget = syllabusFiles.length
    ? Math.min(
        Math.floor(
          maxChars * (materialFiles.length ? (options.includeSyllabusWeighting ? 0.22 : 0.12) : 0.45)
        ),
        6_000
      )
    : 0;
  const coverageBudget = Math.min(Math.floor(maxChars * 0.18), 4_500);

  const syllabusSection = buildSyllabusSection(syllabusFiles, syllabusBudget);
  if (syllabusSection) {
    sections.push(syllabusSection);
    remainingChars -= syllabusSection.length + 2;
  }

  const coverageSection = buildCoverageSection(uniqueFiles, coverageBudget);
  if (coverageSection && remainingChars > 0) {
    sections.push(coverageSection.slice(0, remainingChars));
    remainingChars -= coverageSection.length + 2;
  }

  const primarySources = materialFiles.length ? materialFiles : syllabusFiles;
  const excerptsSection = buildExcerptsSection(primarySources, keywords, remainingChars);
  if (excerptsSection) {
    sections.push(excerptsSection);
  }

  return sections.join("\n\n").slice(0, maxChars);
}

function scoreChunk(filename: string, text: string, keywords: string[], chunkIndex: number) {
  const haystack = `${filename} ${text}`.toLowerCase();
  const keywordScore = keywords.reduce((sum, keyword) => sum + countOccurrences(haystack, keyword), 0) * 8;
  const filenameScore = keywords.reduce((sum, keyword) => sum + countOccurrences(filename.toLowerCase(), keyword), 0) * 5;
  const headingBoost = countOccurrences(text, "\n") > 3 ? 3 : 0;
  const firstChunkBoost = chunkIndex === 0 ? 4 : 0;
  const diversityPenalty = chunkIndex * 0.35;
  return keywordScore + filenameScore + headingBoost + firstChunkBoost - diversityPenalty;
}

function extractKeywords(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
    .slice(0, 40);
}

function countOccurrences(text: string, keyword: string) {
  if (!keyword) return 0;
  return text.split(keyword).length - 1;
}

function isSyllabus(filename: string) {
  return /syllabus/i.test(filename);
}

function buildSyllabusSection(files: CourseContextFile[], maxChars: number) {
  if (files.length === 0 || maxChars <= 0) return "";
  const lines = files.flatMap((file) => extractSyllabusHighlights(file.extractedText));
  const uniqueLines = [...new Set(lines)].slice(0, 40);
  const text = uniqueLines.length ? uniqueLines.join("\n") : files.map((file) => file.extractedText).join("\n\n");
  return formatSection("Syllabus weighting and learning goals", text, maxChars);
}

function buildCoverageSection(files: CourseContextFile[], maxChars: number) {
  if (files.length === 0 || maxChars <= 0) return "";
  const lines = files.map((file) => {
    const heading = extractHeadingPreview(file.extractedText);
    return heading ? `${file.filename}: ${heading}` : file.filename;
  });
  return formatSection("Course coverage map", lines.join("\n"), maxChars);
}

function buildExcerptsSection(files: CourseContextFile[], keywords: string[], maxChars: number) {
  if (files.length === 0 || maxChars <= 0) return "";

  const rankedByFile = files
    .map((file) => ({
      filename: file.filename,
      chunks: splitIntoChunks(file.extractedText).map((chunk, chunkIndex) => ({
        filename: file.filename,
        text: chunk,
        score: scoreChunk(file.filename, chunk, keywords, chunkIndex),
        sourceNote: `${isSyllabus(file.filename) ? "Syllabus" : "Material"}: ${file.filename}`
      }))
        .sort((left, right) => right.score - left.score)
    }))
    .sort((left, right) => (right.chunks[0]?.score || 0) - (left.chunks[0]?.score || 0));

  const selected: string[] = [];
  let chars = 0;
  const maxRounds = materialHeavyRoundCount(files.length);

  for (let round = 0; round < maxRounds; round += 1) {
    let addedInRound = false;
    for (const file of rankedByFile) {
      const chunk = file.chunks[round];
      if (!chunk) continue;
      const block = `[${chunk.sourceNote}]\n${chunk.text}`;
      if (chars + block.length > maxChars) continue;
      selected.push(block);
      chars += block.length + 2;
      addedInRound = true;
    }
    if (!addedInRound) break;
  }

  return formatSection("Representative source excerpts", selected.join("\n\n"), maxChars);
}

function materialHeavyRoundCount(fileCount: number) {
  if (fileCount >= 24) return 1;
  if (fileCount >= 10) return 2;
  return 3;
}

function extractSyllabusHighlights(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const topical = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (isAdministrativeLine(lower)) return false;
    return /week|topic|objective|outcome|module|chapter|lecture|reading|schedule|project|midterm|final/.test(lower);
  });
  return topical.length ? topical : lines.filter((line) => !isAdministrativeLine(line.toLowerCase())).slice(0, 25);
}

function extractHeadingPreview(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = lines.filter((line) => {
    if (line.length < 4 || line.length > 90) return false;
    if (/^\d+$/.test(line)) return false;
    return !isAdministrativeLine(line.toLowerCase());
  });
  return [...new Set(candidates)].slice(0, 2).join(" | ");
}

function isAdministrativeLine(line: string) {
  return /attendance|cheating|accommodat|office hour|officehour|late work|grading|points|email|zoom|required in person|quiz scores|academic integrity/.test(line);
}

function formatSection(title: string, body: string, maxChars: number) {
  if (!body.trim() || maxChars <= 0) return "";
  return `${title}\n${body}`.slice(0, maxChars);
}
