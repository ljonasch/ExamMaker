import { NextResponse } from "next/server";
import { deleteCourseExams } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const result = await deleteCourseExams(courseId);
  return NextResponse.json({ deletedCount: result.count });
}
