type TitleSourceFile = {
  filename: string;
  extractedText?: string;
  charCount?: number;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "analysis",
  "and",
  "assessment",
  "basic",
  "case",
  "chapter",
  "class",
  "course",
  "day",
  "designing",
  "document",
  "draft",
  "example",
  "examples",
  "exam",
  "final",
  "for",
  "from",
  "guide",
  "human",
  "improved",
  "index",
  "intro",
  "introduction",
  "lecture",
  "materials",
  "model",
  "module",
  "notes",
  "overview",
  "people",
  "pdf",
  "practice",
  "problem",
  "problems",
  "reading",
  "readings",
  "revised",
  "sample",
  "session",
  "slide",
  "slides",
  "spring",
  "student",
  "study",
  "summary",
  "syllabus",
  "task",
  "test",
  "text",
  "the",
  "topic",
  "topics",
  "unit",
  "week",
  "worksheet"
]);

const ACRONYMS = new Set(["li", "msd", "niosh", "rula", "rwl", "uiux"]);

export function suggestExamTitle(courseTitle: string, files: TitleSourceFile[]) {
  const topics = rankTopicPhrases(files).slice(0, 2);

  if (topics.length === 0) {
    return `${courseTitle}: Core Concepts Review`;
  }

  if (topics.length === 1) {
    return `${courseTitle}: ${topics[0]}`;
  }

  return `${courseTitle}: ${topics[0]} and ${topics[1]}`;
}

export function buildUniqueExamTitle(desiredTitle: string, existingTitles: string[]) {
  const trimmedTitle = desiredTitle.trim() || "Untitled Exam";
  const { baseTitle } = splitTrailingSequence(trimmedTitle);
  const normalizedBase = normalizeTitle(baseTitle);

  const matchingNumbers = existingTitles
    .map((title) => splitTrailingSequence(title))
    .filter((title) => normalizeTitle(title.baseTitle) === normalizedBase)
    .map((title) => title.sequence);

  if (matchingNumbers.length === 0) {
    return trimmedTitle;
  }

  const nextSequence = Math.max(...matchingNumbers) + 1;
  return `${baseTitle} (${nextSequence})`;
}

function rankTopicPhrases(files: TitleSourceFile[]) {
  const scores = new Map<string, number>();

  for (const file of files) {
    const filenameText = normalizeSourceText(file.filename.replace(/\.[^.]+$/, ""));
    addPhraseScores(scores, filenameText, 3);

    const bodyText = normalizeSourceText((file.extractedText || "").slice(0, 1_500));
    addPhraseScores(scores, bodyText, 1);
  }

  const ranked = [...scores.entries()]
    .filter((entry) => entry[1] > 1.5)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([phrase]) => phrase);

  const selected: string[] = [];
  const usedWords = new Set<string>();

  for (const phrase of ranked) {
    const words = phrase.split(" ");
    const overlapCount = words.filter((word) => usedWords.has(word)).length;
    if (overlapCount === words.length) continue;
    if (overlapCount > 1) continue;

    selected.push(formatPhrase(phrase));
    for (const word of words) usedWords.add(word);
    if (selected.length === 3) break;
  }

  return selected;
}

function addPhraseScores(scores: Map<string, number>, sourceText: string, weight: number) {
  const tokens = extractMeaningfulTokens(sourceText);
  for (let size = 3; size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phraseTokens = tokens.slice(index, index + size);
      if (phraseTokens.length !== size) continue;
      if (phraseTokens.some((token) => STOP_WORDS.has(token))) continue;

      const phrase = phraseTokens.join(" ");
      const bonus = size === 1 ? 1 : size === 2 ? 2.4 : 2.8;
      scores.set(phrase, (scores.get(phrase) || 0) + weight * bonus);
    }
  }
}

function normalizeSourceText(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeaningfulTokens(value: string) {
  return (value.toLowerCase().match(/[a-z][a-z]{2,}/g) || []).filter((token) => !STOP_WORDS.has(token));
}

function formatPhrase(phrase: string) {
  return phrase
    .split(" ")
    .map((word) => {
      if (ACRONYMS.has(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function splitTrailingSequence(value: string) {
  const match = value.trim().match(/^(.*?)(?: \((\d+)\))?$/);
  const baseTitle = match?.[1]?.trim() || value.trim();
  const sequence = Number(match?.[2] || 1);
  return { baseTitle, sequence };
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
