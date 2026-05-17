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
import {
  getLocalSchoolIntelligence,
  reportLocalSchoolIntelligence,
  uploadLocalTestResult
} from "./schoolIntelligenceDemo";
import { getSupabaseAccessToken } from "./supabaseClient";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getSupabaseAccessToken();
  const response = await fetch(path, {
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

function shouldUseLocalSchoolFallback(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.status === 404 || error.status === 405;
  }

  return error instanceof TypeError;
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
    if (!shouldUseLocalSchoolFallback(error)) {
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
    if (!shouldUseLocalSchoolFallback(error)) {
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
    if (!shouldUseLocalSchoolFallback(error)) {
      throw error;
    }
    return reportLocalSchoolIntelligence(payload);
  }
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
