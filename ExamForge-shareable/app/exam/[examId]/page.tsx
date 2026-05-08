import { notFound } from "next/navigation";
import { ExamForm } from "@/components/ExamForm";
import { UsageSummaryCard } from "@/components/UsageSummaryCard";
import { prisma } from "@/lib/prisma";
import { ExamQuestionSchema } from "@/lib/types";
import { getUsageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const [exam, usageSummary] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    getUsageSummary({ examId })
  ]);
  if (!exam) notFound();
  const questions = ExamQuestionSchema.array().parse(JSON.parse(exam.questionsJson));
  return (
    <div className="space-y-6">
      <ExamForm examId={exam.id} courseId={exam.courseId} title={exam.title} questions={questions} />
      <UsageSummaryCard
        title="Exam API usage"
        description="Expand to review generation and grading costs tied to this exam."
        summary={usageSummary}
        variant="compact"
      />
    </div>
  );
}
