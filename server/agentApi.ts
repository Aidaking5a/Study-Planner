import { z } from "zod";
import type { LearnerLevel, StudyLanguage } from "../shared/types.js";

const languageSchema = z.enum(["en", "fr", "de", "lb-simple"]);
const levelSchema = z.enum(["lower-secondary", "upper-secondary", "university"]);

export const studyInputSchema = z.object({
  rawText: z.string().min(30, "Paste at least a few sentences of study material."),
  subject: z.string().min(2).max(80),
  level: levelSchema,
  language: languageSchema,
  goals: z.array(z.string().min(2).max(80)).max(6).default([]),
  examDate: z.string().optional()
});

export const agentRunSchema = z.object({
  agentId: z.string().min(2),
  input: studyInputSchema
});

export const waitlistSchema = z.object({
  email: z.string().email(),
  persona: z.enum(["student", "parent", "tutor", "school", "other"]),
  language: languageSchema,
  pain: z.string().min(5).max(500)
});

export const powerPointSchema = z.object({
  topic: z.string().min(3).max(120),
  rawText: z.string().min(80, "Add enough notes to make the deck specific."),
  audience: z.string().min(3).max(120),
  goal: z.string().min(3).max(180),
  language: languageSchema,
  level: levelSchema,
  slideCount: z.number().int().min(5).max(10)
});

const optionalTextSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const schoolIntelligenceQuerySchema = z.object({
  schoolName: optionalTextSchema,
  schoolId: optionalTextSchema,
  schoolYear: optionalTextSchema,
  subject: optionalTextSchema,
  courseId: optionalTextSchema,
  teacherName: optionalTextSchema,
  teacherProfileId: optionalTextSchema,
  topic: optionalTextSchema
});

export const resultUploadImageSchema = z.object({
  name: z.string().min(1).max(180),
  type: z.string().min(3).max(80),
  size: z.number().int().min(1).max(12_000_000),
  dataUrl: z.string().min(80).max(16_000_000)
});

export const resultUploadSchema = z.object({
  schoolName: z.string().min(2).max(160),
  schoolCity: optionalTextSchema,
  schoolYear: z.string().min(2).max(80),
  subject: z.string().min(2).max(120),
  courseLevel: optionalTextSchema,
  teacherName: z.string().min(2).max(140),
  testTitle: z.string().min(2).max(180),
  testDate: optionalTextSchema,
  topics: z.array(z.string().min(1).max(120)).min(1).max(12),
  markObtained: z.number().min(0).max(1000).optional(),
  markMax: z.number().min(1).max(1000).optional(),
  expectedAnswers: optionalTextSchema,
  correctionNotes: optionalTextSchema,
  studentReflection: optionalTextSchema,
  images: z.array(resultUploadImageSchema).min(1).max(8)
});

export const intelligenceReportSchema = z.object({
  tableName: z.enum(["test_intelligence", "teacher_correction_patterns", "common_mistakes", "expected_answers"]),
  recordId: z.string().min(3).max(120),
  reason: z.enum(["wrong_extraction", "private_information", "teacher_targeting", "outdated", "other"]),
  details: z.string().min(5).max(1000)
});

export const languageLabels: Record<StudyLanguage, string> = {
  en: "English",
  fr: "French",
  de: "German",
  "lb-simple": "simple Luxembourgish-style"
};

export const levelLabels: Record<LearnerLevel, string> = {
  "lower-secondary": "lower secondary",
  "upper-secondary": "upper secondary",
  university: "university"
};
