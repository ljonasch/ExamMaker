import { prisma } from "./prisma";

export const OPERATION_GROUPS = ["upload", "summary", "generation", "grading"] as const;

export type OperationGroup = (typeof OPERATION_GROUPS)[number];

type ModelPricing = {
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
};

export type UsageScope = {
  courseId?: string;
  examId?: string;
  attemptId?: string;
  requestKey?: string;
};

type UsageRecordInput = UsageScope & {
  operationGroup: OperationGroup;
  operationName: string;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  totalTokens?: number;
  metadata?: Record<string, unknown>;
};

type UsageRecordShape = {
  operationGroup: string;
  operationName: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type UsageOperationSummary = {
  name: string;
  label: string;
  requestCount: number;
  totalTokens: number;
  usdTotal: number;
};

type UsageGroupSummary = {
  key: OperationGroup;
  label: string;
  requestCount: number;
  totalTokens: number;
  usdTotal: number;
  operations: UsageOperationSummary[];
};

export type UsageSummary = {
  totalRequests: number;
  totalTokens: number;
  totalUsd: number;
  groups: UsageGroupSummary[];
};

const GROUP_LABELS: Record<OperationGroup, string> = {
  upload: "Upload and extraction",
  summary: "Summaries",
  generation: "Exam generation",
  grading: "Grading"
};

const OPERATION_LABELS: Record<string, string> = {
  course_summary: "All-file summary",
  exam_generation: "Question generation",
  exam_revision: "Question revision",
  constructed_answer_grading: "Constructed-answer grading",
  file_summary: "Single-file summary",
  json_repair: "JSON repair",
  pdf_ocr: "Scanned PDF OCR",
  slide_image_ocr: "Slide image OCR"
};

const MODEL_PRICING: Array<[prefix: string, pricing: ModelPricing]> = [
  ["gpt-5.4-mini", { inputPer1M: 0.75, cachedInputPer1M: 0.075, outputPer1M: 4.5 }],
  ["gpt-5.4", { inputPer1M: 2.5, cachedInputPer1M: 0.25, outputPer1M: 15 }],
  ["gpt-5-mini", { inputPer1M: 0.25, cachedInputPer1M: 0.025, outputPer1M: 2 }],
  ["gpt-4o-mini", { inputPer1M: 0.15, cachedInputPer1M: 0.075, outputPer1M: 0.6 }],
  ["gpt-4o", { inputPer1M: 2.5, cachedInputPer1M: 1.25, outputPer1M: 10 }]
];

const DEFAULT_PRICING = MODEL_PRICING[0][1];

export function getModelPricing(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  return MODEL_PRICING.find(([prefix]) => normalizedModel.startsWith(prefix))?.[1] ?? DEFAULT_PRICING;
}

export function estimateUsageCost({
  model,
  inputTokens,
  cachedInputTokens = 0,
  outputTokens
}: {
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}) {
  const pricing = getModelPricing(model);
  const billableInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  const total =
    (billableInputTokens / 1_000_000) * pricing.inputPer1M +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M;

  return Number(total.toFixed(6));
}

export function extractUsageFromApiResponse(response: unknown) {
  const usage = readObject(readObject(response)?.usage);
  const inputTokens = readNumber(usage?.prompt_tokens) ?? readNumber(usage?.input_tokens) ?? 0;
  const outputTokens = readNumber(usage?.completion_tokens) ?? readNumber(usage?.output_tokens) ?? 0;
  const cachedInputTokens =
    readNumber(readObject(usage?.prompt_tokens_details)?.cached_tokens) ??
    readNumber(readObject(usage?.input_tokens_details)?.cached_tokens) ??
    0;
  const totalTokens = readNumber(usage?.total_tokens) ?? inputTokens + outputTokens;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens
  };
}

export async function recordUsageFromApiResponse(
  response: unknown,
  input: Omit<UsageRecordInput, "inputTokens" | "cachedInputTokens" | "outputTokens" | "totalTokens"> & {
    fallbackModel?: string;
  }
) {
  const { fallbackModel, ...recordInput } = input;
  const model = readString(readObject(response)?.model) || fallbackModel || recordInput.model || "unknown";
  const usage = extractUsageFromApiResponse(response);

  return recordUsage({
    ...recordInput,
    model,
    ...usage
  });
}

