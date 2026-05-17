import crypto from "node:crypto";
import type {
  CommonMistakeRecord,
  ExpectedAnswerRecord,
  ExtractedResultInsight,
  IntelligenceReportRequest,
  IntelligenceReportResponse,
  IntelligenceStatus,
  MarkDistributionBucket,
  ResultUploadImage,
  ResultUploadRequest,
  ResultUploadResponse,
  SchoolIntelligenceQuery,
  SchoolIntelligenceResponse,
  SchoolProfile,
  TeacherCorrectionPattern,
  TestIntelligenceRecord
} from "../shared/types.js";
import { getSupabaseAdminClient, getSchoolIntelligenceProviderName } from "./supabase.js";

const MIN_CONFIDENCE = Number(process.env.SCHOOL_INTELLIGENCE_MIN_CONFIDENCE ?? "0.74");
const MIN_EVIDENCE = Number(process.env.SCHOOL_INTELLIGENCE_MIN_EVIDENCE ?? "3");
const UPLOAD_BUCKET =
  process.env.RESULT_UPLOAD_BUCKET ?? process.env.SUPABASE_RESULT_UPLOAD_BUCKET ?? "test-result-uploads";

interface DemoStore {
  schools: SchoolProfile[];
  tests: TestIntelligenceRecord[];
  expectedAnswers: ExpectedAnswerRecord[];
  correctionPatterns: TeacherCorrectionPattern[];
  markBuckets: MarkDistributionBucket[];
  commonMistakes: CommonMistakeRecord[];
  reports: IntelligenceReportResponse[];
}

const demoStore: DemoStore = {
  schools: [],
  tests: [],
  expectedAnswers: [],
  correctionPatterns: [],
  markBuckets: [],
  commonMistakes: [],
  reports: []
};

export async function getSchoolIntelligence(
  query: SchoolIntelligenceQuery
): Promise<SchoolIntelligenceResponse> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return getDemoIntelligence(query, "demo-memory");
  }

  const school = query.schoolId
    ? await selectMaybeSingle(supabase, "schools", { id: query.schoolId })
    : query.schoolName
      ? await selectMaybeSingle(supabase, "schools", { name: query.schoolName })
      : null;

  const schoolId = school?.id ?? query.schoolId;
  const testQuery = supabase
    .from("test_intelligence")
    .select("*")
    .eq("status", "shared")
    .gte("evidence_count", MIN_EVIDENCE)
    .gte("confidence_score", MIN_CONFIDENCE)
    .limit(20);

  if (schoolId) {
    testQuery.eq("school_id", schoolId);
  }
  if (query.subject) {
    testQuery.ilike("subject", query.subject);
  }

  const { data: tests, error: testsError } = await testQuery;
  if (testsError) {
    throw new Error(testsError.message);
  }

  const teacherId = query.teacherProfileId;
  const sharedPatternQuery = supabase
    .from("teacher_correction_patterns")
    .select("*")
    .eq("status", "shared")
    .gte("evidence_count", MIN_EVIDENCE)
    .gte("confidence_score", MIN_CONFIDENCE)
    .limit(20);

  if (schoolId) {
    sharedPatternQuery.eq("school_id", schoolId);
  }
  if (teacherId) {
    sharedPatternQuery.eq("teacher_profile_id", teacherId);
  }

  const [patternsResult, mistakesResult, answersResult, bucketsResult] = await Promise.all([
    sharedPatternQuery,
    supabase
      .from("common_mistakes")
      .select("*")
      .eq("status", "shared")
      .gte("evidence_count", MIN_EVIDENCE)
      .gte("confidence_score", MIN_CONFIDENCE)
      .limit(30),
    supabase
      .from("expected_answers")
      .select("*")
      .eq("status", "shared")
      .gte("evidence_count", MIN_EVIDENCE)
      .gte("confidence_score", MIN_CONFIDENCE)
      .limit(30),
    supabase
      .from("mark_distribution_buckets")
      .select("*")
      .eq("status", "shared")
      .gte("evidence_count", MIN_EVIDENCE)
      .gte("confidence_score", MIN_CONFIDENCE)
      .limit(20)
  ]);

  for (const result of [patternsResult, mistakesResult, answersResult, bucketsResult]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return {
    provider: "supabase",
    minEvidence: MIN_EVIDENCE,
    minConfidence: MIN_CONFIDENCE,
    school: school ? mapSchool(school) : undefined,
    tests: (tests ?? []).map(mapTestIntelligence),
    expectedAnswers: (answersResult.data ?? []).map(mapExpectedAnswer),
    correctionPatterns: (patternsResult.data ?? []).map(mapCorrectionPattern),
    markBuckets: (bucketsResult.data ?? []).map(mapMarkBucket),
    commonMistakes: (mistakesResult.data ?? []).map(mapCommonMistake),
    privacyNote:
      "Only anonymized aggregate intelligence that passed the evidence and confidence thresholds is returned."
  };
}

