"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";

export function ClearExamsButton({ courseId, examCount }: { courseId: string; examCount: number }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function clearExams() {
    if (examCount === 0) return;

    const confirmed = window.confirm(
      `Delete ${examCount} generated ${examCount === 1 ? "exam" : "exams"} for this course? This also removes saved attempts.`
    );
    if (!confirmed) return;

    setStatus("Clearing past exams...");
    setError("");

    const response = await fetch(`/api/courses/${courseId}/exams`, { method: "DELETE" });
    const data = await readJsonResponse<{ error?: string }>(response);

    if (!response.ok) {
      setError(getApiErrorMessage(response, data, "Could not clear past exams."));
      setStatus("");
      return;
    }

    setStatus("");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
        onClick={clearExams}
        disabled={Boolean(status) || examCount === 0}
        type="button"
      >
        {status || "Clear past exams"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
