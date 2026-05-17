create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.intelligence_status as enum ('seed', 'needs_more_evidence', 'shared', 'suppressed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agent_job_status as enum ('queued', 'processing', 'completed', 'failed', 'needs_review');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  school_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null default 'LU',
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists schools_identity_idx
  on public.schools (lower(name), country_code, coalesce(lower(city), ''));

alter table public.profiles
  add constraint profiles_school_id_fkey
  foreign key (school_id) references public.schools(id)
  on delete set null;

create table if not exists public.school_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  label text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (school_id, label)
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid references public.school_years(id) on delete set null,
  subject text not null,
  level text,
  language text,
  created_at timestamptz not null default now()
);

create index if not exists courses_school_subject_idx on public.courses (school_id, lower(subject));

create table if not exists public.teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  display_name text not null,
  normalized_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists teacher_profiles_identity_idx
  on public.teacher_profiles (school_id, lower(display_name));

create table if not exists public.school_tests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid references public.school_years(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  teacher_profile_id uuid references public.teacher_profiles(id) on delete set null,
  title text not null,
  test_date date,
  source_confidence numeric(4, 3) not null default 0.5 check (source_confidence >= 0 and source_confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_tests_lookup_idx
  on public.school_tests (school_id, school_year_id, course_id, teacher_profile_id, test_date);

create table if not exists public.test_topics (
  id uuid primary key default gen_random_uuid(),
  school_test_id uuid not null references public.school_tests(id) on delete cascade,
  topic text not null,
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  created_at timestamptz not null default now()
);

create unique index if not exists test_topics_identity_idx
  on public.test_topics (school_test_id, lower(topic));

create table if not exists public.expected_answers (
  id uuid primary key default gen_random_uuid(),
  school_test_id uuid references public.school_tests(id) on delete cascade,
  topic text not null,
  expected_answer text not null,
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  status public.intelligence_status not null default 'needs_more_evidence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.correction_style_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_profile_id uuid references public.teacher_profiles(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  label text not null,
  summary text not null,
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  status public.intelligence_status not null default 'needs_more_evidence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_test_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  school_test_id uuid references public.school_tests(id) on delete set null,
  subject text not null,
  test_title text not null,
  taken_on date,
  student_reflection text,
  extraction_status public.intelligence_status not null default 'seed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_test_results_owner_idx on public.student_test_results (student_id, created_at desc);

create table if not exists public.result_uploads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  result_id uuid not null references public.student_test_results(id) on delete cascade,
  storage_bucket text not null default 'test-result-uploads',
  storage_path text not null,
  page_number integer not null check (page_number >= 1),
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  sha256 text,
  upload_status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists public.extracted_marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  result_id uuid not null references public.student_test_results(id) on delete cascade,
  mark_obtained numeric,
  mark_max numeric,
  mark_percent numeric,
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  created_at timestamptz not null default now()
);

create table if not exists public.student_private_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  result_id uuid not null references public.student_test_results(id) on delete cascade,
  feedback text not null,
  suggested_next_steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.test_intelligence (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid references public.school_years(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  teacher_profile_id uuid references public.teacher_profiles(id) on delete set null,
  subject text not null,
  test_title text not null,
  topic_summary text not null,
  expected_answer_pattern text not null,
  correction_style_summary text not null,
  common_mistake_summary text not null,
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  status public.intelligence_status not null default 'needs_more_evidence',
  source_result_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists test_intelligence_visibility_idx
  on public.test_intelligence (school_id, course_id, teacher_profile_id, status, evidence_count, confidence_score);

create table if not exists public.teacher_correction_patterns (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  teacher_profile_id uuid references public.teacher_profiles(id) on delete set null,
  pattern text not null,
  guidance text not null,
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  status public.intelligence_status not null default 'needs_more_evidence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mark_distribution_buckets (
  id uuid primary key default gen_random_uuid(),
  school_test_id uuid references public.school_tests(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  teacher_profile_id uuid references public.teacher_profiles(id) on delete set null,
  bucket_label text not null,
  count integer not null default 1 check (count >= 1),
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  status public.intelligence_status not null default 'needs_more_evidence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.common_mistakes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  teacher_profile_id uuid references public.teacher_profiles(id) on delete set null,
  topic text not null,
  mistake text not null,
  recommended_fix text not null,
  evidence_count integer not null default 1 check (evidence_count >= 1),
  confidence_score numeric(4, 3) not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  status public.intelligence_status not null default 'needs_more_evidence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  result_id uuid not null references public.student_test_results(id) on delete cascade,
  status public.agent_job_status not null default 'queued',
  input_summary jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  confidence_score numeric(4, 3) check (confidence_score >= 0 and confidence_score <= 1),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.agent_audit_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references auth.users(id) on delete set null,
  result_id uuid references public.student_test_results(id) on delete cascade,
  agent_job_id uuid references public.agent_extraction_jobs(id) on delete set null,
  actor text not null default 'agent',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  reason text not null,
  details text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'test-result-uploads',
  'test-result-uploads',
  false,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.school_years enable row level security;
alter table public.courses enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.school_tests enable row level security;
alter table public.test_topics enable row level security;
alter table public.expected_answers enable row level security;
alter table public.correction_style_profiles enable row level security;
alter table public.student_test_results enable row level security;
alter table public.result_uploads enable row level security;
alter table public.extracted_marks enable row level security;
alter table public.student_private_feedback enable row level security;
alter table public.test_intelligence enable row level security;
alter table public.teacher_correction_patterns enable row level security;
alter table public.mark_distribution_buckets enable row level security;
alter table public.common_mistakes enable row level security;
alter table public.agent_extraction_jobs enable row level security;
alter table public.agent_audit_events enable row level security;
alter table public.intelligence_reports enable row level security;

create policy "students read their profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "students insert their profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy "students update their profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "authenticated read schools" on public.schools
  for select to authenticated using (true);

create policy "authenticated read school years" on public.school_years
  for select to authenticated using (true);

create policy "authenticated read courses" on public.courses
  for select to authenticated using (true);

create policy "authenticated read teacher profiles" on public.teacher_profiles
  for select to authenticated using (true);

create policy "authenticated read school tests" on public.school_tests
  for select to authenticated using (true);

create policy "authenticated read test topics" on public.test_topics
  for select to authenticated using (true);

create policy "read shared expected answers" on public.expected_answers
  for select to authenticated
  using (status = 'shared' and evidence_count >= 3 and confidence_score >= 0.74);

create policy "read shared correction style profiles" on public.correction_style_profiles
  for select to authenticated
  using (status = 'shared' and evidence_count >= 3 and confidence_score >= 0.74);

create policy "students read own test results" on public.student_test_results
  for select to authenticated using (student_id = auth.uid());

create policy "students insert own test results" on public.student_test_results
  for insert to authenticated with check (student_id = auth.uid());

create policy "students update own test results" on public.student_test_results
  for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy "students delete own test results" on public.student_test_results
  for delete to authenticated using (student_id = auth.uid());

create policy "students read own uploads" on public.result_uploads
  for select to authenticated using (student_id = auth.uid());

create policy "students insert own uploads" on public.result_uploads
  for insert to authenticated with check (student_id = auth.uid());

create policy "students delete own uploads" on public.result_uploads
  for delete to authenticated using (student_id = auth.uid());

create policy "students read own extracted marks" on public.extracted_marks
  for select to authenticated using (student_id = auth.uid());

create policy "students read own feedback" on public.student_private_feedback
  for select to authenticated using (student_id = auth.uid());

create policy "read shared test intelligence" on public.test_intelligence
  for select to authenticated
  using (status = 'shared' and evidence_count >= 3 and confidence_score >= 0.74);

create policy "read shared teacher correction patterns" on public.teacher_correction_patterns
  for select to authenticated
  using (status = 'shared' and evidence_count >= 3 and confidence_score >= 0.74);

create policy "read shared mark buckets" on public.mark_distribution_buckets
  for select to authenticated
  using (status = 'shared' and evidence_count >= 3 and confidence_score >= 0.74);

create policy "read shared common mistakes" on public.common_mistakes
  for select to authenticated
  using (status = 'shared' and evidence_count >= 3 and confidence_score >= 0.74);

create policy "students read own extraction jobs" on public.agent_extraction_jobs
  for select to authenticated using (student_id = auth.uid());

create policy "students read own audit events" on public.agent_audit_events
  for select to authenticated using (student_id = auth.uid());

create policy "students insert intelligence reports" on public.intelligence_reports
  for insert to authenticated with check (student_id = auth.uid());

create policy "students read own intelligence reports" on public.intelligence_reports
  for select to authenticated using (student_id = auth.uid());

create policy "students upload own result photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'test-result-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "students read own result photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'test-result-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "students update own result photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'test-result-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'test-result-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "students delete own result photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'test-result-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant usage on schema public to anon, authenticated;

grant select on
  public.schools,
  public.school_years,
  public.courses,
  public.teacher_profiles,
  public.school_tests,
  public.test_topics,
  public.expected_answers,
  public.correction_style_profiles,
  public.test_intelligence,
  public.teacher_correction_patterns,
  public.mark_distribution_buckets,
  public.common_mistakes
to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.student_test_results,
  public.result_uploads,
  public.extracted_marks,
  public.student_private_feedback,
  public.agent_extraction_jobs,
  public.agent_audit_events,
  public.intelligence_reports
to authenticated;
