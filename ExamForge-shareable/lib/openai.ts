import OpenAI from "openai";
import {
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  OCR_MAX_OUTPUT_TOKENS,
  SUMMARY_CONTEXT_CHARS,
  SUMMARY_MAX_OUTPUT_TOKENS,
  VISION_MODEL
} from "./constants";
import { buildCourseContext } from "./chunking";
import { estimateExamCost } from "./cost";
import { parseOrRepairJson } from "./json";
import { GeneratedExamSchema, type CourseContextFile, type ExamSettings, type GeneratedExam } from "./types";
import { recordUsageFromApiResponse, type UsageScope } from "./usage";

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function summarizeCourseFilesWithOpenAI({
  openai,
  files,
  title,
  usageScope
}: {
  openai: OpenAI;
  files: CourseContextFile[];
  title: string;
  usageScope?: UsageScope;
}) {
  const context = buildCourseContext(files, { maxChars: SUMMARY_CONTEXT_CHARS, includeSyllabusWeighting: true });
  return summarizeTextBlock({
    openai,
    title,
    context,
    scopeLabel: files.length === 1 ? "single file" : "course materials",
    operationName: files.length === 1 ? "file_summary" : "course_summary",
    usageScope
  });
}

export async function extractImageTextWithOpenAI({
  openai,
  imageBytes,
  mimeType,
  slideLabel,
  usageScope
}: {
  openai: OpenAI;
  imageBytes: Buffer;
  mimeType: string;
  slideLabel: string;
  usageScope?: UsageScope;
}) {
  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You extract concise study-relevant notes from educational images. Return plain text only. Ignore decorative elements, repeated branding, and long prose already visible elsewhere. Include clearly legible text, equations, axes, labels, and table content. If a simple diagram, flowchart, plot, or schematic has an obvious meaning, add one short 'Interpretation:' line. If meaning is uncertain, omit it. If there is no useful academic content, return NO_TEXT."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract any useful labels, equations, table text, axis text, or short annotations from ${slideLabel}. Add a brief interpretation only when the visual meaning is clear.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBytes.toString("base64")}`,
              detail: "low"
            }
          }
        ]
      }
    ],
    max_completion_tokens: OCR_MAX_OUTPUT_TOKENS
  } as never);
  if (usageScope) {
    await recordUsageFromApiResponse(response, {
      ...usageScope,
      operationGroup: "upload",
      operationName: "slide_image_ocr",
      model: VISION_MODEL,
      metadata: { slideLabel }
    });
  }

  const text = response.choices[0]?.message?.content?.trim() || "";
  if (!text || /^NO_TEXT\b/i.test(text)) return "";
  return text.replace(/\s+\n/g, "\n").trim();
}

export async function extractPdfStudyNotesWithOpenAI({
  openai,
  pdfBytes,
  filename,
  usageScope
}: {
  openai: OpenAI;
  pdfBytes: Buffer;
  filename: string;
  usageScope?: UsageScope;
}) {
  const response = await openai.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You extract faithful study notes from PDFs using only high-confidence information. Include readable headings, key concepts, definitions, formulas, tables, and short plain-language notes for diagrams, flowcharts, or plots only when their meaning is clear. If a visual is uncertain, omit it. Return plain text only."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename,
            file_data: `data:application/pdf;base64,${pdfBytes.toString("base64")}`
          },
          {
            type: "input_text",
            text:
              "Create concise but content-faithful study notes from this PDF. Preserve the important ideas and formulas rather than summarizing it into a couple of sentences. Use short headings and bullets when helpful. Include only high-confidence information."
          }
        ]
      }
    ],
    max_output_tokens: 1_400
  });
  if (usageScope) {
    await recordUsageFromApiResponse(response, {
      ...usageScope,
      operationGroup: "upload",
      operationName: "pdf_ocr",
      model: VISION_MODEL,
      metadata: { filename }
    });
  }

  return response.output_text.trim();
}

