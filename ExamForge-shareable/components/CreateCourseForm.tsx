"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http";

export function CreateCourseForm() {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function createCourse(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    const data = await readJsonResponse<{ error?: string; course?: { id: string } }>(response);
    setSaving(false);
    if (!response.ok || !data?.course?.id) {
      setError(data?.error || "Could not create course.");
      return;
    }
    router.push(`/course/${data.course.id}/upload`);
  }

  return (
    <form onSubmit={createCourse} className="panel flex flex-col gap-3 sm:flex-row">
      <input
        className="field"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Course title"
        required
      />
      <button className="btn whitespace-nowrap" disabled={saving}>
        {saving ? "Creating..." : "Create course"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
