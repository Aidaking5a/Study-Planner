# School Intelligence Backend

Kloer now has a Supabase-ready data layer for shared, anonymized school intelligence.

## What Is Implemented

- Supabase migration for Auth-owned private uploads, school/course/teacher entities, shared aggregate intelligence, reports, and agent audit logs.
- Private Storage bucket: `test-result-uploads`.
- RLS policies so students can read their own raw uploads/results only.
- Shared intelligence is readable only when `status = 'shared'`, `evidence_count >= 3`, and `confidence_score >= 0.74`.
- Express endpoints:
  - `GET /api/school-intelligence`
  - `POST /api/school-intelligence/results`
  - `POST /api/school-intelligence/report`
- Frontend route: `/school-intelligence`.
- Supabase magic-link sign-in on the School Intelligence page when browser env vars are configured.
- GitHub Pages-safe local demo fallback when no API/backend is available.

## Supabase Setup

1. Create a Supabase project.
2. Set API environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
SUPABASE_RESULT_UPLOAD_BUCKET=test-result-uploads
SCHOOL_INTELLIGENCE_MIN_CONFIDENCE=0.74
SCHOOL_INTELLIGENCE_MIN_EVIDENCE=3
```

3. Set browser environment variables for future Auth wiring:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=browser-publishable-key
```

4. Apply the migration:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## Privacy Rules In The Schema

- Raw photos live in private per-user Storage paths: `{user_id}/{result_id}/page-{n}.jpg`.
- Private tables use `student_id = auth.uid()` policies.
- Shared tables expose only aggregate rows that pass evidence and confidence thresholds.
- Reports go to `intelligence_reports` for moderation.
- Agent work is auditable through `agent_extraction_jobs` and `agent_audit_events`.

## Production Note

GitHub Pages only hosts the static frontend. The Supabase-backed API needs a server host or Supabase Edge Functions. Until then, the deployed static app uses the local demo fallback for the School Intelligence page.
