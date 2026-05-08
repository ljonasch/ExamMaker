import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function saveAttempt(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const body = await request.json();
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const attempt = await prisma.examAttempt.update({
    where: { id: attemptId },
    data: { answersJson: JSON.stringify(answers) }
  });
  return NextResponse.json({ attempt });
}

export async function PATCH(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  return saveAttempt(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  return saveAttempt(request, context);
}
