import type {
  AgentMeta,
  Flashcard,
  QuizQuestion,
  StudyInput,
  StudySessionResult,
  WaitlistResponse
} from "../types";

export const localAgents: AgentMeta[] = [
  {
    id: "concept-explainer",
    name: "Concept Explainer",
    role: "Turns messy notes into a clear multilingual explanation.",
    costTier: "free-local",
    defaultEnabled: true
  },
  {
    id: "quiz-builder",
    name: "Quiz Builder",
    role: "Creates active-recall questions from the student's own material.",
    costTier: "free-local",
    defaultEnabled: true
  },
  {
    id: "flashcard-maker",
    name: "Flashcard Maker",
    role: "Builds lightweight study cards for repetition.",
    costTier: "free-local",
    defaultEnabled: true
  },
  {
    id: "study-planner",
    name: "Study Planner",
    role: "Turns an exam date and goals into a short action plan.",
    costTier: "free-local",
    defaultEnabled: true
  },
  {
    id: "exam-coach",
    name: "Exam Coach",
    role: "Suggests the next best study action and keeps the session focused.",
    costTier: "free-local",
    defaultEnabled: false
  }
];

const languageLabels: Record<StudyInput["language"], string> = {
  en: "English",
  fr: "French",
  de: "German",
  "lb-simple": "simple Luxembourgish-style"
};

const levelLabels: Record<StudyInput["level"], string> = {
  "lower-secondary": "lower secondary",
  "upper-secondary": "upper secondary",
  university: "university"
};

const stopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "are",
  "was",
  "were",
  "you",
  "your",
  "les",
  "des",
  "une",
  "pour",
  "dans",
  "est",
  "und",
  "der",
  "die",
  "das",
  "mit",
  "ist",
  "auf",
  "den",
  "dem"
]);

export function createLocalStudySession(input: StudyInput): StudySessionResult {
  const sentences = splitSentences(input.rawText);
  const keywords = extractKeywords(input.rawText);
  const summary = buildSummary(input, sentences, keywords);
  const keyIdeas = buildKeyIdeas(sentences, keywords);
  const flashcards = buildFlashcards(keywords, sentences);
  const quiz = buildQuiz(keywords, sentences);
  const weakSpots = buildWeakSpots(input, keywords);
  const studyPlan = buildStudyPlan(input, keywords);

  return {
    provider: "free-browser-local",
    generatedAt: new Date().toISOString(),
    summary,
    keyIdeas,
    weakSpots,
    flashcards,
    quiz,
    studyPlan,
    complianceNote:
      "Free beta output is generated locally in the browser when no API server is available. It is for self-study support only."
  };
}

export function runLocalAgent(agentId: string, input: StudyInput): unknown {
  const session = createLocalStudySession(input);

  switch (agentId) {
    case "concept-explainer":
      return {
        summary: session.summary,
        keyIdeas: session.keyIdeas,
        weakSpots: session.weakSpots
      };
    case "quiz-builder":
      return session.quiz;
    case "flashcard-maker":
      return session.flashcards;
    case "study-planner":
      return session.studyPlan;
    case "exam-coach":
      return {
        nextMove: session.studyPlan[0],
        reminders: [
          "Start with active recall before rereading.",
          "Mark every question you miss and retry it tomorrow.",
          "Explain the hardest idea out loud in your target language."
        ],
        weakSpots: session.weakSpots
      };
    default:
      throw new Error(`Unknown agent: ${agentId}`);
  }
}

export function scoreLocalWaitlistLead(payload: {
  email: string;
  persona: "student" | "parent" | "tutor" | "school" | "other";
  pain: string;
}): WaitlistResponse {
  const words = payload.pain.split(/\s+/).filter(Boolean).length;
  const personaBoost = payload.persona === "tutor" || payload.persona === "parent" ? 20 : 10;
  const score = Math.min(100, 30 + personaBoost + words * 3);

  return {
    accepted: true,
    score,
    nextStep:
      score >= 70
        ? "Invite this lead to a discovery interview within 48 hours."
        : "Add this lead to the beta list and ask one follow-up question."
  };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extractKeywords(text: string): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 4 && !stopwords.has(word));

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

function buildSummary(input: StudyInput, sentences: string[], keywords: string[]): string {
  const language = languageLabels[input.language];
  const level = levelLabels[input.level];
  const levelArticle = /^[aeiou]/i.test(level) ? "an" : "a";
  const focus = keywords.length > 0 ? keywords.slice(0, 4).join(", ") : input.subject;
  const anchor = sentences[0] ?? input.rawText.slice(0, 180);

  return `For ${levelArticle} ${level} learner studying ${input.subject}, this material is mainly about ${focus}. In ${language}, start from this anchor idea: ${anchor}`;
}

function buildKeyIdeas(sentences: string[], keywords: string[]): string[] {
  const ideas = sentences.slice(0, 4).map((sentence, index) => `Idea ${index + 1}: ${sentence}`);
  if (ideas.length >= 3) {
    return ideas;
  }

  return [
    ...ideas,
    ...keywords.slice(0, 3).map((keyword) => `Define and connect the term "${keyword}" to the rest of the topic.`)
  ].slice(0, 5);
}

function buildFlashcards(keywords: string[], sentences: string[]): Flashcard[] {
  const base = keywords.length > 0 ? keywords : ["core idea", "example", "method", "mistake"];

  return base.slice(0, 6).map((keyword, index) => ({
    front: `What should I know about ${keyword}?`,
    back: sentences[index % Math.max(sentences.length, 1)] ?? `Connect ${keyword} to the main lesson and give one example.`
  }));
}

function buildQuiz(keywords: string[], sentences: string[]): QuizQuestion[] {
  const base = keywords.length > 0 ? keywords.slice(0, 5) : ["main idea", "definition", "example"];

  return base.map((keyword, index) => ({
    prompt: `Which statement best checks your understanding of ${keyword}?`,
    choices: [
      `I can define ${keyword} and explain where it appears in the notes.`,
      `I only recognize the word ${keyword}.`,
      `I can skip ${keyword} because it is never tested.`,
      `I should memorize ${keyword} without examples.`
    ],
    answer: `I can define ${keyword} and explain where it appears in the notes.`,
    explanation:
      sentences[index % Math.max(sentences.length, 1)] ??
      `A strong answer links ${keyword} to the lesson, an example, and a common mistake.`
  }));
}

function buildWeakSpots(input: StudyInput, keywords: string[]): string[] {
  const language = languageLabels[input.language];
  return [
    `Translate the hardest terms into ${language} without losing meaning.`,
    `Explain ${keywords[0] ?? input.subject} without reading the notes.`,
    `Solve one fresh problem or example instead of rereading passively.`
  ];
}

function buildStudyPlan(input: StudyInput, keywords: string[]): string[] {
  const examLine = input.examDate ? `Target exam date: ${input.examDate}.` : "No exam date set yet.";
  const focus = keywords.slice(0, 5).join(", ") || input.subject;

  return [
    `${examLine} 0-10 min: write five questions about ${focus} before rereading anything.`,
    "10-25 min: close the notes and answer the questions from memory.",
    "25-35 min: open the notes, correct wrong answers, and mark the weakest two ideas.",
    "35-45 min: redo only the weak ideas with one fresh example or exercise.",
    "Tomorrow: retry the quiz first, then add new material only after the weak spots improve."
  ];
}
