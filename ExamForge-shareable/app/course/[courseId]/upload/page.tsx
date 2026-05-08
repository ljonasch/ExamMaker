import Link from "next/link";
import { notFound } from "next/navigation";
import { UploadForm } from "@/components/UploadForm";
import { UploadedFilesPanel } from "@/components/UploadedFilesPanel";
import { ClearExamsButton } from "@/components/ClearExamsButton";
import { getCourse } from "@/lib/db";
import { UsageSummaryCard } from "@/components/UsageSummaryCard";
import { getUsageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function UploadPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const [course, usageSummary] = await Promise.all([getCourse(courseId), getUsageSummary({ courseId })]);
  if (!course) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">{course.title}</h1>
          <p className="text-slate-600">Upload notes, slides, readings, syllabus, and documents.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href="/">
            Home
          </Link>
          <Link className="btn-secondary" href={`/course/${course.id}/generate`}>
            Generate exam
          </Link>
        </div>
      </div>
      <UploadForm courseId={course.id} />
      <UploadedFilesPanel courseId={course.id} initialFiles={course.files} />
      {course.exams.length ? (
        <section className="panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Past exams</h2>
              <p className="text-sm text-slate-500">
                Open an earlier exam directly from this course page without generating a new one.
              </p>
            </div>
            <ClearExamsButton courseId={course.id} examCount={course.exams.length} />
          </div>
          <div className="space-y-2">
            {course.exams.map((exam) => (
              <Link
                key={exam.id}
                href={`/exam/${exam.id}`}
                className="block rounded-md border border-slate-200 p-3 hover:border-slate-400"
              >
                {exam.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <UsageSummaryCard
        title="Course API usage"
        description="Expand to review upload, summary, generation, and grading costs for this course."
        summary={usageSummary}
        variant="compact"
      />
    </div>
  );
}
