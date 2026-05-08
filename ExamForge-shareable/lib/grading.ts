import OpenAI from "openai";
import { BatchGradingResultSchema, type ExamQuestion, type GradingResult } from "./types";
import { GRADING_MODEL } from "./constants";
import { parseOrRepairJson } from "./json";
import { recordUsageFromApiResponse, type UsageScope } from "./usage";

export function gradeDeterministic(question: ExamQuestion, answer: string): GradingResult | null {
  if (question.type !== "multiple_choice" && question.type !== "true_false") return null;
  const normalizedAnswer = normalize(answer);
  const normalizedCorrect = normalize(question.correctAnswer);
  const isCorrect = normalizedAnswer === normalizedCorrect;
  return {
    isCorrect,
    pointsAwarded: isCorrect ? question.points : 0,
    maxPoints: question.points,
    feedback: isCorrect ? "Correct." : "Incorrect.",
    whyCorrectOrIncorrect: isCorrect
      ? question.explanation
      : `Expected "${question.correctAnswer}". ${question.explanation}`
  };
}

export async function gradeConstructedAnswers(
  openai: OpenAI,
  questions: ExamQuestion[],
  answers: Record<string, string>,
  usageScope?: UsageScope
) {
  const toGrade = questions.filter((question) => question.type === "short_answer" || question.type === "calculation");
  if (toGrade.length === 0) return {};

  const response = await openai.chat.completions.create({
    model: GRADING_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a careful grader. Use only the provided question, answer key, rubric, and user answer. Return only valid JSON."
      },
      {
        role: "user",
        content: JSON.stringify({
          instructions:
            "Grade each answer. For calculation questions, give partial credit for correct method even when the final answer is wrong.",
          questions: toGrade.map((question) => ({
            id: question.id,
            type: question.type,
            question: question.question,
            correctAnswer: question.correctAnswer,
            rubric: question.rubric,
            points: question.points,
            userAnswer: answers[question.id] || ""
          })),
          schema: {
            results: {
              questionId: {
                isCorrect: true,
                pointsAwarded: 0,
                maxPoints: 1,
                feedback: "string",
                whyCorrectOrIncorrect: "string"
              }
            }
          }
        })
      }
    ],
    response_format: { type: "json_object" }
  });
  if (usageScope) {
    await recordUsageFromApiResponse(response, {
      ...usageScope,
      operationGroup: "grading",
      operationName: "constructed_answer_grading",
      model: GRADING_MODEL,
      metadata: { gradedQuestionCount: toGrade.length }
    });
  }

  const content = response.choices[0]?.message?.content || "{}";
  return parseOrRepairJson(
    content,
    BatchGradingResultSchema,
    openai,
    GRADING_MODEL,
    usageScope
      ? {
          scope: usageScope,
          operationGroup: "grading",
          metadata: { source: "constructed_answer_grading" }
        }
      : undefined
  ).then((value) => value.results);
}

export function combineGrades(questions: ExamQuestion[], answers: Record<string, string>, aiGrades: Record<string, GradingResult>) {
  const perQuestion: Record<string, GradingResult> = {};
  for (const question of questions) {
    perQuestion[question.id] = gradeDeterministic(question, answers[question.id] || "") ?? aiGrades[question.id] ?? {
      isCorrect: false,
      pointsAwarded: 0,
      maxPoints: question.points,
      feedback: "No grade was returned.",
      whyCorrectOrIncorrect: "The grading service did not return a result for this answer."
    };
  }
  const earned = Object.values(perQuestion).reduce((sum, grade) => sum + grade.pointsAwarded, 0);
  const possible = questions.reduce((sum, question) => sum + question.points, 0);
  return {
    perQuestion,
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100)
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
