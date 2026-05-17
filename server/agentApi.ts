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
