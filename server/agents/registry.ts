import type { AgentMeta } from "../../shared/types.js";

export const agents: AgentMeta[] = [
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

export function findAgent(agentId: string): AgentMeta | undefined {
  return agents.find((agent) => agent.id === agentId);
}
