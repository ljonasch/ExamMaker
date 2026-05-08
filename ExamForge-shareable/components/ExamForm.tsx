"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionId } from "./session";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import type { ExamQuestion } from "@/lib/types";

type SaveState = "Saved" | "Saving..." | "Unsaved changes";

function buildDraftKey(sessionId: string, examId: string) {
  return `examforge.draft.${sessionId}.${examId}`;
}

function normalizeAnswers(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function parseAnswers(raw: string) {
  try {
    return normalizeAnswers(JSON.parse(raw || "{}"));
  } catch {
    return {};
  }
}

function serializeAnswers(answers: Record<string, string>) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(answers).sort(([left], [right]) => left.localeCompare(right)))
  );
}

function readDraft(key: string) {
  try {
    return normalizeAnswers(JSON.parse(localStorage.getItem(key) || "{}"));
  } catch {
    return {};
  }
}

function writeDraft(key: string, answers: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // Ignore local draft storage failures and fall back to server saves.
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore local draft cleanup failures.
  }
}

export function ExamForm({
  examId,
  courseId,
  title,
  questions
}: {
  examId: string;
  courseId: string;
  title: string;
  questions: ExamQuestion[];
}) {
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [submitting, setSubmitting] = useState(false);
  const [returningLater, setReturningLater] = useState(false);
  const [error, setError] = useState("");
  const [draftRecovered, setDraftRecovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const attemptIdRef = useRef("");
  const draftKeyRef = useRef("");
  const dirtyRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  useEffect(() => {
    dirtyRef.current = saveState === "Unsaved changes";
  }, [saveState]);

  useEffect(() => {
    let cancelled = false;
    const sessionId = getSessionId();
    const draftKey = buildDraftKey(sessionId, examId);
    draftKeyRef.current = draftKey;

    fetch(`/api/exams/${examId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    })
      .then((response) => readJsonResponse<{ error?: string; attempt?: { id: string; answersJson: string } }>(response))
      .then((data) => {
        if (cancelled) return;
        if (!data?.attempt) {
          setError("Could not load your exam attempt.");
          return;
        }

        const serverAnswers = parseAnswers(data.attempt.answersJson || "{}");
        const localDraft = readDraft(draftKey);
        const mergedAnswers = { ...serverAnswers, ...localDraft };
        const recoveredDraft = serializeAnswers(localDraft) !== "{}" && serializeAnswers(localDraft) !== serializeAnswers(serverAnswers);

        setAttemptId(data.attempt.id);
        setAnswers(mergedAnswers);
        setDraftRecovered(recoveredDraft);
        setSaveState(recoveredDraft ? "Unsaved changes" : "Saved");

        answersRef.current = mergedAnswers;
        attemptIdRef.current = data.attempt.id;
        dirtyRef.current = recoveredDraft;

        if (recoveredDraft) {
          writeDraft(draftKey, mergedAnswers);
        } else {
          clearDraft(draftKey);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your exam attempt.");
      });

    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!attemptId || saveState !== "Unsaved changes" || submitting || returningLater) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attemptId, answers, returningLater, saveState, submitting]);

  useEffect(() => {
    function flushBeforeExit() {
      if (draftKeyRef.current) writeDraft(draftKeyRef.current, answersRef.current);
      if (attemptIdRef.current && dirtyRef.current) {
        void save({ manageState: false, preferBeacon: true });
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flushBeforeExit();
    }

    window.addEventListener("pagehide", flushBeforeExit);
    window.addEventListener("beforeunload", flushBeforeExit);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushBeforeExit);
      window.removeEventListener("beforeunload", flushBeforeExit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function save(options: { manageState?: boolean; preferBeacon?: boolean } = {}) {
    const { manageState = true, preferBeacon = false } = options;
    if (!attemptIdRef.current) return false;

    const snapshot = answersRef.current;
    const snapshotSignature = serializeAnswers(snapshot);
    const payload = JSON.stringify({ answers: snapshot });

    if (draftKeyRef.current) writeDraft(draftKeyRef.current, snapshot);

    if (manageState) setSaveState("Saving...");

    try {
      if (preferBeacon && typeof navigator.sendBeacon === "function") {
        return navigator.sendBeacon(
          `/api/attempts/${attemptIdRef.current}`,
          new Blob([payload], { type: "application/json" })
        );
      }

      const response = await fetch(`/api/attempts/${attemptIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true
      });

      if (!response.ok) throw new Error("Could not save your answers.");

      if (serializeAnswers(answersRef.current) === snapshotSignature) {
        if (draftKeyRef.current) clearDraft(draftKeyRef.current);
        dirtyRef.current = false;
        if (manageState) setSaveState("Saved");
      } else {
        if (draftKeyRef.current) writeDraft(draftKeyRef.current, answersRef.current);
        dirtyRef.current = true;
        if (manageState) setSaveState("Unsaved changes");
      }

      setError("");
      return true;
    } catch {
      dirtyRef.current = true;
      if (manageState) setSaveState("Unsaved changes");
      setError("Could not save your latest answers yet. Your local draft is still on this device.");
      return false;
    }
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswers((current) => {
      const next = { ...current, [questionId]: value };
      answersRef.current = next;
      if (draftKeyRef.current) writeDraft(draftKeyRef.current, next);
      return next;
    });
    dirtyRef.current = true;
    setDraftRecovered(false);
    setError("");
    setSaveState("Unsaved changes");
  }

  async function saveAndReturnLater() {
    if (!attemptId) return;
    setReturningLater(true);
    const saved = saveState === "Saved" ? true : await save();
    setReturningLater(false);
    if (!saved) return;
    router.push(`/course/${courseId}/generate`);
  }

  async function submit() {
    if (!attemptId) return;
    setSubmitting(true);

    const saved = saveState === "Saved" ? true : await save();
    if (!saved) {
      setSubmitting(false);
      return;
    }

    const response = await fetch(`/api/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answersRef.current })
    });

    if (!response.ok) {
      const data = await readJsonResponse<{ error?: string }>(response);
      setError(getApiErrorMessage(response, data, "Could not submit the exam."));
      setSubmitting(false);
      return;
    }

    if (draftKeyRef.current) clearDraft(draftKeyRef.current);
    router.push(`/exam/${examId}/review?attemptId=${attemptId}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm text-slate-500">{questions.length} questions</p>
          <p className="mt-2 text-xs text-slate-500">Autosaves every 2 seconds, on blur, and when you leave the page.</p>
        </div>
        <span className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
          {submitting ? "Grading..." : returningLater ? "Saving..." : saveState}
        </span>
      </div>
      {draftRecovered ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Recovered a local draft that had not reached the server yet.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {questions.map((question, index) => (
        <section key={question.id} className="panel space-y-3">
          <div className="flex justify-between gap-4">
            <h2 className="text-base font-semibold">Question {index + 1}</h2>
            <span className="text-sm text-slate-500">{question.points} pts</span>
          </div>
          <p className="whitespace-pre-wrap text-slate-800">{question.question}</p>
          {question.type === "multiple_choice" && question.options ? (
            <div className="space-y-2">
              {question.options.map((option) => (
                <label key={option} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option}
                    onChange={() => updateAnswer(question.id, option)}
                    onBlur={() => void save()}
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : null}
          {question.type === "true_false" ? (
            <div className="flex gap-4">
              {["True", "False"].map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option}
                    onChange={() => updateAnswer(question.id, option)}
                    onBlur={() => void save()}
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : null}
          {question.type === "short_answer" || question.type === "calculation" ? (
            <textarea
              className="field"
              rows={question.type === "calculation" ? 6 : 4}
              placeholder={question.type === "calculation" ? "Answer and show work" : "Your answer"}
              value={answers[question.id] || ""}
              onChange={(event) => updateAnswer(question.id, event.target.value)}
              onBlur={() => void save()}
            />
          ) : null}
        </section>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-secondary"
          onClick={saveAndReturnLater}
          disabled={!attemptId || saveState === "Saving..." || submitting || returningLater}
          type="button"
        >
          {returningLater ? "Saving..." : "Save and return later"}
        </button>
        <button
          className="btn"
          onClick={submit}
          disabled={!attemptId || saveState === "Saving..." || submitting || returningLater}
          type="button"
        >
          {submitting ? "Grading..." : "Submit exam"}
        </button>
      </div>
    </div>
  );
}
