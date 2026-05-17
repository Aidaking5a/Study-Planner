import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKey = getSupabaseSecretKey();
const uploadBucket =
  Deno.env.get("RESULT_UPLOAD_BUCKET") ?? Deno.env.get("SUPABASE_RESULT_UPLOAD_BUCKET") ?? "test-result-uploads";
const minConfidence = Number(Deno.env.get("SCHOOL_INTELLIGENCE_MIN_CONFIDENCE") ?? "0.74");
const minEvidence = Number(Deno.env.get("SCHOOL_INTELLIGENCE_MIN_EVIDENCE") ?? "3");

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !secretKey) {
      return json({ error: "Supabase function secrets are not configured." }, 500);
    }

    const user = await requireUser(request);
    const url = new URL(request.url);

    if (request.method === "GET") {
      return json(await getSchoolIntelligence(url));
    }

    if (request.method === "POST" && url.pathname.endsWith("/results")) {
      const body = await request.json();
      return json(await submitStudentResult(body, user.id), 202);
    }

    if (request.method === "POST" && url.pathname.endsWith("/report")) {
      const body = await request.json();
      return json(await reportSchoolIntelligence(body, user.id), 202);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected function error";
    const status = message.includes("Sign in") || message.includes("Invalid session") ? 401 : 500;
    return json({ error: message }, status);
  }
});

function getSupabaseSecretKey() {
  const explicitKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (explicitKey) {
    return explicitKey;
  }

  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeysJson) {
    return "";
  }

  try {
    const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>;
    return secretKeys.default ?? Object.values(secretKeys)[0] ?? "";
  } catch {
    return "";
  }
}

async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Sign in before using shared school intelligence.");
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid session. Sign in again.");
  }

  return data.user;
}

