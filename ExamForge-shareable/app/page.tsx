import Link from "next/link";
import { CreateCourseForm } from "@/components/CreateCourseForm";
import { listCourses } from "@/lib/db";
import { UsageSummaryCard } from "@/components/UsageSummaryCard";
import { getUsageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [courses, usageSummary] = await Promise.all([listCourses(), getUsageSummary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal">ExamForge</h1>
        <p className="mt-2 text-slate-600">Create practice exams from local course materials.</p>
      </div>
      <CreateCourseForm />
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((course) => (
          <Link key={course.id} href={`/course/${course.id}/upload`} className="panel block hover:border-slate-400">
            <h2 className="text-lg font-semibold">{course.title}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {course._count.files} files - {course._count.exams} exams - Created {course.createdAt.toLocaleDateString()}
            </p>
            <p className="mt-2 text-sm text-slate-600">API total: ${course.usageUsdTotal.toFixed(course.usageUsdTotal >= 1 ? 2 : 4)}</p>
          </Link>
        ))}
      </div>
      <UsageSummaryCard
        title="Workspace API usage"
        description="Expand to review total spend across uploads, summaries, generation, and grading."
        summary={usageSummary}
        variant="compact"
      />
    </div>
  );
}