export async function recordUsage(input: UsageRecordInput) {
  const inputTokens = Math.max(0, Math.floor(input.inputTokens));
  const cachedInputTokens = Math.max(0, Math.floor(input.cachedInputTokens || 0));
  const outputTokens = Math.max(0, Math.floor(input.outputTokens));
  const totalTokens = Math.max(0, Math.floor(input.totalTokens ?? inputTokens + outputTokens));
  const estimatedCostUsd = estimateUsageCost({
    model: input.model,
    inputTokens,
    cachedInputTokens,
    outputTokens
  });

  return prisma.apiUsageRecord.create({
    data: {
      courseId: input.courseId,
      examId: input.examId,
      attemptId: input.attemptId,
      requestKey: input.requestKey,
      operationGroup: input.operationGroup,
      operationName: input.operationName,
      model: input.model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null
    }
  });
}

export async function attachUsageToExam(requestKey: string, examId: string) {
  if (!requestKey) return;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { courseId: true }
  });

  if (!exam) return;

  await prisma.apiUsageRecord.updateMany({
    where: { requestKey },
    data: {
      examId,
      courseId: exam.courseId
    }
  });
}

export async function getUsageSummary(scope?: UsageScope) {
  const records = await prisma.apiUsageRecord.findMany({
    where: buildUsageWhere(scope),
    select: {
      operationGroup: true,
      operationName: true,
      model: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedCostUsd: true
    },
    orderBy: { createdAt: "desc" }
  });

  return summarizeUsageRecords(records);
}

export async function getCourseUsageTotals(courseIds: string[]) {
  if (courseIds.length === 0) return {} as Record<string, number>;

  const records = await prisma.apiUsageRecord.findMany({
    where: {
      courseId: { in: courseIds }
    },
    select: {
      courseId: true,
      estimatedCostUsd: true
    }
  });

  return records.reduce<Record<string, number>>((totals, record) => {
    if (!record.courseId) return totals;
    totals[record.courseId] = Number(((totals[record.courseId] || 0) + record.estimatedCostUsd).toFixed(6));
    return totals;
  }, {});
}

export function summarizeUsageRecords(records: UsageRecordShape[]): UsageSummary {
  const groups = OPERATION_GROUPS.map((groupKey) => {
    const groupRecords = records.filter((record) => record.operationGroup === groupKey);
    const operationsMap = new Map<string, UsageOperationSummary>();

    for (const record of groupRecords) {
      const existing = operationsMap.get(record.operationName) ?? {
        name: record.operationName,
        label: OPERATION_LABELS[record.operationName] || humanize(record.operationName),
        requestCount: 0,
        totalTokens: 0,
        usdTotal: 0
      };

      existing.requestCount += 1;
      existing.totalTokens += record.totalTokens;
      existing.usdTotal += record.estimatedCostUsd;
      operationsMap.set(record.operationName, existing);
    }

    const operations = [...operationsMap.values()]
      .map((operation) => ({
        ...operation,
        usdTotal: Number(operation.usdTotal.toFixed(6))
      }))
      .sort((left, right) => right.usdTotal - left.usdTotal || right.requestCount - left.requestCount);

    return {
      key: groupKey,
      label: GROUP_LABELS[groupKey],
      requestCount: groupRecords.length,
      totalTokens: groupRecords.reduce((sum, record) => sum + record.totalTokens, 0),
      usdTotal: Number(groupRecords.reduce((sum, record) => sum + record.estimatedCostUsd, 0).toFixed(6)),
      operations
    };
  });

  return {
    totalRequests: records.length,
    totalTokens: records.reduce((sum, record) => sum + record.totalTokens, 0),
    totalUsd: Number(records.reduce((sum, record) => sum + record.estimatedCostUsd, 0).toFixed(6)),
    groups
  };
}

function buildUsageWhere(scope?: UsageScope) {
  if (!scope) return undefined;

  const where: Record<string, string> = {};
  if (scope.courseId) where.courseId = scope.courseId;
  if (scope.examId) where.examId = scope.examId;
  if (scope.attemptId) where.attemptId = scope.attemptId;
  if (scope.requestKey) where.requestKey = scope.requestKey;
  return Object.keys(where).length ? where : undefined;
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
