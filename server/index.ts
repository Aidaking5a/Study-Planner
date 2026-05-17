import cors from "cors";
import dotenv from "dotenv";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import {
  agentRunSchema,
  intelligenceReportSchema,
  powerPointSchema,
  resultUploadSchema,
  schoolIntelligenceQuerySchema,
  studyInputSchema,
  waitlistSchema
} from "./agentApi.js";
import { agents, findAgent } from "./agents/registry.js";
import { businessPlan } from "./businessPlan.js";
import { buildPowerPointFilename, createPowerPointDeck } from "./powerpoint.js";
import { createFreeStudySession, runFreeAgent } from "./providers/freeProvider.js";
import {
  getSchoolIntelligence,
  getSchoolIntelligenceRuntime,
  reportSchoolIntelligence,
  submitStudentResult
} from "./schoolIntelligence.js";
import type { WaitlistResponse } from "../shared/types.js";

dotenv.config();

const app = express();
const port = Number(process.env.API_PORT ?? 8788);

app.use(
  cors({
    origin: process.env.WEB_ORIGIN?.split(",") ?? true
  })
);
app.use(express.json({ limit: "18mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "kloer-agent-api",
    provider: process.env.AGENT_PROVIDER ?? "free",
    freeBeta: true,
    schoolIntelligence: getSchoolIntelligenceRuntime()
  });
});

app.get("/api/agents", (_request, response) => {
  response.json({ agents });
});

app.post("/api/agents/run", (request, response, next) => {
  try {
    const body = agentRunSchema.parse(request.body);
    const agent = findAgent(body.agentId);

    if (!agent) {
      response.status(404).json({ error: `Unknown agent: ${body.agentId}` });
      return;
    }

    const result = runFreeAgent(agent.id, body.input);

    response.json({
      agent,
      provider: "free-local-template",
      generatedAt: new Date().toISOString(),
      result
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/study/session", (request, response, next) => {
  try {
    const input = studyInputSchema.parse(request.body);
    response.json(createFreeStudySession(input));
  } catch (error) {
    next(error);
  }
});

app.get("/api/business/plan", (_request, response) => {
  response.json(businessPlan);
});

app.get("/api/school-intelligence", async (request, response, next) => {
  try {
    const query = schoolIntelligenceQuerySchema.parse(request.query);
    response.json(await getSchoolIntelligence(query));
  } catch (error) {
    next(error);
  }
});

app.post("/api/school-intelligence/results", async (request, response, next) => {
  try {
    const body = resultUploadSchema.parse(request.body);
    const payload = await submitStudentResult(body, request.header("authorization"));
    response.status(202).json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/school-intelligence/report", async (request, response, next) => {
  try {
    const body = intelligenceReportSchema.parse(request.body);
    const payload = await reportSchoolIntelligence(body, request.header("authorization"));
    response.status(202).json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/powerpoint/create", async (request, response, next) => {
  try {
    const body = powerPointSchema.parse(request.body);
    const deck = await createPowerPointDeck(body);
    const filename = buildPowerPointFilename(body.topic);

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("X-Kloer-Slide-Count", String(body.slideCount));
    response.send(deck);
  } catch (error) {
    next(error);
  }
});

app.post("/api/waitlist", (request, response, next) => {
  try {
    const body = waitlistSchema.parse(request.body);
    const score = scoreLead(body.pain, body.persona);
    const payload: WaitlistResponse = {
      accepted: true,
      score,
      nextStep:
        score >= 70
          ? "Invite this lead to a discovery interview within 48 hours."
          : "Add this lead to the beta list and ask one follow-up question."
    };

    response.status(202).json(payload);
  } catch (error) {
    next(error);
  }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Validation failed",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  response.status(500).json({
    error: error instanceof Error ? error.message : "Unexpected server error"
  });
};

app.use(errorHandler);

app.listen(port, "127.0.0.1", () => {
  console.log(`Kloer agent API running at http://127.0.0.1:${port}`);
});

function scoreLead(pain: string, persona: string): number {
  const words = pain.split(/\s+/).filter(Boolean).length;
  const personaBoost = persona === "tutor" || persona === "parent" ? 20 : 10;
  return Math.min(100, 30 + personaBoost + words * 3);
}