export async function generateExamWithOpenAI({
  openai,
  files,
  settings,
  usageScope
}: {
  openai: OpenAI;
  files: CourseContextFile[];
  settings: ExamSettings;
  usageScope?: UsageScope;
}): Promise<{ exam: GeneratedExam; contextChars: number; estimatedUsd: number }> {
  const courseContext = buildCourseContext(files, {
    focusTopics: settings.focusTopics,
    includeSyllabusWeighting: settings.includeSyllabusWeighting
  });
  const estimate = estimateExamCost(courseContext.length);

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an expert instructional designer and exam writer. Use only the provided course materials. Prioritize syllabus goals, learning outcomes, lecture headings, practice questions, repeated concepts, and representative instructional content. Use the syllabus mainly for topic weighting and course goals, not as the sole source of questions when instructional materials are available. Prefer concept-level understanding, application, interpretation, and representative calculations over one-off lecture trivia. Avoid questions that depend on exact recall of isolated example details, specific named lecture scenarios, or raw memorization of numbers unless that detail is itself a repeated core concept in the materials. When examples appear in the source, generalize them into transferable questions about the underlying idea. For calculation questions, double-check the arithmetic and make sure the final answer in correctAnswer, rubric, and explanation all match. Create exam questions representative of likely exam content, but do not claim to know the real exam. Return only valid JSON."
      },
      {
        role: "user",
        content: JSON.stringify({
          settings: {
            title: settings.title,
            numberOfQuestions: settings.questionCount,
            questionTypes: settings.questionTypes,
            difficulty: settings.difficulty,
            percentCalculationBased: settings.percentCalculation,
            percentRecallFromNotes: settings.percentRecall,
            focusTopics: settings.focusTopics || null,
            includeSyllabusWeighting: settings.includeSyllabusWeighting
          },
          rules: [
            "Use the course materials as the source of truth.",
            "Mix recall, application, interpretation, and calculation based on settings.",
            "When non-syllabus materials are available, most questions should be grounded in those materials rather than course policies or administration.",
            "Treat recall as recall of concepts, relationships, and problem-solving steps, not memorization of one-off lecture anecdotes.",
            "Do not ask about exact values, timings, or details from a single lecture example unless the materials clearly treat that detail as a reusable concept or calculation pattern.",
            "Prefer phrasing that asks what an example illustrates or how to apply a concept, instead of asking the student to remember the example itself.",
            "Calculation questions must include enough variables to solve.",
            "For every calculation question, ensure correctAnswer, rubric, and explanation use the same final answer.",
            "Multiple choice questions must have exactly 4 options and one correct answer.",
            "Short answer questions must include a grading rubric.",
            "Each question must include short plain-language sourceNotes that reference the source without revealing the answer.",
            "Never claim certainty beyond the uploaded materials."
          ],
          schema: {
            title: "string",
            questions: [
              {
                id: "string",
                type: "multiple_choice | true_false | short_answer | calculation",
                difficulty: "easy | medium | hard",
                topic: "string",
                question: "string",
                options: ["string"],
                correctAnswer: "string",
                rubric: "string",
                explanation: "string",
                sourceNotes: ["string"],
                points: 1
              }
            ]
          },
          sourceSummary: {
            totalFiles: files.length,
            hasNonSyllabusMaterials: files.some((file) => !/syllabus/i.test(file.filename))
          },
          courseMaterials: courseContext
        })
      }
    ],
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" }
  });
  if (usageScope) {
    await recordUsageFromApiResponse(response, {
      ...usageScope,
      operationGroup: "generation",
      operationName: "exam_generation",
      model: DEFAULT_MODEL,
      metadata: { questionCount: settings.questionCount }
    });
  }

  const content = response.choices[0]?.message?.content || "{}";
  const exam = (await parseOrRepairJson(content, GeneratedExamSchema, openai, DEFAULT_MODEL, usageScope
    ? {
        scope: usageScope,
        operationGroup: "generation",
        metadata: { source: "exam_generation" }
      }
    : undefined)) as GeneratedExam;
  let normalizedExam = normalizeGeneratedExam(exam);

  if (needsRevision(normalizedExam)) {
    normalizedExam = await reviseExam({
      openai,
      exam: normalizedExam,
      settings,
      usageScope
    });
  }

  return { exam: normalizedExam, contextChars: courseContext.length, estimatedUsd: estimate.estimatedUsd };
}

