export const studyLanguages = ["en", "fr", "de", "lb-simple"] as const;
export type StudyLanguage = (typeof studyLanguages)[number];

export const learnerLevels = ["lower-secondary", "upper-secondary", "university"] as const;
export type LearnerLevel = (typeof learnerLevels)[number];

export interface StudyInput {
  rawText: string;
  subject: string;
  level: LearnerLevel;
  language: StudyLanguage;
  goals: string[];
  examDate?: string;
}

export interface AgentMeta {
  id: string;
  name: string;
  role: string;
  costTier: "free-local" | "paid-llm" | "hybrid";
  defaultEnabled: boolean;
}

export interface AgentRunRequest {
  agentId: string;
  input: StudyInput;
}

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface StudySessionResult {
  provider: string;
  generatedAt: string;
  summary: string;
  keyIdeas: string[];
  weakSpots: string[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  studyPlan: string[];
  complianceNote: string;
}

export const examPriorities = ["low", "medium", "high"] as const;
export type ExamPriority = (typeof examPriorities)[number];

export const taskStatuses = ["todo", "done"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export interface StudentExam {
  id: string;
  subject: string;
  title: string;
  date: string;
  topics: string[];
  confidence: number;
  priority: ExamPriority;
  createdAt: string;
  updatedAt: string;
}

export interface StudyTask {
  id: string;
  examId: string;
  date: string;
  topic: string;
  estimateMinutes: number;
  status: TaskStatus;
}

export interface StudyPlan {
  id: string;
  examIds: string[];
  title: string;
  createdAt: string;
  committedAt?: string;
  tasks: StudyTask[];
}

export interface PracticeItem {
  id: string;
  examId: string;
  topic: string;
  summary: string;
  definition: string;
  flashcard: Flashcard;
  quiz: QuizQuestion;
}

export interface PracticeResult {
  id: string;
  examId: string;
  topic: string;
  correct: boolean;
  createdAt: string;
}

export interface ProgressSnapshot {
  percent: number;
  completedTasks: number;
  totalTasks: number;
  practiceAccuracy: number;
  examsTracked: number;
  weakSpots: string[];
}

export interface AgentRunResponse {
  agent: AgentMeta;
  provider: string;
  generatedAt: string;
  result: unknown;
}

export interface WaitlistRequest {
  email: string;
  persona: "student" | "parent" | "tutor" | "school" | "other";
  language: StudyLanguage;
  pain: string;
}

export interface WaitlistResponse {
  accepted: true;
  nextStep: string;
  score: number;
}

export interface PowerPointRequest {
  topic: string;
  rawText: string;
  audience: string;
  goal: string;
  language: StudyLanguage;
  level: LearnerLevel;
  slideCount: number;
}
