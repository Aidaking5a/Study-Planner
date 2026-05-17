# Kloer Agent API

The API is intentionally free in the beginning. It uses a deterministic local provider called `free-local-template`, so the beta can validate usage before any paid AI calls are introduced.

Image-note OCR currently runs in the browser with Tesseract.js and then sends the extracted text to the same study session endpoint. The API does not store or process the original note image in the beta flow.

## Base URL

```text
http://127.0.0.1:8788
```

During Vite development, the frontend proxies `/api` to the local API.

## Study session

`POST /api/study/session`

```json
{
  "rawText": "Enzymes are biological catalysts...",
  "subject": "Biology: enzymes",
  "level": "upper-secondary",
  "language": "en",
  "goals": ["prepare for test"],
  "examDate": "2026-06-10"
}
```

Returns:

- summary
- key ideas
- weak spots
- flashcards
- quiz
- study plan
- compliance note

## Agent registry

`GET /api/agents`

Each agent includes:

- `id`
- `name`
- `role`
- `costTier`
- `defaultEnabled`

Current agents:

- `concept-explainer`
- `quiz-builder`
- `flashcard-maker`
- `study-planner`
- `exam-coach`

## Run one agent

`POST /api/agents/run`

```json
{
  "agentId": "quiz-builder",
  "input": {
    "rawText": "Enzymes are biological catalysts...",
    "subject": "Biology: enzymes",
    "level": "upper-secondary",
    "language": "en",
    "goals": ["prepare for test"]
  }
}
```

## Beta waitlist

`POST /api/waitlist`

```json
{
  "email": "student@example.com",
  "persona": "student",
  "language": "en",
  "pain": "I need help preparing for biology tests in English and French."
}
```

This demo endpoint does not persist data yet. Add a real database only after the interview and beta flow proves useful.

## PowerPoint creator

`POST /api/powerpoint/create`

Returns a downloadable `.pptx` file. The deck is generated from the student's topic, notes, audience, goal, language, and level.

```json
{
  "topic": "Biology: enzymes",
  "rawText": "Enzymes are biological catalysts...",
  "audience": "upper-secondary biology students",
  "goal": "Explain enzyme activity clearly using my notes",
  "language": "en",
  "level": "upper-secondary",
  "slideCount": 8
}
```

The generated deck includes topic-specific title, context, key ideas, concept map, examples, practice prompts, weak spots, and study plan slides.

## Provider roadmap

The API should keep this boundary:

```ts
type AgentProvider = {
  name: string;
  runStudySession(input: StudyInput): Promise<StudySessionResult>;
  runAgent(agentId: string, input: StudyInput): Promise<unknown>;
};
```

Recommended progression:

1. `free-local-template`: current beta, no model calls.
2. `browser-local`: local/on-device model for low-cost generation when feasible.
3. `openai-compatible`: bring-your-own-key or paid Kloer credits.
4. `school-private`: isolated tenant with stricter data retention and audit logs.

Do not leak provider-specific model details into the frontend.