async function getSchoolIntelligence(url: URL) {
  const schoolId = url.searchParams.get("schoolId");
  const schoolName = url.searchParams.get("schoolName");
  const subject = url.searchParams.get("subject");
  const teacherProfileId = url.searchParams.get("teacherProfileId");

  const school = schoolId
    ? await selectMaybeSingle("schools", { id: schoolId })
    : schoolName
      ? await selectMaybeSingle("schools", { name: schoolName })
      : null;

  let testsQuery = admin
    .from("test_intelligence")
    .select("*")
    .eq("status", "shared")
    .gte("evidence_count", minEvidence)
    .gte("confidence_score", minConfidence)
    .limit(20);

  if (school?.id ?? schoolId) {
    testsQuery = testsQuery.eq("school_id", school?.id ?? schoolId);
  }
  if (subject) {
    testsQuery = testsQuery.ilike("subject", subject);
  }

  let patternsQuery = admin
    .from("teacher_correction_patterns")
    .select("*")
    .eq("status", "shared")
    .gte("evidence_count", minEvidence)
    .gte("confidence_score", minConfidence)
    .limit(20);

  if (school?.id ?? schoolId) {
    patternsQuery = patternsQuery.eq("school_id", school?.id ?? schoolId);
  }
  if (teacherProfileId) {
    patternsQuery = patternsQuery.eq("teacher_profile_id", teacherProfileId);
  }

  const [tests, patterns, mistakes, answers, buckets] = await Promise.all([
    testsQuery,
    patternsQuery,
    admin
      .from("common_mistakes")
      .select("*")
      .eq("status", "shared")
      .gte("evidence_count", minEvidence)
      .gte("confidence_score", minConfidence)
      .limit(30),
    admin
      .from("expected_answers")
      .select("*")
      .eq("status", "shared")
      .gte("evidence_count", minEvidence)
      .gte("confidence_score", minConfidence)
      .limit(30),
    admin
      .from("mark_distribution_buckets")
      .select("*")
      .eq("status", "shared")
      .gte("evidence_count", minEvidence)
      .gte("confidence_score", minConfidence)
      .limit(20)
  ]);

  for (const result of [tests, patterns, mistakes, answers, buckets]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return {
    provider: "supabase",
    minEvidence,
    minConfidence,
    school: school ? mapSchool(school) : undefined,
    tests: (tests.data ?? []).map(mapTestIntelligence),
    expectedAnswers: (answers.data ?? []).map(mapExpectedAnswer),
    correctionPatterns: (patterns.data ?? []).map(mapCorrectionPattern),
    markBuckets: (buckets.data ?? []).map(mapMarkBucket),
    commonMistakes: (mistakes.data ?? []).map(mapCommonMistake),
    privacyNote:
      "Only anonymized aggregate intelligence that passed the evidence and confidence thresholds is returned."
  };
}

async function submitStudentResult(payload: any, userId: string) {
  validateUploadPayload(payload);
  const extraction = extractResult(payload, 1);
  const school = await ensureRecord("schools", { name: payload.schoolName }, {
    name: payload.schoolName,
    city: payload.schoolCity,
    country_code: "LU"
  });
  const schoolYear = await ensureRecord(
    "school_years",
    { school_id: school.id, label: payload.schoolYear },
    { school_id: school.id, label: payload.schoolYear }
  );
  const course = await ensureRecord(
    "courses",
    { school_id: school.id, subject: payload.subject },
    {
      school_id: school.id,
      school_year_id: schoolYear.id,
      subject: payload.subject,
      level: payload.courseLevel,
      language: "multilingual"
    }
  );
  const teacher = await ensureRecord(
    "teacher_profiles",
    { school_id: school.id, display_name: payload.teacherName },
    { school_id: school.id, display_name: payload.teacherName }
  );
  const schoolTest = await ensureRecord(
    "school_tests",
    {
      school_id: school.id,
      course_id: course.id,
      teacher_profile_id: teacher.id,
      title: payload.testTitle
    },
    {
      school_id: school.id,
      school_year_id: schoolYear.id,
      course_id: course.id,
      teacher_profile_id: teacher.id,
      title: payload.testTitle,
      test_date: payload.testDate,
      source_confidence: extraction.confidenceScore
    }
  );

  for (const topic of cleanTopics(payload.topics)) {
    await ensureRecord(
      "test_topics",
      { school_test_id: schoolTest.id, topic },
      { school_test_id: schoolTest.id, topic, confidence_score: extraction.confidenceScore }
    );
  }

  const result = await insertSingle("student_test_results", {
    student_id: userId,
    school_test_id: schoolTest.id,
    subject: payload.subject,
    test_title: payload.testTitle,
    taken_on: payload.testDate,
    student_reflection: payload.studentReflection,
    extraction_status: "seed"
  });

  const paths = await uploadImages(userId, result.id, payload.images);
  for (const [index, image] of payload.images.entries()) {
    await insertSingle("result_uploads", {
      student_id: userId,
      result_id: result.id,
      storage_bucket: uploadBucket,
      storage_path: paths[index],
      page_number: index + 1,
      mime_type: image.type,
      file_size: image.size,
      sha256: await hashDataUrl(image.dataUrl),
      upload_status: "uploaded"
    });
  }

  const job = await insertSingle("agent_extraction_jobs", {
    student_id: userId,
    result_id: result.id,
    status: "completed",
    input_summary: {
      imageCount: payload.images.length,
      subject: payload.subject,
      topics: payload.topics
    },
    output: extraction.extracted,
    confidence_score: extraction.confidenceScore,
    completed_at: new Date().toISOString()
  });

  await insertSingle("extracted_marks", {
    student_id: userId,
    result_id: result.id,
    mark_obtained: extraction.extracted.marks?.obtained,
    mark_max: extraction.extracted.marks?.max,
    mark_percent: extraction.extracted.marks?.percent,
    confidence_score: extraction.confidenceScore
  });

  await insertSingle("student_private_feedback", {
    student_id: userId,
    result_id: result.id,
    feedback: extraction.privateFeedback,
    suggested_next_steps: extraction.extracted.commonMistakes
  });

  await insertSingle("agent_audit_events", {
    student_id: userId,
    result_id: result.id,
    agent_job_id: job.id,
    event_type: "result_extracted",
    payload: {
      confidenceScore: extraction.confidenceScore,
      uploadedPaths: paths
    }
  });

  const evidenceCount = await countEvidence(schoolTest.id);
  const status = statusForEvidence(extraction.confidenceScore, evidenceCount);
  const finalExtraction = {
    ...extraction,
    resultId: result.id,
    jobId: job.id,
    evidenceCount,
    status,
    sharedSummary:
      status === "shared"
        ? `Shared intelligence updated for ${payload.subject}: ${extraction.extracted.correctionStyle}`
        : `Stored privately. Needs ${Math.max(0, minEvidence - evidenceCount)} more independent upload(s) before teacher-specific guidance is shared.`
  };

  await writeSharedIntelligence({
    payload,
    extraction: finalExtraction,
    schoolId: school.id,
    schoolYearId: schoolYear.id,
    courseId: course.id,
    teacherId: teacher.id,
    schoolTestId: schoolTest.id,
    status,
    evidenceCount
  });

  await admin
    .from("student_test_results")
    .update({ extraction_status: status === "shared" ? "shared" : "needs_more_evidence" })
    .eq("id", result.id);

  return {
    provider: "supabase",
    uploadedAt: new Date().toISOString(),
    result: finalExtraction,
    intelligence: await getSchoolIntelligence(
      new URL(`https://local/?schoolId=${school.id}&subject=${encodeURIComponent(payload.subject)}`)
    )
  };
}

async function reportSchoolIntelligence(payload: any, userId: string) {
  const allowedTables = new Set([
    "test_intelligence",
    "teacher_correction_patterns",
    "common_mistakes",
    "expected_answers"
  ]);
  if (!allowedTables.has(payload.tableName) || !payload.recordId || !payload.details) {
    throw new Error("Invalid report payload.");
  }

  const report = await insertSingle("intelligence_reports", {
    student_id: userId,
    table_name: payload.tableName,
    record_id: payload.recordId,
    reason: payload.reason ?? "other",
    details: payload.details,
    status: "open"
  });

  return {
    accepted: true,
    reportId: report.id,
    nextStep: "Report saved for moderation. Shared intelligence can be corrected, merged, or suppressed."
  };
}

async function writeSharedIntelligence(context: any) {
  const { payload, extraction, status, evidenceCount } = context;
  const common = {
    evidence_count: evidenceCount,
    confidence_score: extraction.confidenceScore,
    status
  };

  await insertSingle("test_intelligence", {
    school_id: context.schoolId,
    school_year_id: context.schoolYearId,
    course_id: context.courseId,
    teacher_profile_id: context.teacherId,
    subject: payload.subject,
    test_title: payload.testTitle,
    topic_summary: extraction.extracted.topics.join(", "),
    expected_answer_pattern: extraction.extracted.expectedAnswers.slice(0, 4).join(" "),
    correction_style_summary: extraction.extracted.correctionStyle,
    common_mistake_summary: extraction.extracted.commonMistakes.slice(0, 3).join(" "),
    source_result_ids: [extraction.resultId],
    ...common
  });

  for (const [index, answer] of extraction.extracted.expectedAnswers.entries()) {
    await insertSingle("expected_answers", {
      school_test_id: context.schoolTestId,
      topic: extraction.extracted.topics[index % extraction.extracted.topics.length] ?? payload.subject,
      expected_answer: answer,
      ...common
    });
  }

  await insertSingle("teacher_correction_patterns", {
    school_id: context.schoolId,
    course_id: context.courseId,
    teacher_profile_id: context.teacherId,
    pattern: extraction.extracted.correctionStyle,
    guidance: `For ${payload.subject}, prepare exact vocabulary, worked examples, and a short justification.`,
    ...common
  });

  await insertSingle("mark_distribution_buckets", {
    school_test_id: context.schoolTestId,
    course_id: context.courseId,
    teacher_profile_id: context.teacherId,
    bucket_label: bucketForMark(extraction),
    count: 1,
    ...common
  });

  for (const [index, mistake] of extraction.extracted.commonMistakes.entries()) {
    await insertSingle("common_mistakes", {
      school_id: context.schoolId,
      course_id: context.courseId,
      teacher_profile_id: context.teacherId,
      topic: extraction.extracted.topics[index % extraction.extracted.topics.length] ?? payload.subject,
      mistake,
      recommended_fix: "Write one exact definition, one worked example, and one self-check question.",
      ...common
    });
  }
}

function extractResult(payload: any, evidenceCount: number) {
  const expectedAnswers = splitTextList(payload.expectedAnswers).slice(0, 8);
  const topics = cleanTopics(payload.topics);
  const confidenceScore = scoreConfidence(payload);
  const status = statusForEvidence(confidenceScore, evidenceCount);
  const marks =
    payload.markObtained !== undefined && payload.markMax
      ? {
          obtained: Number(payload.markObtained),
          max: Number(payload.markMax),
          percent: Math.round((Number(payload.markObtained) / Number(payload.markMax)) * 100)
        }
      : undefined;
  const correctionStyle = inferCorrectionStyle(payload);
  const commonMistakes = inferCommonMistakes(payload, topics);

  return {
    resultId: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
    status,
    confidenceScore,
    evidenceCount,
    extracted: {
      schoolYear: payload.schoolYear.trim(),
      subject: payload.subject.trim(),
      teacherName: payload.teacherName.trim(),
      testTitle: payload.testTitle.trim(),
      marks,
      topics,
      expectedAnswers:
        expectedAnswers.length > 0
          ? expectedAnswers
          : topics.map((topic) => `State the definition of ${topic} and apply it to one worked example.`),
      correctionStyle,
      commonMistakes
    },
    privateFeedback: buildPrivateFeedback(payload, marks, commonMistakes),
    sharedSummary: "Stored privately.",
    auditTrail: [
      "Edge Function received private upload",
      "Private result stored owner-only",
      "Confidence scored",
      status === "shared" ? "Aggregate intelligence passed publication threshold" : "Aggregate intelligence held back"
    ]
  };
}

function validateUploadPayload(payload: any) {
  const required = ["schoolName", "schoolYear", "subject", "teacherName", "testTitle"];
  for (const field of required) {
    if (typeof payload[field] !== "string" || payload[field].trim().length < 2) {
      throw new Error(`Missing ${field}.`);
    }
  }
  if (!Array.isArray(payload.topics) || payload.topics.length === 0) {
    throw new Error("Add at least one topic.");
  }
  if (!Array.isArray(payload.images) || payload.images.length === 0) {
    throw new Error("Add at least one corrected result photo.");
  }
}

function scoreConfidence(payload: any) {
  const score =
    0.22 +
    (payload.schoolName ? 0.08 : 0) +
    (payload.schoolYear ? 0.08 : 0) +
    (payload.teacherName ? 0.08 : 0) +
    (payload.subject ? 0.08 : 0) +
    (payload.testTitle ? 0.08 : 0) +
    (payload.topics?.length > 0 ? 0.12 : 0) +
    (payload.markObtained !== undefined && payload.markMax ? 0.1 : 0) +
    (payload.expectedAnswers ? 0.08 : 0) +
    (payload.correctionNotes ? 0.05 : 0) +
    Math.min(0.08, payload.images.length * 0.03);

  return Math.min(0.98, Number(score.toFixed(2)));
}

function statusForEvidence(confidenceScore: number, evidenceCount: number) {
  if (confidenceScore < minConfidence) {
    return "needs_more_evidence";
  }
  return evidenceCount >= minEvidence ? "shared" : "needs_more_evidence";
}

function inferCorrectionStyle(payload: any) {
  const notes = `${payload.correctionNotes ?? ""} ${payload.expectedAnswers ?? ""}`.toLowerCase();
  if (notes.includes("definition") || notes.includes("exact")) {
    return "Rewards exact definitions and precise vocabulary before examples.";
  }
  if (notes.includes("steps") || notes.includes("method") || notes.includes("worked")) {
    return "Rewards visible method steps and worked examples, not only final answers.";
  }
  if (notes.includes("justify") || notes.includes("explain")) {
    return "Rewards short justifications that explain why the answer is valid.";
  }
  return "Looks for definitions, one worked example, and clear reasoning around the main concept.";
}

function inferCommonMistakes(payload: any, topics: string[]) {
  const notes = payload.correctionNotes?.toLowerCase() ?? "";
  const mistakes = topics.slice(0, 3).map((topic) => `Missing a precise definition or worked example for ${topic}.`);
  if (notes.includes("units")) {
    mistakes.unshift("Forgetting units or labels when presenting the final answer.");
  }
  if (notes.includes("sign")) {
    mistakes.unshift("Sign errors in intermediate steps.");
  }
  return Array.from(new Set(mistakes)).slice(0, 4);
}

function buildPrivateFeedback(payload: any, marks: any, mistakes: string[]) {
  const markText = marks ? `You scored ${marks.obtained}/${marks.max} (${marks.percent}%). ` : "";
  return `${markText}Next time, prioritize ${cleanTopics(payload.topics).slice(0, 2).join(" and ")}. ${mistakes[0] ?? "Write one clear definition and one example per topic."}`;
}

function cleanTopics(topics: unknown) {
  if (!Array.isArray(topics)) {
    return ["Core definitions", "Worked examples"];
  }
  const cleaned = topics.map((topic) => String(topic).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["Core definitions", "Worked examples"];
}

function splitTextList(value?: string) {
  return (value ?? "")
    .split(/\n|;|•|-/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 2);
}

async function ensureRecord(table: string, match: Record<string, unknown>, insert: Record<string, unknown>) {
  const existing = await selectMaybeSingle(table, match);
  if (existing) {
    return existing;
  }

  return insertSingle(table, insert);
}

async function selectMaybeSingle(table: string, match: Record<string, unknown>) {
  let query = admin.from(table).select("*").limit(1);
  for (const [key, value] of Object.entries(match)) {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value);
    }
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function insertSingle(table: string, insert: Record<string, unknown>) {
  const { data, error } = await admin.from(table).insert(insert).select("*").single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function countEvidence(schoolTestId: string) {
  const { count, error } = await admin
    .from("student_test_results")
    .select("id", { count: "exact", head: true })
    .eq("school_test_id", schoolTestId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 1;
}

async function uploadImages(userId: string, resultId: string, images: any[]) {
  const paths: string[] = [];
  for (const [index, image] of images.entries()) {
    const extension = extensionForImage(image);
    const path = `${userId}/${resultId}/page-${index + 1}.${extension}`;
    const { error } = await admin.storage.from(uploadBucket).upload(path, dataUrlToBytes(image.dataUrl), {
      contentType: image.type,
      upsert: true
    });

    if (error) {
      throw new Error(error.message);
    }

    paths.push(path);
  }
  return paths;
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hashDataUrl(dataUrl: string) {
  const hash = await crypto.subtle.digest("SHA-256", dataUrlToBytes(dataUrl));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function extensionForImage(image: any) {
  if (String(image.type).includes("png")) {
    return "png";
  }
  if (String(image.type).includes("webp")) {
    return "webp";
  }
  return "jpg";
}

function bucketForMark(extraction: any) {
  const percent = extraction.extracted.marks?.percent;
  if (percent === undefined) {
    return "marks-not-shared";
  }
  if (percent >= 80) {
    return "80-100";
  }
  if (percent >= 60) {
    return "60-79";
  }
  return "below-60";
}

function mapSchool(row: any) {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    city: row.city ?? undefined
  };
}

function mapTestIntelligence(row: any) {
  return {
    id: row.id,
    schoolId: row.school_id,
    schoolYearId: row.school_year_id ?? undefined,
    courseId: row.course_id ?? undefined,
    teacherProfileId: row.teacher_profile_id ?? undefined,
    subject: row.subject,
    testTitle: row.test_title,
    topicSummary: row.topic_summary,
    expectedAnswerPattern: row.expected_answer_pattern,
    correctionStyleSummary: row.correction_style_summary,
    commonMistakeSummary: row.common_mistake_summary,
    evidenceCount: row.evidence_count,
    confidenceScore: Number(row.confidence_score),
    status: row.status,
    updatedAt: row.updated_at
  };
}

function mapExpectedAnswer(row: any) {
  return {
    id: row.id,
    testId: row.school_test_id ?? undefined,
    topic: row.topic,
    expectedAnswer: row.expected_answer,
    evidenceCount: row.evidence_count,
    confidenceScore: Number(row.confidence_score),
    status: row.status
  };
}

function mapCorrectionPattern(row: any) {
  return {
    id: row.id,
    schoolId: row.school_id,
    courseId: row.course_id ?? undefined,
    teacherProfileId: row.teacher_profile_id ?? undefined,
    pattern: row.pattern,
    guidance: row.guidance,
    evidenceCount: row.evidence_count,
    confidenceScore: Number(row.confidence_score),
    status: row.status
  };
}

function mapMarkBucket(row: any) {
  return {
    id: row.id,
    courseId: row.course_id ?? undefined,
    teacherProfileId: row.teacher_profile_id ?? undefined,
    bucketLabel: row.bucket_label,
    count: row.count,
    evidenceCount: row.evidence_count,
    confidenceScore: Number(row.confidence_score),
    status: row.status
  };
}

function mapCommonMistake(row: any) {
  return {
    id: row.id,
    schoolId: row.school_id,
    courseId: row.course_id ?? undefined,
    teacherProfileId: row.teacher_profile_id ?? undefined,
    topic: row.topic,
    mistake: row.mistake,
    recommendedFix: row.recommended_fix,
    evidenceCount: row.evidence_count,
    confidenceScore: Number(row.confidence_score),
    status: row.status
  };
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: corsHeaders
  });
}
