"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";

type UploadResult =
  | { ok: true; file: { id: string } }
  | { ok: false; filename: string; error: string };

export function UploadForm({ courseId }: { courseId: string }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [failures, setFailures] = useState<Array<{ filename: string; error: string }>>([]);
  const router = useRouter();

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFailures([]);
    setStatus("Extracting files...");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/courses/${courseId}/files`, { method: "POST", body: formData });
    const data = await readJsonResponse<{ error?: string; results?: UploadResult[] }>(response);
    if (!response.ok) {
      setError(getApiErrorMessage(response, data, "Upload failed."));
      setStatus("");
      return;
    }
    const results = data?.results || [];
    const failedResults = results.filter((result): result is Extract<UploadResult, { ok: false }> => !result.ok);
    const successCount = results.length - failedResults.length;
    setFailures(failedResults.map((result) => ({ filename: result.filename, error: result.error })));
    setStatus(
      failedResults.length
        ? `Extracted ${successCount} of ${results.length} file(s).`
        : `Extraction complete for ${results.length} file(s).`
    );
    router.refresh();
  }

  return (
    <form onSubmit={upload} className="panel space-y-4">
      <div>
        <label className="label" htmlFor="files">Course materials</label>
        <input
          id="files"
          name="files"
          type="file"
          multiple
          className="field mt-1"
          accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx"
          required
        />
        <p className="mt-2 text-sm text-slate-500">Allowed: PDF, DOCX, PPTX, TXT, MD, CSV, XLSX. Max 100 MB per file.</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input className="mt-1" type="checkbox" name="enableImageRecognition" />
        <span>
          Recognize text and simple visual meaning from scanned or image-heavy content
          <span className="block text-xs text-slate-500">
            Opt-in, low-cost fallback for scanned PDFs and low-text PPTX slides. Unclear visuals are skipped.
          </span>
        </span>
      </label>
      <button className="btn">Upload and extract</button>
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {failures.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Files that still need attention</p>
          <ul className="mt-2 space-y-1">
            {failures.map((failure) => (
              <li key={`${failure.filename}-${failure.error}`}>
                {failure.filename}: {failure.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
