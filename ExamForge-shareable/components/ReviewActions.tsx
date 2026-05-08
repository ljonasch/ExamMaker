"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionId } from "./session";

export function ReviewActions({ examId, courseId }: { examId: string; courseId: string }) {
  const router = useRouter();

  async function retake() {
    const response = await fetch(`/api/exams/${examId}/retake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId() })
    });
    if (response.ok) router.push(`/exam/${examId}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button className="btn" onClick={retake}>Retake exam</button>
      <Link className="btn-secondary" href={`/course/${courseId}/generate`}>Generate another exam</Link>
    </div>
  );
}
