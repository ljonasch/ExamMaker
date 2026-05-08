import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { combineGrades, gradeConstructedAnswers } from "@/lib/grading";
import { ExamQuestionSchema } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const body = await request.json();
  const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, string> : {};
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { exam: true }
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });

  const questions = ExamQuestionSchema.array().parse(JSON.parse(attempt.exam.questionsJson));
  const constructed = questions.some((question) => question.type === "short_answer" || question.type === "calculation")
    ? await gradeConstructedAnswers(getOpenAIClient(), questions, answers, {
        attemptId,
        examId: attempt.examId,
        courseId: attempt.exam.courseId
      })
    : {};
  const graded = combineGrades(questions, answers, constructed);

  const saved = await prisma.examAttempt.update({
    where: { id: attemptId },
    data: {
      answersJson: JSON.stringify(answers),
      gradedJson: JSON.stringify(graded.perQuestion),
      score: graded.score,
      status: "submitted"
    }
  });
  return NextResponse.json({ attempt: saved });
}
