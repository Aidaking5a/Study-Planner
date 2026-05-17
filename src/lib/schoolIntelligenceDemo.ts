import type {
  CommonMistakeRecord,
  ExpectedAnswerRecord,
  ExtractedResultInsight,
  IntelligenceReportRequest,
  IntelligenceReportResponse,
  IntelligenceStatus,
  MarkDistributionBucket,
  ResultUploadRequest,
  ResultUploadResponse,
  SchoolIntelligenceQuery,
  SchoolIntelligenceResponse,
  SchoolProfile,
  TeacherCorrectionPattern,
  TestIntelligenceRecord
} from "../types";

const SCHOOL_INTELLIGENCE_KEY = "kloer.schoolIntelligence.v1";
const MIN_CONFIDENCE = 0.74;
const MIN_EVIDENCE = 3;

interface LocalSchoolStore {
  schools: SchoolProfile[];
  tests: TestIntelligenceRecord[];
  expectedAnswers: ExpectedAnswerRecord[];
  correctionPatterns: TeacherCorrectionPattern[];
  markBuckets: MarkDistributionBucket[];
  commonMistakes: CommonMistakeRecord[];
  reports: IntelligenceReportResponse[];
}

const emptyStore: LocalSchoolStore = {
  schools: [],
  tests: [],
  expectedAnswers: [],
  correctionPatterns: [],
  markBuckets: [],
  commonMistakes: [],
  reports: []
};

export function getLocalSchoolIntelligence(query: SchoolIntelligenceQuery = {}): SchoolIntelligenceResponse {
  const store = readStore();
  const normalizedSchool = normalizeKey(query.schoolName ?? "");
  const normalizedSubject = normalizeKey(query.subject ?? "");
  const visible = (record: { status: IntelligenceStatus; evidenceCount: number; confidenceScore: number }) =>
    record.status === "shared" && record.evidenceCount >= MIN_EVIDENCE && record.confidenceScore >= MIN_CONFIDENCE;
  const tests = store.tests.filter((record) => {
    const schoolMatches = normalizedSchool ? record.schoolId.includes(normalizedSchool) : true;
    const subjectMatches = normalizedSubject ? normalizeKey(record.subject).includes(normalizedSubject) : true;
    return visible(record) && schoolMatches && subjectMatches;
  });

  return {
    provider: "demo-local",
    minEvidence: MIN_EVIDENCE,
    minConfidence: MIN_CONFIDENCE,
    school: normalizedSchool
      ? store.schools.find((school) => normalizeKey(school.name) === normalizedSchool)
      : store.schools[0],
    tests,
    expectedAnswers: store.expectedAnswers.filter(visible),
    correctionPatterns: store.correctionPatterns.filter(visible),
    markBuckets: store.markBuckets.filter(visible),
    commonMistakes: store.commonMistakes.filter(visible),
    privacyNote:
      "Local demo mode uses the same threshold rule: teacher-specific guidance is hidden until enough evidence exists."
  };
}

export function uploadLocalTestResult(payload: ResultUploadRequest): ResultUploadResponse {
  const store = readStore();
  const school = ensureSchool(store, payload);
  const groupKey = normalizeKey(
    [payload.schoolName, payload.schoolYear, payload.subject, payload.teacherName, payload.testTitle].join("-")
  );
  const evidenceCount =
    store.tests.filter((record) => record.id.startsWith(`intel-${groupKey}`)).length + 1;
  const extracted = extractResult(payload, evidenceCount);
  const status = statusForEvidence(extracted.confidenceScore, evidenceCount);
  const testRecord = buildTestRecord(payload, extracted, school.id, status, evidenceCount, groupKey);

  store.tests.push(testRecord);
  store.expectedAnswers.push(...buildExpectedAnswers(payload, extracted, status, evidenceCount, groupKey));
  store.correctionPatterns.push(buildCorrectionPattern(payload, extracted, school.id, status, evidenceCount, groupKey));
  store.markBuckets.push(buildMarkBucket(extracted, status, evidenceCount, groupKey));
  store.commonMistakes.push(...buildCommonMistakes(payload, extracted, school.id, status, evidenceCount, groupKey));
  writeStore(store);

  return {
    provider: "demo-local",
    uploadedAt: new Date().toISOString(),
    result: { ...extracted, status, evidenceCount },
    intelligence: getLocalSchoolIntelligence({ schoolName: payload.schoolName, subject: payload.subject })
  };
}

export function reportLocalSchoolIntelligence(
  _payload: IntelligenceReportRequest
): IntelligenceReportResponse {
  const store = readStore();
  const response = {
    accepted: true as const,
    reportId: createId("report"),
    nextStep: "Saved locally. In production this is reviewed by moderation before shared guidance changes."
  };
  store.reports.push(response);
  writeStore(store);
  return response;
}

function extractResult(payload: ResultUploadRequest, evidenceCount: number): ExtractedResultInsight {
  const topics = payload.topics.map((topic) => topic.trim()).filter(Boolean);
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
  const expectedAnswers = splitTextList(payload.expectedAnswers);
  const correctionStyle = inferCorrectionStyle(payload);
  const commonMistakes = inferCommonMistakes(payload, topics);

  return {
    resultId: createId("result"),
    jobId: createId("job"),
    status,
    confidenceScore,
    evidenceCount,
    extracted: {
      schoolYear: payload.schoolYear,
      subject: payload.subject,
      teacherName: payload.teacherName,
      testTitle: payload.testTitle,
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
        ? `Shared guidance is now visible for ${payload.subject}.`
        : `Stored privately. Needs ${Math.max(0, MIN_EVIDENCE - evidenceCount)} more independent upload(s) before shared teacher-specific guidance appears.`,
    auditTrail: [
      "Private upload processed locally",
      "Extraction confidence scored",
      status === "shared" ? "Shared threshold reached" : "Shared threshold not reached"
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
  return `${markText}Next time, prioritize ${payload.topics.slice(0, 2).join(" and ")}. ${mistakes[0] ?? "Write one clear definition and one example per topic."}`;
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
  extraction: ExtractedResultInsight,
  status: IntelligenceStatus,
  evidenceCount: number,
  groupKey: string
): MarkDistributionBucket {
  const percent = extraction.extracted.marks?.percent;
  const bucketLabel =
    percent === undefined ? "marks-not-shared" : percent >= 80 ? "80-100" : percent >= 60 ? "60-79" : "below-60";

  return {
    id: `bucket-${groupKey}-${bucketLabel}-${evidenceCount}`,
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

function ensureSchool(store: LocalSchoolStore, payload: ResultUploadRequest) {
  const id = normalizeKey(`${payload.schoolName}-${payload.schoolCity ?? "luxembourg"}`);
  const existing = store.schools.find((school) => school.id === id);
  if (existing) {
    return existing;
  }

  const school: SchoolProfile = {
    id,
    name: payload.schoolName,
    city: payload.schoolCity,
    countryCode: "LU"
  };
  store.schools.push(school);
  return school;
}

function splitTextList(value?: string) {
  return (value ?? "")
    .split(/\n|;|•|-/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 2);
}

function readStore(): LocalSchoolStore {
  if (typeof window === "undefined") {
    return emptyStore;
  }

  try {
    const raw = window.localStorage.getItem(SCHOOL_INTELLIGENCE_KEY);
    return raw ? { ...emptyStore, ...(JSON.parse(raw) as LocalSchoolStore) } : { ...emptyStore };
  } catch {
    return { ...emptyStore };
  }
}

function writeStore(store: LocalSchoolStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SCHOOL_INTELLIGENCE_KEY, JSON.stringify(store));
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
