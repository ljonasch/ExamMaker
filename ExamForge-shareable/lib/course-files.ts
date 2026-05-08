import { stableHash } from "./hash";

type FileLike = {
  filename: string;
};

type FingerprintFileLike = FileLike & {
  extractedText: string;
  charCount: number;
  createdAt?: Date | number | string | null;
};

export function dedupeCourseFiles<T extends FileLike>(files: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const file of files) {
    const key = file.filename.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }

  return unique;
}

export function buildCourseFilesFingerprint(files: FingerprintFileLike[]) {
  const normalized = dedupeCourseFiles(
    [...files].sort((left, right) => right.filename.localeCompare(left.filename))
  )
    .map((file) => ({
      filename: file.filename.toLowerCase(),
      charCount: file.charCount,
      createdAt: serializeCreatedAt(file.createdAt)
    }))
    .sort((left, right) => left.filename.localeCompare(right.filename));

  return stableHash(normalized);
}

function serializeCreatedAt(value: Date | number | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
