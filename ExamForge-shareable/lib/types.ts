import { z } from "zod";

export const QuestionTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "short_answer",
  "calculation"
]);

export const DifficultySchema = z.enum(["easy", "medium", "hard", "mixed"]);

export const ExamQuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string(),
  question: z.string().min(1),
  options: z.array(z.string()).nullable().nullish().transform((value): string[] | null => value ?? null),
  correctAnswer: z.string(),
  rubric: z.string().nullish().transform((value): string => value ?? ""),
  explanation: z.string(),
  sourceNotes: z.array(z.string()),
  points: z.number().positive()
});

export const GeneratedExamSchema = z.object({
  title: z.string().min(1),
  questions: z.array(ExamQuestionSchema).min(1)
});

export const GradingResultSchema = z.object({
  isCorrect: z.boolean(),
  pointsAwarded: z.number().min(0),
  maxPoints: z.number().positive(),
  feedback: z.string(),
  whyCorrectOrIncorrect: z.string()
});

export const BatchGradingResultSchema = z.object({
  results: z.record(GradingResultSchema)
});

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type ExamQuestion = z.infer<typeof ExamQuestionSchema>;
export type GeneratedExam = z.infer<typeof GeneratedExamSchema>;
export type GradingResult = z.infer<typeof GradingResultSchema>;

export type ExamSettings = {
  title: string;
  questionCount: number;
  questionTypes: QuestionType[];
  difficulty: Difficulty;
  percentCalculation: number;
  percentRecall: number;
  focusTopics?: string;
  includeSyllabusWeighting: boolean;
  allowHigherCost: boolean;
  forceRegenerate: boolean;
};

export type CourseContextFile = {
  filename: string;
  extractedText: string;
};