export async function submitStudentResult(
  payload: ResultUploadRequest,
  authorizationHeader?: string
): Promise<ResultUploadResponse> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return submitDemoResult(payload, "demo-memory");
  }

  const userId = await resolveAuthenticatedUserId(supabase, authorizationHeader);
  if (!userId) {
    throw new Error("Sign in before syncing private corrected-test uploads to Supabase.");
  }

  const extraction = extractResult(payload, 1);
  const school = await ensureRecord(supabase, "schools", { name: payload.schoolName }, {
    name: payload.schoolName,
    city: payload.schoolCity,
    country_code: "LU"
  });
  const schoolYear = await ensureRecord(
    supabase,
    "school_years",
    { school_id: school.id, label: payload.schoolYear },
    { school_id: school.id, label: payload.schoolYear }
  );
  const course = await ensureRecord(
    supabase,
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
    supabase,
    "teacher_profiles",
    { school_id: school.id, display_name: payload.teacherName },
    { school_id: school.id, display_name: payload.teacherName }
  );
  const schoolTest = await ensureRecord(
    supabase,
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

  for (const topic of payload.topics) {
    await ensureRecord(
      supabase,
      "test_topics",
      { school_test_id: schoolTest.id, topic },
      { school_test_id: schoolTest.id, topic, confidence_score: extraction.confidenceScore }
    );
  }

  const result = await insertSingle(supabase, "student_test_results", {
    student_id: userId,
    school_test_id: schoolTest.id,
    subject: payload.subject,
    test_title: payload.testTitle,
    taken_on: payload.testDate,
    student_reflection: payload.studentReflection,
    extraction_status: "queued"
  });

  const uploadedPaths = await uploadResultImages(supabase, userId, result.id, payload.images);
  for (const [index, image] of payload.images.entries()) {
    await insertSingle(supabase, "result_uploads", {
      student_id: userId,
      result_id: result.id,
      storage_bucket: UPLOAD_BUCKET,
      storage_path: uploadedPaths[index],
      page_number: index + 1,
      mime_type: image.type,
      file_size: image.size,
      sha256: hashDataUrl(image.dataUrl),
      upload_status: "uploaded"
    });
  }

  const job = await insertSingle(supabase, "agent_extraction_jobs", {
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

  await insertSingle(supabase, "extracted_marks", {
    student_id: userId,
    result_id: result.id,
    mark_obtained: extraction.extracted.marks?.obtained,
    mark_max: extraction.extracted.marks?.max,
    mark_percent: extraction.extracted.marks?.percent,
    confidence_score: extraction.confidenceScore
  });

  await insertSingle(supabase, "student_private_feedback", {
    student_id: userId,
    result_id: result.id,
    feedback: extraction.privateFeedback,
    suggested_next_steps: extraction.extracted.commonMistakes
  });

  await insertSingle(supabase, "agent_audit_events", {
    student_id: userId,
    result_id: result.id,
    agent_job_id: job.id,
    event_type: "result_extracted",
    payload: {
      confidenceScore: extraction.confidenceScore,
      status: extraction.status,
      uploadedPaths
    }
  });

  const evidenceCount = await countEvidence(supabase, schoolTest.id);
  const status = statusForEvidence(extraction.confidenceScore, evidenceCount);
  await writeSharedIntelligence(supabase, {
    payload,
    extraction: { ...extraction, resultId: result.id, jobId: job.id, evidenceCount, status },
    schoolId: school.id,
    schoolYearId: schoolYear.id,
    courseId: course.id,
    teacherId: teacher.id,
    schoolTestId: schoolTest.id,
    status,
    evidenceCount
  });

  await supabase
    .from("student_test_results")
    .update({ extraction_status: status === "shared" ? "shared" : "needs_more_evidence" })
    .eq("id", result.id);

  const intelligence = await getSchoolIntelligence({
    schoolId: school.id,
    subject: payload.subject,
    teacherProfileId: teacher.id
  });

  return {
    provider: "supabase",
    uploadedAt: new Date().toISOString(),
    result: {
      ...extraction,
      resultId: result.id,
      jobId: job.id,
      evidenceCount,
      status
    },
    intelligence
  };
}

export async function reportSchoolIntelligence(
  payload: IntelligenceReportRequest,
  authorizationHeader?: string
): Promise<IntelligenceReportResponse> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    const response = {
      accepted: true as const,
      reportId: createId("report"),
      nextStep: "Saved in demo mode. In production this goes to the moderation queue."
    };
    demoStore.reports.push(response);
    return response;
  }

  const userId = await resolveAuthenticatedUserId(supabase, authorizationHeader);
  if (!userId) {
    throw new Error("Sign in before reporting shared school intelligence.");
  }

  const report = await insertSingle(supabase, "intelligence_reports", {
    student_id: userId,
    table_name: payload.tableName,
    record_id: payload.recordId,
    reason: payload.reason,
    details: payload.details,
    status: "open"
  });

  return {
    accepted: true,
    reportId: report.id,
    nextStep: "Report saved for moderation. Shared intelligence can be corrected, merged, or suppressed."
  };
}

