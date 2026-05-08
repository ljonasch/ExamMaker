import { notFound } from "next/navigation";
import { z } from "zod";
import { ReviewActions } from "@/components/ReviewActions";
import { UsageSummaryCard } from "@/components/UsageSummaryCard";
import { prisma } from "@/lib/prisma";
import { ExamQuestionSchema, GradingResultSchema } from "@/lib/types";
import { getUsageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
  searchParams
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const { examId } = await params;
  const { attemptId } = await searchParams;
  const attempt = attemptId
    ? await prisma.examAttempt.findUnique({ where: { id: attemptId }, include: { exam: true } })
    : await prisma.examAttempt.findFirst({
        where: { examId, status: "submitted" },
        include: { exam: true },
        orderBy: { updatedAt: "desc" }
      });

  if (!attempt || attempt.examId !== examId || !attempt.gradedJson) notFound();

  const questions = ExamQuestionSchema.array().parse(JSON.parse(attempt.exam.questionsJson));
  const answers = JSON.parse(attempt.answersJson || "{}") as Record<string, string>;
  const grades = z.record(GradingResultSchema).parse(JSON.parse(attempt.gradedJson));
  const usageSummary = await getUsageSummary({ examId });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Review</h1>
          <p className="text-slate-600">{attempt.exam.title}</p>
        </div>
        <div className="rounded-lg bg-white px-5 py-3 text-right shadow-sm">
          <p className="text-sm text-slate-500">Score</p>
          <p className="text-2xl font-semibold">{Math.round(attempt.score || 0)}%</p>
        </div>
      </div>
      <ReviewActions examId={attempt.exam.id} courseId={attempt.exam.courseId} />
      {questions.map((question, index) => {
        const grade = grades[question.id];
        const tone = grade.pointsAwarded === grade.maxPoints ? "border-green-300 bg-green-50" : grade.pointsAwarded > 0 ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50";
        const label = grade.pointsAwarded === grade.maxPoints ? "Correct" : grade.pointsAwarded > 0 ? "Partial" : "Incorrect";
        return (
          <section key={question.id} className={`rounded-lg border p-5 ${tone}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-semibold">Question {index + 1}: {label}</h2>
              <span className="text-sm">{grade.pointsAwarded} / {grade.maxPoints} pts</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-slate-900">{question.question}</p>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="font-medium">Your answer</dt>
                <dd className="whitespace-pre-wrap">{answers[question.id] || "No answer"}</dd>
              </div>
              <div>
                <dt className="font-medium">Correct answer</dt>
                <dd className="whitespace-pre-wrap">{question.correctAnswer}</dd>
              </div>
              <div>
                <dt className="font-medium">Reasoning</dt>
                <dd className="whitespace-pre-wrap">{grade.whyCorrectOrIncorrect || question.explanation}</dd>
              </div>
              {question.sourceNotes.length ? (
                <div>
                  <dt className="font-medium">Source reference summary</dt>
                  <dd>{question.sourceNotes.join("; ")}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        );
      })}
      <UsageSummaryCard
        title="Exam API usage"
        description="Expand to review generation and grading costs tied to this exam."
        summary={usageSummary}
        variant="compact"
      />
    </div>
  );
}
