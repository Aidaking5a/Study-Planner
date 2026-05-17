# Supabase Handoff

The app is now prepared to host the shared school database on Supabase. I cannot create the project or see the secret keys for you, so these are the remaining owner-only steps.

## What I Implemented

- Supabase migration for the school intelligence schema.
- Private Storage bucket setup through SQL.
- RLS policies for private student uploads and shared aggregate reads.
- Edge Function: `school-intelligence`.
- GitHub Action: `Deploy Supabase Backend`.
- GitHub Pages build variables for Supabase Edge Function mode.

## You Need To Do

1. Create a Supabase project.
2. In Supabase, copy:
   - Project ref
   - Project URL
   - Publishable key
   - Database password
   - Personal access token
3. In GitHub repository settings, add these repository variables:

```text
SUPABASE_PROJECT_REF
VITE_SUPABASE_URL
VITE_SCHOOL_INTELLIGENCE_BACKEND=supabase-edge
VITE_SUPABASE_FUNCTIONS_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
```

4. In GitHub repository settings, add these repository secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
VITE_SUPABASE_PUBLISHABLE_KEY
```

5. Run the `Deploy Supabase Backend` workflow manually once.
6. Run the `Deploy GitHub Pages` workflow again so the public frontend receives the Supabase `VITE_*` values.

## After That

The School Intelligence page will stop using browser-local demo data and will write corrected-test uploads through:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/school-intelligence
```

The function requires the user to be signed in with Supabase Auth. It keeps raw upload photos private and only returns shared intelligence that passes confidence and evidence thresholds.
