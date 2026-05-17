import type {
  ExamPriority,
  PracticeItem,
  PracticeResult,
  ProgressSnapshot,
  StudentExam,
  StudyPlan,
  StudyTask,
  TaskStatus
} from "../types";

const EXAMS_KEY = "kloer.exams.v1";
const PLANS_KEY = "kloer.plans.v1";
const PRACTICE_KEY = "kloer.practice.v1";

export const STUDY_STATE_EVENT = "kloer-study-state-change";

type StoredCollection<T> = T[];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STUDY_STATE_EVENT));
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function daysUntil(date: string) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = parseIsoDate(todayIso()).getTime();
  return Math.ceil((parseIsoDate(date).getTime() - today) / dayMs);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTopics(topics: string[]) {
  const cleaned = topics.map((topic) => topic.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["Core concepts", "Definitions", "Practice questions"];
}

export function getUpcomingExams(): StudentExam[] {
  return readJson<StoredCollection<StudentExam>>(EXAMS_KEY, [])
    .filter((exam) => daysUntil(exam.date) >= -1)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function getAllExams(): StudentExam[] {
  return readJson<StoredCollection<StudentExam>>(EXAMS_KEY, []).sort((left, right) =>
    left.date.localeCompare(right.date)
  );
}

export function getStudyPlans(): StudyPlan[] {
  return readJson<StoredCollection<StudyPlan>>(PLANS_KEY, []).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function getPracticeResults(): PracticeResult[] {
  return readJson<StoredCollection<PracticeResult>>(PRACTICE_KEY, []);
}

export function saveExam(
  exam: Partial<StudentExam> & Pick<StudentExam, "subject" | "title" | "date" | "topics">
): StudentExam {
  const now = new Date().toISOString();
  const exams = getAllExams();
  const existing = exam.id ? exams.find((candidate) => candidate.id === exam.id) : undefined;
  const savedExam: StudentExam = {
    id: exam.id ?? createId("exam"),
    subject: exam.subject.trim(),
    title: exam.title.trim() || `${exam.subject.trim()} test`,
    date: exam.date,
    topics: normalizeTopics(exam.topics),
    confidence: clamp(Math.round(exam.confidence ?? existing?.confidence ?? 45), 0, 100),
    priority: (exam.priority ?? existing?.priority ?? "medium") as ExamPriority,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const nextExams = existing
    ? exams.map((candidate) => (candidate.id === savedExam.id ? savedExam : candidate))
    : [...exams, savedExam];

  writeJson(EXAMS_KEY, nextExams);
  return savedExam;
}

export function deleteExam(examId: string) {
  writeJson(
    EXAMS_KEY,
    getAllExams().filter((exam) => exam.id !== examId)
  );
  writeJson(
    PLANS_KEY,
    getStudyPlans()
      .map((plan) => ({
        ...plan,
        examIds: plan.examIds.filter((id) => id !== examId),
        tasks: plan.tasks.filter((task) => task.examId !== examId)
      }))
      .filter((plan) => plan.examIds.length > 0 && plan.tasks.length > 0)
  );
  writeJson(
    PRACTICE_KEY,
    getPracticeResults().filter((result) => result.examId !== examId)
  );
}

export function generatePlanFromExam(exam: StudentExam): StudyPlan {
  const existingPlans = getStudyPlans();
  const daysLeft = Math.max(1, daysUntil(exam.date));
  const topics = normalizeTopics(exam.topics);
  const tasks = topics.flatMap((topic, index) => {
    const firstOffset = Math.min(daysLeft - 1, index);
    const reviewOffset = Math.max(firstOffset, daysLeft - 1);
    const firstDate = addDaysIso(todayIso(), firstOffset);
    const reviewDate = addDaysIso(todayIso(), reviewOffset);
    const base: StudyTask[] = [
      {
        id: createId("task"),
        examId: exam.id,
        date: firstDate,
        topic: `Learn ${topic}`,
        estimateMinutes: exam.priority === "high" ? 35 : 25,
        status: "todo"
      },
      {
        id: createId("task"),
        examId: exam.id,
        date: reviewDate,
        topic: `Active recall for ${topic}`,
        estimateMinutes: exam.priority === "high" ? 30 : 20,
        status: "todo"
      }
    ];

    return base;
  });

  const plan: StudyPlan = {
    id: createId("plan"),
    examIds: [exam.id],
    title: `${exam.subject}: ${exam.title}`,
    createdAt: new Date().toISOString(),
    tasks: tasks.sort((left, right) => left.date.localeCompare(right.date))
  };

  writeJson(PLANS_KEY, [plan, ...existingPlans.filter((candidate) => !candidate.examIds.includes(exam.id))]);
  return plan;
}

export function commitStudyPlan(planId: string): StudyPlan | undefined {
  const plans = getStudyPlans();
  const committedAt = new Date().toISOString();
  let committedPlan: StudyPlan | undefined;
  const nextPlans = plans.map((plan) => {
    if (plan.id !== planId) {
      return plan;
    }

    committedPlan = { ...plan, committedAt };
    return committedPlan;
  });

  writeJson(PLANS_KEY, nextPlans);
  return committedPlan;
}

export function updateTaskStatus(planId: string, taskId: string, status: TaskStatus) {
  const nextPlans = getStudyPlans().map((plan) =>
    plan.id === planId
      ? {
          ...plan,
          tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, status } : task))
        }
      : plan
  );

  writeJson(PLANS_KEY, nextPlans);
}

export function recordPracticeResult(result: Omit<PracticeResult, "id" | "createdAt">): PracticeResult {
  const savedResult: PracticeResult = {
    ...result,
    id: createId("practice"),
    createdAt: new Date().toISOString()
  };
  writeJson(PRACTICE_KEY, [...getPracticeResults(), savedResult]);
  return savedResult;
}

export function getProgressSnapshot(): ProgressSnapshot {
  const exams = getUpcomingExams();
  const plans = getStudyPlans();
  const practice = getPracticeResults();
  const tasks = plans.flatMap((plan) => plan.tasks);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const taskScore = totalTasks > 0 ? completedTasks / totalTasks : 0;
  const correctPractice = practice.filter((result) => result.correct).length;
  const practiceAccuracy = practice.length > 0 ? Math.round((correctPractice / practice.length) * 100) : 0;
  const practiceScore = practice.length > 0 ? correctPractice / practice.length : 0;
  const percent = Math.round((taskScore * 0.7 + practiceScore * 0.3) * 100);
  const missesByTopic = practice.reduce<Record<string, number>>((accumulator, result) => {
    if (!result.correct) {
      accumulator[result.topic] = (accumulator[result.topic] ?? 0) + 1;
    }
    return accumulator;
  }, {});
  const weakSpots = Object.entries(missesByTopic)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([topic]) => topic);

  return {
    percent,
    completedTasks,
    totalTasks,
    practiceAccuracy,
    examsTracked: exams.length,
    weakSpots
  };
}

export function buildPracticeItems(exam: StudentExam): PracticeItem[] {
  return normalizeTopics(exam.topics).map((topic) => {
    const lowerTopic = topic.toLowerCase();
    return {
      id: `${exam.id}-${lowerTopic.replace(/[^a-z0-9]+/gi, "-")}`,
      examId: exam.id,
      topic,
      summary: `${topic} is a priority for ${exam.title}. Explain the central rule, connect it to one example, then test whether you can recall it without looking.`,
      definition: `Know the definition of ${topic}, one worked example, and one common mistake your teacher could test.`,
      flashcard: {
        front: `What must you remember about ${topic}?`,
        back: `State the definition, give one example, and name the common mistake for ${topic}.`
      },
      quiz: {
        prompt: `Which answer shows strong understanding of ${topic}?`,
        choices: [
          `I can define ${topic} and apply it to a new example.`,
          `I have reread the page about ${topic}.`,
          `I remember that ${topic} appeared in class.`
        ],
        answer: `I can define ${topic} and apply it to a new example.`,
        explanation: "A test checks transfer, not just recognition."
      }
    };
  });
}

export function addDaysIso(startDate: string, offset: number) {
  const date = parseIsoDate(startDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}
