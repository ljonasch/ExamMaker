"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";

type UploadedFile = {
  id: string;
  filename: string;
  mimeType: string;
  charCount: number;
};

type SummaryResult = {
  scope: "course" | "file";
  summary: string;
  title: string;
};

export function UploadedFilesPanel({
  courseId,
  initialFiles
}: {
  courseId: string;
  initialFiles: UploadedFile[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const router = useRouter();

  async function removeFile(fileId: string, filename: string) {
    const confirmed = window.confirm(`Remove ${filename} from this course?`);
    if (!confirmed) return;

    setPendingAction(`remove:${fileId}`);
    setError("");

    const response = await fetch(`/api/courses/${courseId}/files/${fileId}`, { method: "DELETE" });
    const data = await readJsonResponse<{ error?: string }>(response);

    if (!response.ok) {
      setError(getApiErrorMessage(response, data, "Could not remove file."));
      setPendingAction("");
      return;
    }

    setFiles((current) => current.filter((file) => file.id !== fileId));
    if (summary?.scope === "course" || (summary?.scope === "file" && summary.title === filename)) {
      setSummary(null);
    }
    setPendingAction("");
    router.refresh();
  }

  async function summarize(fileId?: string) {
    setPendingAction(fileId ? `summary:${fileId}` : "summary:all");
    setError("");

    const response = await fetch(`/api/courses/${courseId}/summaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fileId ? { fileId } : {})
    });
    const data = await readJsonResponse<{ error?: string; summary?: string; title?: string; scope?: "course" | "file" }>(response);

    if (!response.ok || !data?.summary || !data.title || !data.scope) {
      setError(getApiErrorMessage(response, data, "Could not create summary."));
      setPendingAction("");
      return;
    }

    setSummary({
      scope: data.scope,
      summary: data.summary,
      title: data.title
    });
    setPendingAction("");
    router.refresh();
  }

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Uploaded files</h2>
          <p className="text-sm text-slate-500">
            Remove files you do not want included, or synthesize a quick study summary from one file or the whole set.
          </p>
        </div>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => void summarize()}
          disabled={files.length === 0 || Boolean(pendingAction)}
        >
          {pendingAction === "summary:all" ? "Summarizing..." : "Summarize all files"}
        </button>
      </div>
      {summary ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">{summary.title}</h3>
              <p className="text-xs text-slate-500">
                Summary uses representative extracted text to stay quick and low cost.
              </p>
            </div>
            <button className="btn-secondary" type="button" onClick={() => setSummary(null)}>
              Hide summary
            </button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{summary.summary}</pre>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {files.length === 0 ? <p className="text-sm text-slate-500">No files uploaded yet.</p> : null}
      <div className="divide-y divide-slate-100">
        {files.map((file) => (
          <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{file.filename}</p>
              <p className="text-sm text-slate-500">
                {file.mimeType} - {file.charCount.toLocaleString()} extracted chars
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void summarize(file.id)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === `summary:${file.id}` ? "Summarizing..." : "Summarize"}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                type="button"
                onClick={() => void removeFile(file.id, file.filename)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === `remove:${file.id}` ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
