import { NextResponse } from "next/server";
import { createAttempt } from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const body = await request.json();
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  const attempt = await createAttempt(examId, sessionId);
  return NextResponse.json({ attempt });
}
