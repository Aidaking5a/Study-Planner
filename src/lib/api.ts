import type {
  AgentMeta,
  AgentRunResponse,
  PowerPointRequest,
  StudyInput,
  StudySessionResult,
  WaitlistResponse
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getAgents() {
  return request<{ agents: AgentMeta[] }>("/api/agents");
}

export function createStudySession(input: StudyInput) {
  return request<StudySessionResult>("/api/study/session", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function runAgent(agentId: string, input: StudyInput) {
  return request<AgentRunResponse>("/api/agents/run", {
    method: "POST",
    body: JSON.stringify({ agentId, input })
  });
}

export function joinWaitlist(payload: {
  email: string;
  persona: "student" | "parent" | "tutor" | "school" | "other";
  language: StudyInput["language"];
  pain: string;
}) {
  return request<WaitlistResponse>("/api/waitlist", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createPowerPoint(payload: PowerPointRequest) {
  const response = await fetch("/api/powerpoint/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error ?? `PowerPoint request failed with ${response.status}`);
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? "kloer-presentation.pptx";
  const blob = await response.blob();

  return { blob, filename };
}
