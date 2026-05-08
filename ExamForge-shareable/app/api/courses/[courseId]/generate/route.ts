import { NextResponse } from "next/server";
import { findCachedExam, saveGeneratedExam } from "@/lib/db";
import { COST_LIMIT_USD, MAX_QUESTIONS } from "@/lib/constants";
import { estimateExamCost } from "@/lib/cost";
import { buildCourseContext } from "@/lib/chunking";
import { buildCourseFilesFingerprint, dedupeCourseFiles } from "@/lib/course-files";
import { suggestExamTitle } from "@/lib/exam-title";
import { getOpenAIClient, generateExamWithOpenAI } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { QuestionTypeSchema, type ExamSettings } from "@/lib/types";
import { attachUsageToExam } from "@/lib/usage";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const body = await request.json();
    const settings = normalizeSettings(body);

    if (settings.questionCount < 1 || settings.questionCount > MAX_QUESTIONS) {
      return NextResponse.json({ error: `Question count must be between 1 and ${MAX_QUESTIONS}.` }, { status: 400 });
    }

    const files = dedupeCourseFiles(
      await prisma.courseFile.findMany({ where: { courseId }, orderBy: { createdAt: "desc" } })
    );
    if (files.length === 0) {
      return NextResponse.json({ error: "Upload course materials before generating an exam." }, { status: 400 });
    }

    if (!settings.title) {
      const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true } });
      settings.title = suggestExamTitle(course?.title || "Course", files);
    }

    const sourceFingerprint = buildCourseFilesFingerprint(files);
    const context = buildCourseContext(files, {
      focusTopics: settings.focusTopics,
      includeSyllabusWeighting: settings.includeSyllabusWeighting
    });
    const estimate = estimateExamCost(context.length);
    if (estimate.estimatedUsd > COST_LIMIT_USD && !settings.allowHigherCost) {
      return NextResponse.json({ error: "Estimated cost exceeds $0.10. Check allow higher cost to continue.", estimate }, { status: 400 });
    }

    const cached = await findCachedExam(courseId, settings, sourceFingerprint);
    if (!settings.forceRegenerate) {
      if (cached) {
        return NextResponse.json({ examId: cached.id, cached: true, estimate });
      }
    } else if (cached) {
      await prisma.exam.delete({ where: { id: cached.id } });
    }

    const requestKey = crypto.randomUUID();
    const generated = await generateExamWithOpenAI({
      openai: getOpenAIClient(),
      files,
      settings,
      usageScope: { courseId, requestKey }
    });
    const exam = await saveGeneratedExam(courseId, settings, generated.exam, sourceFingerprint);
    await attachUsageToExam(requestKey, exam.id);
    return NextResponse.json({ examId: exam.id, cached: false, estimate: generated });
  } catch (error) {
    console.error("Exam generation failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Exam generation failed." },
      { status: 500 }
    );
  }
}

function normalizeSettings(body: Record<string, unknown>): ExamSettings {
  const rawTypes = Array.isArray(body.questionTypes) ? body.questionTypes : ["multiple_choice"];
  const questionTypes = rawTypes
    .map((type) => QuestionTypeSchema.safeParse(type))
    .filter((result) => result.success)
    .map((result) => result.data);

  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    questionCount: Number(body.questionCount || 10),
    questionTypes: questionTypes.length ? questionTypes : ["multiple_choice"],
    difficulty: body.difficulty === "easy" || body.difficulty === "medium" || body.difficulty === "hard" || body.difficulty === "mixed" ? body.difficulty : "mixed",
    percentCalculation: Number(body.percentCalculation || 0),
    percentRecall: Number(body.percentRecall || 50),
    focusTopics: typeof body.focusTopics === "string" ? body.focusTopics : "",
    includeSyllabusWeighting: Boolean(body.includeSyllabusWeighting),
    allowHigherCost: Boolean(body.allowHigherCost),
    forceRegenerate: Boolean(body.forceRegenerate)
  };
}
