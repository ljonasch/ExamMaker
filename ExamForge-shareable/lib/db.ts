import { prisma } from "./prisma";
import { stableHash } from "./hash";
import { dedupeCourseFiles } from "./course-files";
import type { ExamSettings, GeneratedExam } from "./types";
import { getCourseUsageTotals } from "./usage";
import { buildUniqueExamTitle } from "./exam-title";

export async function listCourses() {
  const courses = await prisma.course.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      files: { select: { filename: true } },
      exams: { select: { id: true } }
    }
  });
  const usageTotals = await getCourseUsageTotals(courses.map((course) => course.id));

  return courses.map((course) => ({
    ...course,
    usageUsdTotal: usageTotals[course.id] || 0,
    _count: {
      files: new Set(course.files.map((file) => file.filename.toLowerCase())).size,
      exams: course.exams.length
    }
  }));
}

export async function createCourse(title: string) {
  return prisma.course.create({ data: { title: title.trim() || "Untitled course" } });
}

export async function getCourse(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { files: { orderBy: { createdAt: "desc" } }, exams: { orderBy: { createdAt: "desc" } } }
  });
  if (!course) return null;
  return { ...course, files: dedupeCourseFiles(course.files) };
}

export async function findCachedExam(courseId: string, settings: ExamSettings, sourceFingerprint: string) {
  return prisma.exam.findUnique({
    where: { courseId_settingsHash: { courseId, settingsHash: stableHash({ settings: cacheableSettings(settings), sourceFingerprint }) } }
  });
}

export async function saveGeneratedExam(
  courseId: string,
  settings: ExamSettings,
  generated: GeneratedExam,
  sourceFingerprint: string
) {
  const desiredTitle = generated.title || settings.title;
  const existingTitles = (
    await prisma.exam.findMany({
      where: { courseId },
      select: { title: true }
    })
  ).map((exam) => exam.title);
  const title = buildUniqueExamTitle(desiredTitle, existingTitles);

  return prisma.exam.create({
    data: {
      courseId,
      title,
      settingsJson: JSON.stringify({ settings: cacheableSettings(settings), sourceFingerprint }),
      questionsJson: JSON.stringify(generated.questions),
      settingsHash: stableHash({ settings: cacheableSettings(settings), sourceFingerprint })
    }
  });
}

export async function createAttempt(examId: string, sessionId: string) {
  return prisma.examAttempt.create({
    data: { examId, sessionId, answersJson: "{}", status: "in_progress" }
  });
}

export async function deleteCourseExams(courseId: string) {
  return prisma.exam.deleteMany({ where: { courseId } });
}

export function cacheableSettings(settings: ExamSettings) {
  const { forceRegenerate, allowHigherCost, ...rest } = settings;
  return rest;
}
