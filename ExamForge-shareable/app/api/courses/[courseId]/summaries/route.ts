import { NextResponse } from "next/server";
import { dedupeCourseFiles } from "@/lib/course-files";
import { summarizeCourseFilesWithOpenAI, getOpenAIClient } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const body = await request.json();
    const fileId = typeof body.fileId === "string" ? body.fileId : "";
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true }
    });
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    let selectedFiles: Array<{ filename: string; extractedText: string }> = [];
    let title = `${course.title} course pack`;

    if (fileId) {
      const file = await prisma.courseFile.findFirst({
        where: {
          id: fileId,
          courseId
        },
        select: {
          filename: true,
          extractedText: true
        }
      });

      if (!file) {
        return NextResponse.json({ error: "File not found." }, { status: 404 });
      }

      selectedFiles = [file];
      title = file.filename;
    } else {
      const files = dedupeCourseFiles(
        await prisma.courseFile.findMany({
          where: { courseId },
          orderBy: { createdAt: "desc" },
          select: {
            filename: true,
            extractedText: true
          }
        })
      );

      if (files.length === 0) {
        return NextResponse.json({ error: "Upload files before asking for a summary." }, { status: 400 });
      }

      selectedFiles = files;
    }

    const summary = await summarizeCourseFilesWithOpenAI({
      openai: getOpenAIClient(),
      files: selectedFiles,
      title,
      usageScope: { courseId }
    });

    return NextResponse.json({
      summary,
      title,
      scope: fileId ? "file" : "course"
    });
  } catch (error) {
    console.error("Summary generation failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Summary generation failed." },
      { status: 500 }
    );
  }
}