export function getSchoolIntelligenceRuntime() {
  return {
    provider: getSchoolIntelligenceProviderName(),
    minEvidence: MIN_EVIDENCE,
    minConfidence: MIN_CONFIDENCE,
    uploadBucket: UPLOAD_BUCKET
  };
}

function submitDemoResult(payload: ResultUploadRequest, provider: "demo-memory" | "demo-local"): ResultUploadResponse {
  const groupKey = normalizeKey(
    [payload.schoolName, payload.schoolYear, payload.subject, payload.teacherName, payload.testTitle].join("-")
  );
  const evidenceCount =
    demoStore.tests.filter((record) => normalizeKey(record.testTitle) === normalizeKey(payload.testTitle)).length + 1;
  const extracted = extractResult(payload, evidenceCount);
  const school = ensureDemoSchool(payload);
  const status = statusForEvidence(extracted.confidenceScore, evidenceCount);
  const testRecord = buildTestRecord(payload, extracted, school.id, status, evidenceCount, groupKey);
  const expectedAnswers = buildExpectedAnswers(payload, extracted, status, evidenceCount, groupKey);
  const correctionPattern = buildCorrectionPattern(payload, extracted, school.id, status, evidenceCount, groupKey);
  const markBucket = buildMarkBucket(payload, extracted, status, evidenceCount, groupKey);
  const mistakes = buildCommonMistakes(payload, extracted, school.id, status, evidenceCount, groupKey);

  demoStore.tests.push(testRecord);
  demoStore.expectedAnswers.push(...expectedAnswers);
  demoStore.correctionPatterns.push(correctionPattern);
  demoStore.markBuckets.push(markBucket);
  demoStore.commonMistakes.push(...mistakes);

  return {
    provider,
    uploadedAt: new Date().toISOString(),
    result: { ...extracted, status, evidenceCount },
    intelligence: getDemoIntelligence({ schoolName: payload.schoolName, subject: payload.subject }, provider)
  };
}

