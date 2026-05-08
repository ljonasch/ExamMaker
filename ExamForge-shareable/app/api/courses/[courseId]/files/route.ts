import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractTextFromFile } from "@/lib/extraction";
import { getOpenAIClient } from "@/lib/openai";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const enableImageRecognition = formData.get("enableImageRecognition") === "on";
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const openai = enableImageRecognition ? getOpenAIClient() : undefined;
    const results = [];
    for (const file of files) {
      try {
        const extracted = await extractTextFromFile(file, {
          enableImageOcr: enableImageRecognition,
          openai,
          usageScope: { courseId }
        });
        await prisma.courseFile.deleteMany({
          where: {
            courseId,
            filename: extracted.filename
          }
        });
        const saved = await prisma.courseFile.create({
          data: {
            courseId,
            filename: extracted.filename,
            mimeType: extracted.mimeType,
            extractedText: extracted.extractedText,
            charCount: extracted.charCount
          }
        });
        results.push({ ok: true, file: saved });
      } catch (error) {
        results.push({ ok: false, filename: file.name, error: error instanceof Error ? error.message : "Upload failed." });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("File upload failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
