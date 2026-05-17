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

export const intelligenceStatuses = ["seed", "needs_more_evidence", "shared", "suppressed"] as const;
export type IntelligenceStatus = (typeof intelligenceStatuses)[number];

export interface SchoolProfile {
  id: string;
  name: string;
  countryCode: string;
  city?: string;
}

export interface SchoolYearProfile {
  id: string;
  schoolId: string;
  label: string;
  startsOn?: string;
  endsOn?: string;
}

export interface CourseProfile {
  id: string;
  schoolId: string;
  schoolYearId?: string;
  subject: string;
  level?: string;
  language?: string;
}

export interface TeacherProfile {
  id: string;
  schoolId: string;
  displayName: string;
}

export interface ExpectedAnswerRecord {
  id: string;
  testId?: string;
  topic: string;
  expectedAnswer: string;
  evidenceCount: number;
  confidenceScore: number;
  status: IntelligenceStatus;
}

export interface CorrectionStyleProfile {
  id: string;
  teacherProfileId?: string;
  courseId?: string;
  label: string;
  summary: string;
  evidenceCount: number;
  confidenceScore: number;
  status: IntelligenceStatus;
}

export interface TeacherCorrectionPattern {
  id: string;
  schoolId: string;
  courseId?: string;
  teacherProfileId?: string;
  pattern: string;
  guidance: string;
  evidenceCount: number;
  confidenceScore: number;
  status: IntelligenceStatus;
}

export interface MarkDistributionBucket {
  id: string;
  courseId?: string;
  teacherProfileId?: string;
  bucketLabel: string;
  count: number;
  evidenceCount: number;
  confidenceScore: number;
  status: IntelligenceStatus;
}

export interface CommonMistakeRecord {
  id: string;
  schoolId: string;
  courseId?: string;
  teacherProfileId?: string;
  topic: string;
  mistake: string;
  recommendedFix: string;
  evidenceCount: number;
  confidenceScore: number;
  status: IntelligenceStatus;
}

export interface TestIntelligenceRecord {
  id: string;
  schoolId: string;
  schoolYearId?: string;
  courseId?: string;
  teacherProfileId?: string;
  subject: string;
  testTitle: string;
  topicSummary: string;
  expectedAnswerPattern: string;
  correctionStyleSummary: string;
  commonMistakeSummary: string;
  evidenceCount: number;
  confidenceScore: number;
  status: IntelligenceStatus;
  updatedAt: string;
}

export interface SchoolIntelligenceQuery {
  schoolName?: string;
  schoolId?: string;
  schoolYear?: string;
  subject?: string;
  courseId?: string;
  teacherName?: string;
  teacherProfileId?: string;
  topic?: string;
}

export interface SchoolIntelligenceResponse {
  provider: "supabase" | "demo-local" | "demo-memory";
  minEvidence: number;
  minConfidence: number;
  school?: SchoolProfile;
  course?: CourseProfile;
  teacher?: TeacherProfile;
  tests: TestIntelligenceRecord[];
  expectedAnswers: ExpectedAnswerRecord[];
  correctionPatterns: TeacherCorrectionPattern[];
  markBuckets: MarkDistributionBucket[];
  commonMistakes: CommonMistakeRecord[];
  privacyNote: string;
}

export interface ResultUploadImage {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface ResultUploadRequest {
  schoolName: string;
  schoolCity?: string;
  schoolYear: string;
  subject: string;
  courseLevel?: string;
  teacherName: string;
  testTitle: string;
  testDate?: string;
  topics: string[];
  markObtained?: number;
  markMax?: number;
  expectedAnswers?: string;
  correctionNotes?: string;
  studentReflection?: string;
  images: ResultUploadImage[];
}

export interface ExtractedResultInsight {
  resultId: string;
  jobId: string;
  status: IntelligenceStatus;
  confidenceScore: number;
  evidenceCount: number;
  extracted: {
    schoolYear: string;
    subject: string;
    teacherName: string;
    testTitle: string;
    marks?: {
      obtained: number;
      max: number;
      percent: number;
    };
    topics: string[];
    expectedAnswers: string[];
    correctionStyle: string;
    commonMistakes: string[];
  };
  privateFeedback: string;
  sharedSummary: string;
  auditTrail: string[];
}

export interface ResultUploadResponse {
  provider: "supabase" | "demo-local" | "demo-memory";
  uploadedAt: string;
  result: ExtractedResultInsight;
  intelligence: SchoolIntelligenceResponse;
}

export interface IntelligenceReportRequest {
  tableName: "test_intelligence" | "teacher_correction_patterns" | "common_mistakes" | "expected_answers";
  recordId: string;
  reason: "wrong_extraction" | "private_information" | "teacher_targeting" | "outdated" | "other";
  details: string;
}

export interface IntelligenceReportResponse {
  accepted: true;
  reportId: string;
  nextStep: string;
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