function getDemoIntelligence(
  query: SchoolIntelligenceQuery,
  provider: "demo-memory" | "demo-local"
): SchoolIntelligenceResponse {
  const normalizedSchool = normalizeKey(query.schoolName ?? "");
  const normalizedSubject = normalizeKey(query.subject ?? "");
  const visible = (record: { status: IntelligenceStatus; evidenceCount: number; confidenceScore: number }) =>
    record.status === "shared" && record.evidenceCount >= MIN_EVIDENCE && record.confidenceScore >= MIN_CONFIDENCE;

  const tests = demoStore.tests.filter((record) => {
    const schoolMatches = normalizedSchool ? record.schoolId.includes(normalizedSchool) : true;
    const subjectMatches = normalizedSubject ? normalizeKey(record.subject).includes(normalizedSubject) : true;
    return visible(record) && schoolMatches && subjectMatches;
  });

  return {
    provider,
    minEvidence: MIN_EVIDENCE,
    minConfidence: MIN_CONFIDENCE,
    school: normalizedSchool
      ? demoStore.schools.find((school) => normalizeKey(school.name) === normalizedSchool)
      : demoStore.schools[0],
    tests,
    expectedAnswers: demoStore.expectedAnswers.filter(visible),
    correctionPatterns: demoStore.correctionPatterns.filter(visible),
    markBuckets: demoStore.markBuckets.filter(visible),
    commonMistakes: demoStore.commonMistakes.filter(visible),
    privacyNote:
      "Demo mode follows the same visibility rule: shared guidance appears only after enough independent evidence."
  };
}

