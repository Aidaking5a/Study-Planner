# Kloer Study

Kloer is a Luxembourg-first multilingual AI study copilot. This repo is the first framework for the product: a React app, a small agent API, a free local provider, and business-plan docs.

## What is built

- Study workspace for pasted notes and `.txt`/`.md` uploads.
- Mobile-first photo-note capture with client-side OCR.
- Free local agent API with no paid AI key required.
- Dedicated PowerPoint creator that downloads a topic-specific `.pptx`.
- Agent registry for explainer, quiz, flashcard, planner, and exam coach agents.
- Launch board for the first business milestones and beta lead scoring.
- API and business docs for scaling toward paid providers, tutors, and subscriptions.

## Run locally

```bash
npm.cmd install
npm.cmd run dev
```

The web app runs on `http://127.0.0.1:5173`.
The API runs on `http://127.0.0.1:8788`.

PowerShell may block `npm.ps1`, so use `npm.cmd` on this machine.

With the dev server running, you can exercise the main browser workflow:

```bash
npm.cmd run smoke
```

## Free-first agent model

The default provider is `free-local-template`. It is deterministic and runs without paid model calls. This is intentional for the first beta:

- validate workflows before spending money on tokens;
- keep the demo usable with a EUR 0 API budget;
- preserve a clean provider boundary for paid or open-source models later.

Set `AGENT_PROVIDER=free` in `.env`. Paid or self-hosted LLM adapters should be added behind the same API contract.

## Core endpoints

- `GET /api/health`
- `GET /api/agents`
- `POST /api/study/session`
- `POST /api/agents/run`
- `POST /api/waitlist`
- `POST /api/powerpoint/create`
- `GET /api/business/plan`

See [docs/API.md](./docs/API.md) for request examples.
See [docs/MOBILE_APP_PATH.md](./docs/MOBILE_APP_PATH.md) for the PWA-to-mobile migration plan.

## Product guardrail

Kloer is self-study support. The first version should not make official grading, ranking, admissions, tracking, or school-placement decisions.
