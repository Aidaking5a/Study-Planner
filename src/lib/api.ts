import type {
  AgentMeta,
  AgentRunResponse,
  IntelligenceReportRequest,
  IntelligenceReportResponse,
  PowerPointRequest,
  ResultUploadRequest,
  ResultUploadResponse,
  SchoolIntelligenceQuery,
  SchoolIntelligenceResponse,
  StudyInput,
  StudySessionResult,
  WaitlistResponse
} from "../types";
import { createLocalPowerPoint } from "./localPowerPoint";
import {
  createLocalStudySession,
  localAgents,
  runLocalAgent,
  scoreLocalWaitlistLead
} from "./localStudyProvider";
import {
  getLocalSchoolIntelligence,
  reportLocalSchoolIntelligence,
  uploadLocalTestResult
} from "./schoolIntelligenceDemo";
import { getSupabaseAccessToken } from "./supabaseClient";

const apiMode = import.meta.env.VITE_API_MODE as string | undefined;
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (apiMode === "static") {
    throw new ApiRequestError("Static build uses browser-local free providers.", 404);
  }

  const accessToken = await getSupabaseAccessToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new ApiRequestError(details.error ?? `Request failed with ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function shouldUseLocalFallback(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.status === 404 || error.status === 405;
  }

  return error instanceof TypeError;
}

export async function getAgents() {
  try {
    return await request<{ agents: AgentMeta[] }>("/api/agents");
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return { agents: localAgents };
  }
}

export async function createStudySession(input: StudyInput) {
  try {
    return await request<StudySessionResult>("/api/study/session", {
      method: "POST",
      body: JSON.stringify(input)
    });
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return createLocalStudySession(input);
  }
}

export async function runAgent(agentId: string, input: StudyInput) {
  try {
    return await request<AgentRunResponse>("/api/agents/run", {
      method: "POST",
      body: JSON.stringify({ agentId, input })
    });
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }

    const agent = localAgents.find((candidate) => candidate.id === agentId) ?? localAgents[0];
    return {
      agent,
      provider: "free-browser-local",
      generatedAt: new Date().toISOString(),
      result: runLocalAgent(agent.id, input)
    };
  }
}

export async function joinWaitlist(payload: {
  email: string;
  persona: "student" | "parent" | "tutor" | "school" | "other";
  language: StudyInput["language"];
  pain: string;
}) {
  try {
    return await request<WaitlistResponse>("/api/waitlist", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return scoreLocalWaitlistLead(payload);
  }
}

export async function getSchoolIntelligence(query: SchoolIntelligenceQuery = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      search.set(key, String(value));
    }
  }

  try {
    return await request<SchoolIntelligenceResponse>(
      `/api/school-intelligence${search.toString() ? `?${search.toString()}` : ""}`
    );
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return getLocalSchoolIntelligence(query);
  }
}

export async function uploadTestResult(payload: ResultUploadRequest) {
  try {
    return await request<ResultUploadResponse>("/api/school-intelligence/results", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return uploadLocalTestResult(payload);
  }
}

export async function reportSchoolIntelligence(payload: IntelligenceReportRequest) {
  try {
    return await request<IntelligenceReportResponse>("/api/school-intelligence/report", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return reportLocalSchoolIntelligence(payload);
  }
}

export async function createPowerPoint(payload: PowerPointRequest) {
  try {
    if (apiMode === "static") {
      throw new ApiRequestError("Static build uses browser-local PowerPoint generation.", 404);
    }

    const accessToken = await getSupabaseAccessToken();
    const response = await fetch(`${apiBaseUrl}/api/powerpoint/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new ApiRequestError(details.error ?? `PowerPoint request failed with ${response.status}`, response.status);
    }

    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? "kloer-presentation.pptx";
    const blob = await response.blob();

    return { blob, filename };
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      throw error;
    }
    return createLocalPowerPoint(payload);
  }
}