function extractResult(payload: ResultUploadRequest, evidenceCount: number): ExtractedResultInsight {
  const expectedAnswers = splitTextList(payload.expectedAnswers).slice(0, 8);
  const topics = cleanTopics(payload.topics);
  const confidenceScore = scoreConfidence(payload);
  const status = statusForEvidence(confidenceScore, evidenceCount);
  const marks =
    payload.markObtained !== undefined && payload.markMax
      ? {
          obtained: payload.markObtained,
          max: payload.markMax,
          percent: Math.round((payload.markObtained / payload.markMax) * 100)
        }
      : undefined;
  const correctionStyle = inferCorrectionStyle(payload);
  const commonMistakes = inferCommonMistakes(payload, topics);
  const title = payload.testTitle.trim();

  return {
    resultId: createId("result"),
    jobId: createId("job"),
    status,
    confidenceScore,
    evidenceCount,
    extracted: {
      schoolYear: payload.schoolYear.trim(),
      subject: payload.subject.trim(),
      teacherName: payload.teacherName.trim(),
      testTitle: title,
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
    sharedSummary:
      status === "shared"
        ? `Shared intelligence updated for ${payload.subject}: ${correctionStyle}`
        : `Stored privately. Needs ${Math.max(0, MIN_EVIDENCE - evidenceCount)} more independent upload(s) before teacher-specific guidance is shared.`,
    auditTrail: [
      "OCR/extraction job created",
      "Private result stored owner-only",
      "Confidence scored",
      status === "shared" ? "Aggregate intelligence passed publication threshold" : "Aggregate intelligence held back"
    ]
  };
}

function scoreConfidence(payload: ResultUploadRequest) {
  const score =
    0.22 +
    (payload.schoolName ? 0.08 : 0) +
    (payload.schoolYear ? 0.08 : 0) +
    (payload.teacherName ? 0.08 : 0) +
    (payload.subject ? 0.08 : 0) +
    (payload.testTitle ? 0.08 : 0) +
    (payload.topics.length > 0 ? 0.12 : 0) +
    (payload.markObtained !== undefined && payload.markMax ? 0.1 : 0) +
    (payload.expectedAnswers ? 0.08 : 0) +
    (payload.correctionNotes ? 0.05 : 0) +
    Math.min(0.08, payload.images.length * 0.03);

  return Math.min(0.98, Number(score.toFixed(2)));
}

function statusForEvidence(confidenceScore: number, evidenceCount: number): IntelligenceStatus {
  if (confidenceScore < MIN_CONFIDENCE) {
    return "needs_more_evidence";
  }
  return evidenceCount >= MIN_EVIDENCE ? "shared" : "needs_more_evidence";
}

function inferCorrectionStyle(payload: ResultUploadRequest) {
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

function inferCommonMistakes(payload: ResultUploadRequest, topics: string[]) {
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

function buildPrivateFeedback(
  payload: ResultUploadRequest,
  marks: ExtractedResultInsight["extracted"]["marks"],
  mistakes: string[]
) {
  const markText = marks ? `You scored ${marks.obtained}/${marks.max} (${marks.percent}%). ` : "";
  return `${markText}Next time, prioritize ${cleanTopics(payload.topics).slice(0, 2).join(" and ")}. ${mistakes[0] ?? "Write one clear definition and one example per topic."}`;
}

function splitTextList(value?: string) {
  return (value ?? "")
    .split(/\n|;|•|-/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 2);
}

function cleanTopics(topics: string[]) {
  const cleaned = topics.map((topic) => topic.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["Core definitions", "Worked examples"];
}

function buildTestRecord(
  payload: ResultUploadRequest,
  extraction: ExtractedResultInsight,
  schoolId: string,
  status: IntelligenceStatus,
  evidenceCount: number,
  groupKey: string
): TestIntelligenceRecord {
  return {
    id: `intel-${groupKey}-${evidenceCount}`,
    schoolId,
    subject: payload.subject,
    testTitle: payload.testTitle,
    topicSummary: extraction.extracted.topics.join(", "),
    expectedAnswerPattern: extraction.extracted.expectedAnswers.slice(0, 3).join(" "),
    correctionStyleSummary: extraction.extracted.correctionStyle,
    commonMistakeSummary: extraction.extracted.commonMistakes.slice(0, 2).join(" "),
    evidenceCount,
    confidenceScore: extraction.confidenceScore,
    status,
    updatedAt: new Date().toISOString()
  };
}

function buildExpectedAnswers(
  payload: ResultUploadRequest,
  extraction: ExtractedResultInsight,
  status: IntelligenceStatus,
  evidenceCount: number,
  groupKey: string
): ExpectedAnswerRecord[] {
  return extraction.extracted.expectedAnswers.map((answer, index) => ({
    id: `answer-${groupKey}-${index}-${evidenceCount}`,
    topic: extraction.extracted.topics[index % extraction.extracted.topics.length] ?? payload.subject,
    expectedAnswer: answer,
    evidenceCount,
    confidenceScore: extraction.confidenceScore,
    status
  }));
}

function buildCorrectionPattern(
  payload: ResultUploadRequest,
  extraction: ExtractedResultInsight,
  schoolId: string,
  status: IntelligenceStatus,
  evidenceCount: number,
  groupKey: string
): TeacherCorrectionPattern {
  return {
    id: `pattern-${groupKey}-${evidenceCount}`,
    schoolId,
    pattern: extraction.extracted.correctionStyle,
    guidance: `For ${payload.subject}, prepare an exact definition, a worked example, and a short justification.`,
    evidenceCount,
    confidenceScore: extraction.confidenceScore,
    status
  };
}

function buildMarkBucket(
  payload: ResultUploadRequest,
  extraction: ExtractedResultInsight,
  status: IntelligenceStatus,
  evidenceCount: number,
  groupKey: string
): MarkDistributionBucket {
  const percent = extraction.extracted.marks?.percent;
  const bucketLabel =
    percent === undefined ? "marks-not-shared" : percent >= 80 ? "80-100" : percent >= 60 ? "60-79" : "below-60";

  return {
    id: `bucket-${groupKey}-${bucketLabel}`,
    bucketLabel,
    count: 1,
    evidenceCount,
    confidenceScore: extraction.confidenceScore,
    status
  };
}

function buildCommonMistakes(
  payload: ResultUploadRequest,
  extraction: ExtractedResultInsight,
  schoolId: string,
  status: IntelligenceStatus,
  evidenceCount: number,
  groupKey: string
): CommonMistakeRecord[] {
  return extraction.extracted.commonMistakes.map((mistake, index) => ({
    id: `mistake-${groupKey}-${index}-${evidenceCount}`,
    schoolId,
    topic: extraction.extracted.topics[index % extraction.extracted.topics.length] ?? payload.subject,
    mistake,
    recommendedFix: "Prepare one exact definition, one worked example, and one self-check question.",
    evidenceCount,
    confidenceScore: extraction.confidenceScore,
    status
  }));
}

function ensureDemoSchool(payload: ResultUploadRequest) {
  const id = normalizeKey(`${payload.schoolName}-${payload.schoolCity ?? "luxembourg"}`);
  const existing = demoStore.schools.find((school) => school.id === id);
  if (existing) {
    return existing;
  }

  const school: SchoolProfile = {
    id,
    name: payload.schoolName,
    city: payload.schoolCity,
    countryCode: "LU"
  };
  demoStore.schools.push(school);
  return school;
}

async function resolveAuthenticatedUserId(supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, header?: string) {
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

async function ensureRecord(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  table: string,
  match: Record<string, unknown>,
  insert: Record<string, unknown>
) {
  const existing = await selectMaybeSingle(supabase, table, match);
  if (existing) {
    return existing;
  }

  return insertSingle(supabase, table, insert);
}

async function selectMaybeSingle(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  table: string,
  match: Record<string, unknown>
) {
  let query = supabase.from(table).select("*").limit(1);
  for (const [key, value] of Object.entries(match)) {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value);
    }
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data as Record<string, any> | null;
}

async function insertSingle(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  table: string,
  insert: Record<string, unknown>
) {
  const { data, error } = await supabase.from(table).insert(insert).select("*").single();
  if (error) {
    throw new Error(error.message);
  }
  return data as Record<string, any>;
}

async function uploadResultImages(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  userId: string,
  resultId: string,
  images: ResultUploadImage[]
) {
  const paths: string[] = [];
  for (const [index, image] of images.entries()) {
    const extension = extensionForImage(image);
    const path = `${userId}/${resultId}/page-${index + 1}.${extension}`;
    const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, dataUrlToBuffer(image.dataUrl), {
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

async function countEvidence(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  schoolTestId: string
) {
  const { count, error } = await supabase
    .from("student_test_results")
    .select("id", { count: "exact", head: true })
    .eq("school_test_id", schoolTestId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 1;
}

async function writeSharedIntelligence(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  context: {
    payload: ResultUploadRequest;
    extraction: ExtractedResultInsight;
    schoolId: string;
    schoolYearId: string;
    courseId: string;
    teacherId: string;
    schoolTestId: string;
    status: IntelligenceStatus;
    evidenceCount: number;
  }
) {
  const { payload, extraction, status, evidenceCount } = context;
  const common = {
    evidence_count: evidenceCount,
    confidence_score: extraction.confidenceScore,
    status
  };

  await insertSingle(supabase, "test_intelligence", {
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
    await insertSingle(supabase, "expected_answers", {
      school_test_id: context.schoolTestId,
      topic: extraction.extracted.topics[index % extraction.extracted.topics.length] ?? payload.subject,
      expected_answer: answer,
      ...common
    });
  }

  await insertSingle(supabase, "teacher_correction_patterns", {
    school_id: context.schoolId,
    course_id: context.courseId,
    teacher_profile_id: context.teacherId,
    pattern: extraction.extracted.correctionStyle,
    guidance: `For ${payload.subject}, prepare exact vocabulary, worked examples, and a short justification.`,
    ...common
  });

  await insertSingle(supabase, "mark_distribution_buckets", {
    school_test_id: context.schoolTestId,
    course_id: context.courseId,
    teacher_profile_id: context.teacherId,
    bucket_label: bucketForMark(extraction),
    count: 1,
    ...common
  });

  for (const [index, mistake] of extraction.extracted.commonMistakes.entries()) {
    await insertSingle(supabase, "common_mistakes", {
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

function bucketForMark(extraction: ExtractedResultInsight) {
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

function mapSchool(row: Record<string, any>): SchoolProfile {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    city: row.city ?? undefined
  };
}

function mapTestIntelligence(row: Record<string, any>): TestIntelligenceRecord {
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

function mapExpectedAnswer(row: Record<string, any>): ExpectedAnswerRecord {
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

function mapCorrectionPattern(row: Record<string, any>): TeacherCorrectionPattern {
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

function mapMarkBucket(row: Record<string, any>): MarkDistributionBucket {
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

function mapCommonMistake(row: Record<string, any>): CommonMistakeRecord {
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

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

function hashDataUrl(dataUrl: string) {
  return crypto.createHash("sha256").update(dataUrlToBuffer(dataUrl)).digest("hex");
}

function extensionForImage(image: ResultUploadImage) {
  if (image.type.includes("png")) {
    return "png";
  }
  if (image.type.includes("webp")) {
    return "webp";
  }
  return "jpg";
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
