# Supabase Handoff

The app is now prepared to host the shared school database on Supabase project `unvuikzzyfjwhnmjszew`.

## What I Implemented

- Supabase migration for the school intelligence schema.
- Private Storage bucket setup through SQL.
- RLS policies for private student uploads and shared aggregate reads.
- Edge Function: `school-intelligence`.
- GitHub Action: `Deploy Supabase Backend`.
- GitHub Pages build variables for the Supabase URL, publishable key, and Edge Function URL.
- Edge Function key handling for Supabase's current `SUPABASE_SECRET_KEYS` runtime secret, with legacy `SUPABASE_SERVICE_ROLE_KEY` fallback.

## You Need To Do

1. In Supabase, copy the database password.
2. In Supabase account settings, create a personal access token.
3. In GitHub repository settings, add this repository variable:

```text
VITE_SCHOOL_INTELLIGENCE_BACKEND=supabase-edge
```

The project ref, project URL, publishable key, and function URL now have safe workflow fallbacks:

```text
SUPABASE_PROJECT_REF=unvuikzzyfjwhnmjszew
VITE_SUPABASE_URL=https://unvuikzzyfjwhnmjszew.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://unvuikzzyfjwhnmjszew.supabase.co/functions/v1
```

4. In GitHub repository settings, add these repository secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
```

`VITE_SUPABASE_PUBLISHABLE_KEY` can also be added as a secret, but the workflow already has the browser-safe publishable key as a fallback.

5. Run the `Deploy Supabase Backend` workflow manually once.
6. Run the `Deploy GitHub Pages` workflow again so the public frontend receives `VITE_SCHOOL_INTELLIGENCE_BACKEND=supabase-edge`.

## After That

The School Intelligence page will stop using browser-local demo data and will write corrected-test uploads through:

```text
https://unvuikzzyfjwhnmjszew.supabase.co/functions/v1/school-intelligence
```

The function requires the user to be signed in with Supabase Auth. It keeps raw upload photos private and only returns shared intelligence that passes confidence and evidence thresholds.
