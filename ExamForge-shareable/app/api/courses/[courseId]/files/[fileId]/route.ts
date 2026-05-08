import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; fileId: string }> }
) {
  const { courseId, fileId } = await params;

  const file = await prisma.courseFile.findFirst({
    where: {
      id: fileId,
      courseId
    }
  });

  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const deleted = await prisma.courseFile.deleteMany({
    where: {
      courseId,
      filename: file.filename
    }
  });

  return NextResponse.json({ deleted: true });
}