async function reviseExam({
  openai,
  exam,
  settings,
  usageScope
}: {
  openai: OpenAI;
  exam: GeneratedExam;
  settings: ExamSettings;
  usageScope?: UsageScope;
}) {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Revise this exam JSON. Keep the same number of questions and the same overall question-type mix. Rewrite any question that depends on remembering a specific lecture example into a concept, interpretation, or application question about the underlying idea. For calculation questions, correct the arithmetic and ensure correctAnswer, rubric, and explanation all use the same final answer. Keep sourceNotes short, plain-language, and non-revealing. Return only valid JSON."
      },
      {
        role: "user",
        content: JSON.stringify({
          settings: {
            title: settings.title,
            numberOfQuestions: settings.questionCount,
            questionTypes: settings.questionTypes,
            difficulty: settings.difficulty,
            percentCalculationBased: settings.percentCalculation,
            percentRecallFromNotes: settings.percentRecall
          },
          exam
        })
      }
    ],
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" }
  });
  if (usageScope) {
    await recordUsageFromApiResponse(response, {
      ...usageScope,
      operationGroup: "generation",
      operationName: "exam_revision",
      model: DEFAULT_MODEL
    });
  }

  const revisedContent = response.choices[0]?.message?.content || "{}";
  const revisedExam = (await parseOrRepairJson(revisedContent, GeneratedExamSchema, openai, DEFAULT_MODEL, usageScope
    ? {
        scope: usageScope,
        operationGroup: "generation",
        metadata: { source: "exam_revision" }
      }
    : undefined)) as GeneratedExam;
  return normalizeGeneratedExam(revisedExam);
}

function normalizeGeneratedExam(exam: GeneratedExam): GeneratedExam {
  return {
    title: exam.title,
    questions: exam.questions.map((question) => {
      const normalizedQuestion: GeneratedExam["questions"][number] = {
        ...question,
        options: question.options ?? null,
        sourceNotes: question.sourceNotes.map((note) => note.trim()),
        rubric: question.rubric || fallbackRubric(question)
      };

      return normalizedQuestion;
    })
  };
}

function needsRevision(exam: GeneratedExam) {
  return exam.questions.some((question) => {
    if (question.type === "calculation") return true;

    return /\bexample\b/i.test(question.question) || /\bfrom the lecture\b/i.test(question.question) || /\bfrom the notes\b/i.test(question.question);
  });
}

function fallbackRubric(question: { type: string; correctAnswer: string; topic: string }) {
  if (question.type === "multiple_choice" || question.type === "true_false") {
    return `Award full credit for selecting "${question.correctAnswer}".`;
  }

  return `Award credit using the correct answer, explanation, and course-based reasoning for ${question.topic}.`;
}

async function summarizeTextBlock({
  openai,
  title,
  context,
  scopeLabel,
  operationName,
  usageScope
}: {
  openai: OpenAI;
  title: string;
  context: string;
  scopeLabel: string;
  operationName: string;
  usageScope?: UsageScope;
}) {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You summarize uploaded course materials for studying. Use only the provided text. Be concrete but concise. Do not invent content or claim certainty beyond the text."
      },
      {
        role: "user",
        content: [
          `Summarize these ${scopeLabel} for a student.`,
          "Return plain text with this structure:",
          "Overview: 2-3 sentences.",
          "Key topics:",
          "- 4 to 8 bullets",
          "Likely exam-relevant ideas:",
          "- 3 to 5 bullets",
          "Open gaps or unreadable areas:",
          "- mention if the material seems partial, image-heavy, or truncated",
          "",
          `Title: ${title}`,
          "",
          context
        ].join("\n")
      }
    ],
    max_completion_tokens: SUMMARY_MAX_OUTPUT_TOKENS
  });
  if (usageScope) {
    await recordUsageFromApiResponse(response, {
      ...usageScope,
      operationGroup: "summary",
      operationName,
      model: DEFAULT_MODEL,
      metadata: { title }
    });
  }

  return response.choices[0]?.message?.content?.trim() || "No summary was returned.";
}
