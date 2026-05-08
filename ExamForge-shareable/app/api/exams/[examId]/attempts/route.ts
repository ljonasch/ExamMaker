import { NextResponse } from "next/server";
import { createAttempt } from "@/lib/db";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const body = await request.json();
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });

  const existing = await prisma.examAttempt.findFirst({
    where: { examId, sessionId, status: "in_progress" },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) return NextResponse.json({ attempt: existing });

  const attempt = await createAttempt(examId, sessionId);
  return NextResponse.json({ attempt });
}
