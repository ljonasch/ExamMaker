"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import { estimateExamCost } from "@/lib/cost";

const types = [
  ["multiple_choice", "Multiple choice"],
  ["true_false", "True/false"],
  ["short_answer", "Short answer"],
  ["calculation", "Calculation"]
];

export function GenerateExamForm({
  courseId,
  totalChars,
  suggestedTitle
}: {
  courseId: string;
  totalChars: number;
  suggestedTitle: string;
}) {
  const [selectedTypes, setSelectedTypes] = useState(["multiple_choice", "short_answer"]);
  const [allowHigherCost, setAllowHigherCost] = useState(false);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const estimate = useMemo(() => {
    const contextChars = Math.min(totalChars, 25_000);
    const result = estimateExamCost(contextChars);
    return { inputTokens: result.inputTokens, cost: result.estimatedUsd };
  }, [totalChars]);

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("Generating exam...");
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get("title"),
      questionCount: Number(form.get("questionCount")),
      questionTypes: selectedTypes,
      difficulty: form.get("difficulty"),
      percentCalculation: Number(form.get("percentCalculation")),
      percentRecall: Number(form.get("percentRecall")),
      focusTopics: form.get("focusTopics"),
      includeSyllabusWeighting: form.get("includeSyllabusWeighting") === "on",
      allowHigherCost,
      forceRegenerate
    };
    const response = await fetch(`/api/courses/${courseId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await readJsonResponse<{ error?: string; examId: string; cached: boolean }>(response);
    if (!response.ok) {
      setError(getApiErrorMessage(response, data, "Generation failed."));
      setStatus("");
      return;
    }
    if (!data?.examId) {
      setError("Generation failed. The server returned an invalid response.");
      setStatus("");
      return;
    }
    setStatus(data.cached ? "Using cached exam..." : "Exam generated.");
    router.push(`/exam/${data.examId}`);
  }

  return (
    <form onSubmit={generate} className="panel space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Exam title</label>
          <input className="field mt-1" name="title" defaultValue={suggestedTitle} />
        </div>
        <div>
          <label className="label">Number of questions</label>
          <input className="field mt-1" name="questionCount" type="number" min="1" max="40" defaultValue="10" />
        </div>
        <div>
          <label className="label">Difficulty</label>
          <select className="field mt-1" name="difficulty" defaultValue="mixed">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div>
          <label className="label">Calculation-based percent</label>
          <input className="field mt-1" name="percentCalculation" type="number" min="0" max="100" defaultValue="20" />
        </div>
        <div>
          <label className="label">Recall/from-notes percent</label>
          <input className="field mt-1" name="percentRecall" type="number" min="0" max="100" defaultValue="50" />
        </div>
        <div>
        <label className="label">Question types</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
            {types.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(value)}
                  onChange={(event) => {
                    setSelectedTypes((current) =>
                      event.target.checked ? [...current, value] : current.filter((item) => item !== value)
                    );
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="label">Focus topics</label>
        <textarea className="field mt-1" name="focusTopics" rows={3} placeholder="Optional topics, chapters, learning outcomes..." />
      </div>
      <p className="text-sm text-slate-500">
        New exams now favor concepts, interpretation, and representative calculations over one-off lecture-example trivia.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="includeSyllabusWeighting" />
          Include syllabus weighting
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowHigherCost} onChange={(event) => setAllowHigherCost(event.target.checked)} />
          Allow higher cost
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={forceRegenerate} onChange={(event) => setForceRegenerate(event.target.checked)} />
          Force regenerate
        </label>
      </div>
      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        Estimated generation cost: ${estimate.cost.toFixed(4)} using about {estimate.inputTokens.toLocaleString()} input tokens.
      </div>
      <button className="btn" disabled={selectedTypes.length === 0 || Boolean(status)}>
        {status || "Generate exam"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
