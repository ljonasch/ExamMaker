import { NextResponse } from "next/server";
import { createCourse, listCourses } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ courses: await listCourses() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title : "";
  const course = await createCourse(title);
  return NextResponse.json({ course });
}
