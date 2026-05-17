import {
  BrainCircuit,
  CalendarDays,
  Camera,
  CheckCircle2,
  CheckSquare2,
  ChevronRight,
  ClipboardList,
  Code2,
  Database,
  Download,
  FileText,
  FlaskConical,
  Globe2,
  Home,
  Languages,
  Library,
  LineChart,
  LockKeyhole,
  ListChecks,
  Moon,
  NotebookText,
  Plus,
  RefreshCw,
  Rocket,
  School,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  createPowerPoint,
  createStudySession,
  getAgents,
  getSchoolIntelligence,
  isSchoolIntelligenceSupabaseEnabled,
  joinWaitlist,
  reportSchoolIntelligence,
  runAgent,
  uploadTestResult
} from "./lib/api";
import { transcribeNoteImage, type OcrProgress, type OcrResult } from "./lib/ocr";
import {
  getBrowserSupabaseClient,
  getBrowserSupabaseMode,
  sendSupabaseMagicLink,
  signOutSupabaseUser
} from "./lib/supabaseClient";
import {
  STUDY_STATE_EVENT,
  addDaysIso,
  buildPracticeItems,
  commitStudyPlan,
  deleteExam,
  generatePlanFromExam,
  getAllExams,
  getPracticeResults,
  getProgressSnapshot,
  getStudyPlans,
  getUpcomingExams,
  recordPracticeResult,
  saveExam,
  updateTaskStatus
} from "./lib/studyState";
import { launchPillars, launchSteps } from "./data/businessPlan";
import { sampleStudyInput } from "./data/sampleStudy";
import type {
  AgentMeta,
  AgentRunResponse,
  ExamPriority,
  PowerPointRequest,
  PracticeResult,
  ProgressSnapshot,
  ResultUploadImage,
  ResultUploadRequest,
  ResultUploadResponse,
  SchoolIntelligenceResponse,
  StudentExam,
  StudyInput,
  StudyPlan,
  StudySessionResult,
  TaskStatus
} from "./types";

type RoutePath =
  | "/"
  | "/ai-tutor"
  | "/study-planner"
  | "/smart-practice"
  | "/progress-hub"
  | "/school-intelligence"
  | "/powerpoint"
  | "/agents"
  | "/launch";

type FeatureTone = "violet" | "teal" | "blue" | "amber";

const routeMeta = {
  "/": {
    title: "Welcome back, Alex!",
    subtitle: "Scan notes, transcribe them locally, and get a concrete plan in seconds.",
    documentTitle: "Kloer Study",
    description: "Kloer is a multilingual AI study copilot for Luxembourg students."
  },
  "/ai-tutor": {
    title: "AI Tutor",
    subtitle: "Use upcoming tests to turn confusion into a plan you can commit to.",
    documentTitle: "AI Tutor | Kloer Study",
    description: "AI Tutor reads upcoming tests, asks for missing exam data, and helps students commit to a plan."
  },
  "/study-planner": {
    title: "Study Planner",
    subtitle: "Track upcoming exams in a calendar overview that is readable by people and agents.",
    documentTitle: "Study Planner | Kloer Study",
    description: "Study Planner is the source of truth for tests, topics, priorities, and calendar tasks."
  },
  "/smart-practice": {
    title: "Smart Practice",
    subtitle: "Review the important ideas, definitions, and flashcards for each test.",
    documentTitle: "Smart Practice | Kloer Study",
    description: "Smart Practice gives summaries, definitions, quizzes, and flashcards based on planned exams."
  },
  "/progress-hub": {
    title: "Progress Hub",
    subtitle: "See how much of the AI Tutor plan is actually complete.",
    documentTitle: "Progress Hub | Kloer Study",
    description: "Progress Hub displays study-plan completion, practice accuracy, weak spots, and readiness."
  },
  "/school-intelligence": {
    title: "School Intelligence",
    subtitle: "Private result uploads become anonymized school guidance only after safety thresholds.",
    documentTitle: "School Intelligence | Kloer Study",
    description:
      "School Intelligence stores corrected-test uploads privately and exposes only anonymized aggregate guidance."
  },
  "/powerpoint": {
    title: "PowerPoint Creator",
    subtitle: "Feed in real class information and create a topic-specific student deck.",
    documentTitle: "PowerPoint Creator | Kloer Study",
    description: "Create student PowerPoint decks from notes and study goals."
  },
  "/agents": {
    title: "Agent API",
    subtitle: "Run the free local agent registry and inspect the API shape.",
    documentTitle: "Agent API | Kloer Study",
    description: "Developer console for Kloer study agents."
  },
  "/launch": {
    title: "Launch Board",
    subtitle: "A Luxembourg-first launch path for the study copilot business.",
    documentTitle: "Launch Board | Kloer Study",
    description: "Business launch board and beta lead capture for Kloer."
  }
} satisfies Record<RoutePath, { title: string; subtitle: string; documentTitle: string; description: string }>;

const navItems = [
  { route: "/", label: "Home", icon: Home },
  { route: "/ai-tutor", label: "AI Tutor", icon: BrainCircuit },
  { route: "/study-planner", label: "Planner", icon: CalendarDays },
  { route: "/smart-practice", label: "Practice", icon: Star },
  { route: "/progress-hub", label: "Progress", icon: LineChart },
  { route: "/school-intelligence", label: "School Intel", icon: Database },
  { route: "/powerpoint", label: "PowerPoint", icon: FileText },
  { route: "/agents", label: "Agent API", icon: Code2 },
  { route: "/launch", label: "Launch Board", icon: Rocket }
] satisfies Array<{ route: RoutePath; label: string; icon: typeof Home }>;

const toolNavItems = navItems.filter((item) =>
  ["/ai-tutor", "/study-planner", "/smart-practice", "/progress-hub"].includes(item.route)
);

const featureCards = [
  {
    route: "/ai-tutor",
    title: "AI Tutor",
    body: "Turn upcoming tests into a plan you can commit to.",
    action: "Open Tutor",
    icon: BrainCircuit,
    tone: "violet"
  },
  {
    route: "/study-planner",
    title: "Study Planner",
    body: "Add tests, see the week, and keep exam data clean.",
    action: "Open Planner",
    icon: NotebookText,
    tone: "teal"
  },
  {
    route: "/smart-practice",
    title: "Smart Practice",
    body: "Practice summaries, definitions, quizzes, and flashcards.",
    action: "Start Practice",
    icon: Star,
    tone: "blue"
  },
  {
    route: "/progress-hub",
    title: "Progress Hub",
    body: "Measure completed tasks and practice accuracy.",
    action: "View Progress",
    icon: TrendingUp,
    tone: "amber"
  }
] satisfies Array<{
  route: RoutePath;
  title: string;
  body: string;
  action: string;
  icon: typeof BrainCircuit;
  tone: FeatureTone;
}>;

const quotes = [
  {
    lead: "Learning is not attained by chance,",
    body: "it must be sought for with focus and good tools.",
    author: "Kloer beta"
  },
  {
    lead: "The best test prep starts before you reread,",
    body: "ask what you remember, then let the weak spots show themselves.",
    author: "Study principle"
  },
  {
    lead: "A clear explanation beats a long summary,",
    body: "especially when your school day crosses several languages.",
    author: "Kloer method"
  },
  {
    lead: "Make the invisible visible,",
    body: "turn messy notes into questions, examples, and a plan.",
    author: "Student workflow"
  }
];

const supportedRoutes = new Set<RoutePath>(Object.keys(routeMeta) as RoutePath[]);
const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

function App() {
  const [activeRoute, navigate] = useAppRoute();
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quietTheme, setQuietTheme] = useState(false);
  const [input, setInput] = useState<StudyInput>(sampleStudyInput);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("concept-explainer");
  const [session, setSession] = useState<StudySessionResult | null>(null);
  const [agentResponse, setAgentResponse] = useState<AgentRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [notePreviewUrl, setNotePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [leadSignal, setLeadSignal] = useState<string | null>(null);
  const [studyStateVersion, setStudyStateVersion] = useState(0);

  useEffect(() => {
    getAgents()
      .then((payload) => {
        setAgents(payload.agents);
        setSelectedAgentId(payload.agents[0]?.id ?? "concept-explainer");
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  useEffect(() => {
    return () => {
      if (notePreviewUrl) {
        URL.revokeObjectURL(notePreviewUrl);
      }
    };
  }, [notePreviewUrl]);

  useEffect(() => {
    const quoteTimer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % quotes.length);
    }, 9000);

    return () => window.clearInterval(quoteTimer);
  }, []);

  useEffect(() => {
    const refreshStudyState = () => setStudyStateVersion((current) => current + 1);
    window.addEventListener(STUDY_STATE_EVENT, refreshStudyState);
    window.addEventListener("storage", refreshStudyState);
    return () => {
      window.removeEventListener(STUDY_STATE_EVENT, refreshStudyState);
      window.removeEventListener("storage", refreshStudyState);
    };
  }, []);

  useEffect(() => {
    const meta = routeMeta[activeRoute];
    document.title = meta.documentTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
  }, [activeRoute]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId]
  );
  const exams = useMemo(() => getUpcomingExams(), [studyStateVersion]);
  const allExams = useMemo(() => getAllExams(), [studyStateVersion]);
  const plans = useMemo(() => getStudyPlans(), [studyStateVersion]);
  const practiceResults = useMemo(() => getPracticeResults(), [studyStateVersion]);
  const progress = useMemo(() => getProgressSnapshot(), [studyStateVersion]);
  const routeCopy = routeMeta[activeRoute];

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await createStudySession(input);
      setSession(result);
      navigate("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create session.");
    } finally {
      setLoading(false);
    }
  }

  function handleFeatureAction(route: RoutePath) {
    navigate(route);
  }

  function handleCycleLanguage() {
    const languages: StudyInput["language"][] = ["en", "fr", "de", "lb-simple"];
    const nextLanguage = languages[(languages.indexOf(input.language) + 1) % languages.length];
    setInput((current) => ({ ...current, language: nextLanguage }));
  }

  function handleSaveExam(exam: Partial<StudentExam> & Pick<StudentExam, "subject" | "title" | "date" | "topics">) {
    const savedExam = saveExam(exam);
    setInput((current) => ({
      ...current,
      subject: savedExam.subject,
      examDate: savedExam.date,
      goals: Array.from(new Set([...current.goals, ...savedExam.topics]))
    }));
    return savedExam;
  }

  function handleGeneratePlan(exam: StudentExam) {
    return generatePlanFromExam(exam);
  }

  function handleCommitPlan(planId: string) {
    return commitStudyPlan(planId);
  }

  function handleTaskStatus(planId: string, taskId: string, status: TaskStatus) {
    updateTaskStatus(planId, taskId, status);
  }

  function handlePracticeResult(result: Omit<PracticeResult, "id" | "createdAt">) {
    return recordPracticeResult(result);
  }

  async function handleRunAgent() {
    setLoading(true);
    setError(null);
    try {
      const result = await runAgent(selectedAgentId, input);
      setAgentResponse(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not run agent.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTextUpload(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.includes("text") && !file.name.endsWith(".md")) {
      setError("Use the camera or image upload controls for note photos.");
      return;
    }

    const text = await file.text();
    setInput((current) => ({ ...current, rawText: text }));
    setError(null);
  }

  async function handleImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose a note photo or image file.");
      return;
    }

    setOcrLoading(true);
    setOcrResult(null);
    setError(null);

    if (notePreviewUrl) {
      URL.revokeObjectURL(notePreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setNotePreviewUrl(previewUrl);

    try {
      const transcription = await transcribeNoteImage(file, input.language, setOcrProgress);

      if (transcription.wordCount < 8) {
        setError("The image was transcribed, but it looks too short. Try a brighter, closer photo.");
        return;
      }

      setOcrResult(transcription);

      const nextInput = {
        ...input,
        rawText: transcription.text,
        goals: Array.from(new Set([...input.goals, "photo notes", "concrete study plan"]))
      };

      setInput(nextInput);
      const result = await createStudySession(nextInput);
      setSession(result);
      navigate("/");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not transcribe this note photo."
      );
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleWaitlist() {
    setError(null);
    try {
      const response = await joinWaitlist({
        email: waitlistEmail,
        persona: "student",
        language: input.language,
        pain: "I want multilingual study help for tests in Luxembourg."
      });
      setLeadSignal(`Lead score ${response.score}. ${response.nextStep}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not join waitlist.");
    }
  }

  return (
    <div className={quietTheme ? "app-shell quiet-theme" : "app-shell"}>
      <aside className="sidebar">
        <button className="brand brand-button" type="button" onClick={() => navigate("/")} aria-label="Go to dashboard">
          <div className="brand-mark">
            <BrainCircuit size={29} />
          </div>
          <div>
            <strong>Kloer</strong>
            <span>Your AI Study Partner</span>
          </div>
        </button>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.route}
                className={activeRoute === item.route ? "nav-item active" : "nav-item"}
                onClick={() => navigate(item.route)}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-language">
          <Globe2 size={21} />
          <span>English / Francais / Deutsch / Letzebuergesch</span>
        </div>

        <div className="profile-card">
          <div className="profile-avatar">
            <UserRound size={22} />
          </div>
          <div>
            <strong>Alex</strong>
            <span>Free beta</span>
          </div>
          <ChevronRight size={18} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{routeCopy.title}</h1>
            <p>{routeCopy.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <button className="model-chip" type="button" onClick={() => navigate("/agents")}>
              <Sparkles size={18} />
              Free OCR + Local Agents
              <ChevronRight size={17} />
            </button>
            <button className="square-action" type="button" aria-label="Cycle language" onClick={handleCycleLanguage}>
              <Languages size={20} />
            </button>
            <button className="square-action" type="button" aria-label="Toggle visual focus" onClick={() => setQuietTheme((value) => !value)}>
              <Moon size={20} />
            </button>
          </div>
        </header>

        {error ? (
          <div className="toast-alert" role="status">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        {activeRoute === "/" ? (
          <HomeView
            input={input}
            session={session}
            activeLanguage={input.language}
            loading={loading}
            exams={exams}
            plans={plans}
            progress={progress}
            activeRoute={activeRoute}
            onChange={setInput}
            onGenerate={handleGenerate}
            onFeatureAction={handleFeatureAction}
            quote={quotes[quoteIndex]}
            onNextQuote={() => setQuoteIndex((quoteIndex + 1) % quotes.length)}
            onUpload={handleTextUpload}
            onImageUpload={handleImageUpload}
            ocrLoading={ocrLoading}
            ocrProgress={ocrProgress}
            ocrResult={ocrResult}
            notePreviewUrl={notePreviewUrl}
          />
        ) : null}

        {activeRoute === "/ai-tutor" ? (
          <AiTutorPage
            input={input}
            exams={exams}
            plans={plans}
            progress={progress}
            onSaveExam={handleSaveExam}
            onGeneratePlan={handleGeneratePlan}
            onCommitPlan={handleCommitPlan}
            onTaskStatus={handleTaskStatus}
            onNavigate={navigate}
          />
        ) : null}

        {activeRoute === "/study-planner" ? (
          <StudyPlannerPage
            input={input}
            exams={allExams}
            plans={plans}
            onSaveExam={handleSaveExam}
            onDeleteExam={deleteExam}
            onTaskStatus={handleTaskStatus}
          />
        ) : null}

        {activeRoute === "/smart-practice" ? (
          <SmartPracticePage
            exams={exams}
            practiceResults={practiceResults}
            onRecordPractice={handlePracticeResult}
            onNavigate={navigate}
          />
        ) : null}

        {activeRoute === "/progress-hub" ? (
          <ProgressHubPage
            exams={exams}
            plans={plans}
            progress={progress}
            practiceResults={practiceResults}
            onTaskStatus={handleTaskStatus}
            onNavigate={navigate}
          />
        ) : null}

        {activeRoute === "/school-intelligence" ? (
          <SchoolIntelligencePage exams={allExams} onNavigate={navigate} />
        ) : null}

        {activeRoute === "/powerpoint" ? (
          <PowerPointCreator input={input} onChange={setInput} />
        ) : null}

        {activeRoute === "/agents" ? (
          <AgentConsole
            input={input}
            agents={agents}
            selectedAgentId={selectedAgentId}
            selectedAgent={selectedAgent}
            response={agentResponse}
            loading={loading}
            onSelectAgent={setSelectedAgentId}
            onRunAgent={handleRunAgent}
          />
        ) : null}

        {activeRoute === "/launch" ? (
          <LaunchBoard
            email={waitlistEmail}
            leadSignal={leadSignal}
            onEmailChange={setWaitlistEmail}
            onWaitlist={handleWaitlist}
          />
        ) : null}
      </main>

      <MobileToolNav activeRoute={activeRoute} onNavigate={navigate} />
    </div>
  );
}

interface StudyWorkspaceProps {
  input: StudyInput;
  session: StudySessionResult | null;
  activeLanguage: StudyInput["language"];
  loading: boolean;
  exams: StudentExam[];
  plans: StudyPlan[];
  progress: ProgressSnapshot;
  activeRoute: RoutePath;
  onChange: (input: StudyInput) => void;
  onGenerate: () => void;
  onFeatureAction: (route: RoutePath) => void;
  quote: (typeof quotes)[number];
  onNextQuote: () => void;
  onUpload: (file: File | null) => void;
  onImageUpload: (file: File | null) => void;
  ocrLoading: boolean;
  ocrProgress: OcrProgress | null;
  ocrResult: OcrResult | null;
  notePreviewUrl: string | null;
}

function HomeView(props: StudyWorkspaceProps) {
  return (
    <>
      <QuoteBanner quote={props.quote} onNextQuote={props.onNextQuote} />
      <FeatureGrid
        activeRoute={props.activeRoute}
        onFeatureAction={props.onFeatureAction}
        loading={props.loading}
      />
      <DashboardPulse
        exams={props.exams}
        plans={props.plans}
        progress={props.progress}
        onNavigate={props.onFeatureAction}
      />
      <StudyWorkspace {...props} />
      <LanguageStrip activeLanguage={props.activeLanguage} />
    </>
  );
}

function QuoteBanner({ quote, onNextQuote }: { quote: (typeof quotes)[number]; onNextQuote: () => void }) {
  return (
    <section className="quote-banner">
      <div className="quote-copy">
        <strong>{quote.lead}</strong>
        <span>{quote.body}</span>
        <small>- {quote.author}</small>
        <button className="quote-next" type="button" onClick={onNextQuote}>
          <RefreshCw size={15} />
          Switch quote
        </button>
      </div>
      <MountainScene />
    </section>
  );
}

function MountainScene() {
  return (
    <svg className="mountain-scene" viewBox="0 0 720 210" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#1d1d59" />
          <stop offset="48%" stopColor="#8237af" />
          <stop offset="100%" stopColor="#ff8c68" />
        </linearGradient>
        <linearGradient id="ridge" x1="0" x2="1">
          <stop offset="0%" stopColor="#182158" />
          <stop offset="100%" stopColor="#0f1738" />
        </linearGradient>
      </defs>
      <rect width="720" height="210" rx="26" fill="url(#sky)" />
      <path d="M0 174 C80 130 121 145 178 112 C220 88 240 122 292 100 C344 78 364 138 424 88 C466 54 478 25 526 82 C586 152 650 102 720 132 L720 210 L0 210 Z" fill="#243070" opacity="0.72" />
      <path d="M226 210 L428 62 L512 210 Z" fill="#111932" />
      <path d="M428 62 L512 210 L720 210 L594 116 L544 130 Z" fill="url(#ridge)" />
      <path d="M0 210 L170 126 L244 156 L318 118 L405 210 Z" fill="#141d46" opacity="0.94" />
      <path d="M431 69 C449 93 424 105 447 129 C472 156 434 164 462 199" fill="none" stroke="#9fa8ff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <path d="M431 69 C449 93 424 105 447 129 C472 156 434 164 462 199" fill="none" stroke="#ff9f68" strokeWidth="2" strokeLinecap="round" />
      <path d="M430 63 L430 40 M432 42 L456 48 L432 55" fill="none" stroke="#0b1026" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="#cfd5ff" opacity="0.72">
        <circle cx="68" cy="45" r="2" />
        <circle cx="188" cy="26" r="1.5" />
        <circle cx="318" cy="57" r="2" />
        <circle cx="612" cy="38" r="1.5" />
        <circle cx="672" cy="74" r="1.5" />
      </g>
    </svg>
  );
}

function FeatureGrid({
  activeRoute,
  onFeatureAction,
  loading
}: {
  activeRoute: RoutePath;
  onFeatureAction: (route: RoutePath) => void;
  loading: boolean;
}) {
  return (
    <section className="feature-grid" aria-label="Study actions">
      {featureCards.map((card) => {
        const Icon = card.icon;
        return (
          <article className={`feature-card ${card.tone} ${activeRoute === card.route ? "active" : ""}`} key={card.title}>
            <div className="feature-orb">
              <Icon size={42} />
            </div>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
            <button className="feature-action" onClick={() => onFeatureAction(card.route)} disabled={loading}>
              {card.action}
              <ChevronRight size={19} />
            </button>
          </article>
        );
      })}
    </section>
  );
}

function DashboardPulse({
  exams,
  plans,
  progress,
  onNavigate
}: {
  exams: StudentExam[];
  plans: StudyPlan[];
  progress: ProgressSnapshot;
  onNavigate: (route: RoutePath) => void;
}) {
  const nextExam = exams[0];
  const committedPlans = plans.filter((plan) => plan.committedAt);

  return (
    <section className="pulse-grid" aria-label="Study overview">
      <article className="pulse-panel">
        <span className="pulse-icon teal">
          <CalendarDays size={22} />
        </span>
        <div>
          <strong>{nextExam ? nextExam.title : "No test added yet"}</strong>
          <p>{nextExam ? `${nextExam.subject} on ${formatDate(nextExam.date)}` : "Add your next exam so the tutor can plan around it."}</p>
        </div>
        <button type="button" onClick={() => onNavigate("/study-planner")}>
          Planner
        </button>
      </article>
      <article className="pulse-panel">
        <span className="pulse-icon violet">
          <CheckSquare2 size={22} />
        </span>
        <div>
          <strong>{committedPlans.length} committed plan{committedPlans.length === 1 ? "" : "s"}</strong>
          <p>{progress.completedTasks} of {progress.totalTasks} tasks completed.</p>
        </div>
        <button type="button" onClick={() => onNavigate("/ai-tutor")}>
          Commit
        </button>
      </article>
      <article className="pulse-panel">
        <span className="pulse-icon amber">
          <TrendingUp size={22} />
        </span>
        <div>
          <strong>{progress.percent}% ready</strong>
          <p>Based on task completion and practice accuracy.</p>
        </div>
        <button type="button" onClick={() => onNavigate("/progress-hub")}>
          Progress
        </button>
      </article>
      <article className="pulse-panel">
        <span className="pulse-icon blue">
          <Database size={22} />
        </span>
        <div>
          <strong>Shared school memory</strong>
          <p>Upload corrected tests privately and unlock aggregate guidance safely.</p>
        </div>
        <button type="button" onClick={() => onNavigate("/school-intelligence")}>
          Intel
        </button>
      </article>
    </section>
  );
}

function LanguageStrip({ activeLanguage }: { activeLanguage: StudyInput["language"] }) {
  const tabs: Array<{ id: StudyInput["language"]; label: string }> = [
    { id: "en", label: "English" },
    { id: "fr", label: "Francais" },
    { id: "de", label: "Deutsch" },
    { id: "lb-simple", label: "Letzebuergesch" }
  ];

  return (
    <section className="language-strip">
      <div>
        <BrainCircuit size={32} />
        <span>
          <strong>Multilingual by design</strong>
          <small>Study in your preferred language. Agent output adapts to the selected context.</small>
        </span>
      </div>
      <div className="language-tabs" aria-label="Supported languages">
        {tabs.map((tab) => (
          <span className={activeLanguage === tab.id ? "active" : ""} key={tab.id}>
            {tab.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function StudyWorkspace({
  input,
  session,
  loading,
  onChange,
  onGenerate,
  onUpload,
  onImageUpload,
  ocrLoading,
  ocrProgress,
  ocrResult,
  notePreviewUrl
}: StudyWorkspaceProps) {
  return (
    <section className="workspace-grid">
      <div className="panel editor-panel">
        <div className="panel-heading">
          <div>
            <h2>Scan notes</h2>
            <p>Photo first, editable text second. Nothing paid is required for beta OCR.</p>
          </div>
          <label className="icon-button" title="Upload .txt or .md notes">
            <Upload size={18} />
            <input
              type="file"
              accept=".txt,.md,text/plain"
              onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="capture-card">
          <div>
            <h3>Photo notes</h3>
            <p>Use the camera, then let local OCR create the text and plan.</p>
          </div>
          <div className="capture-actions">
            <label className="capture-button">
              <Camera size={18} />
              Camera
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => onImageUpload(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="capture-button secondary">
              <Upload size={18} />
              Image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => onImageUpload(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {notePreviewUrl ? <img className="note-preview" src={notePreviewUrl} alt="Uploaded note preview" /> : null}
          {ocrLoading || ocrProgress ? (
            <div className="ocr-status" aria-live="polite">
              <div className="ocr-status-row">
                <span>{ocrProgress?.status ?? "Starting OCR"}</span>
                <strong>{ocrProgress?.progress ?? 0}%</strong>
              </div>
              <div className="progress-track">
                <div style={{ width: `${ocrProgress?.progress ?? 0}%` }} />
              </div>
            </div>
          ) : null}
          {ocrResult ? (
            <div className="ocr-result">
              <CheckCircle2 size={17} />
              <span>
                Transcribed {ocrResult.wordCount} words with {ocrResult.confidence}% confidence.
              </span>
            </div>
          ) : null}
        </div>

        <div className="field-grid">
          <label>
            Subject
            <input value={input.subject} onChange={(event) => onChange({ ...input, subject: event.target.value })} />
          </label>
          <label>
            Level
            <select
              value={input.level}
              onChange={(event) => onChange({ ...input, level: event.target.value as StudyInput["level"] })}
            >
              <option value="lower-secondary">Lower secondary</option>
              <option value="upper-secondary">Upper secondary</option>
              <option value="university">University</option>
            </select>
          </label>
          <label>
            Output language
            <select
              value={input.language}
              onChange={(event) => onChange({ ...input, language: event.target.value as StudyInput["language"] })}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="lb-simple">Simple Luxembourgish-style</option>
            </select>
          </label>
          <label>
            Exam date
            <input
              type="date"
              value={input.examDate ?? ""}
              onChange={(event) => onChange({ ...input, examDate: event.target.value })}
            />
          </label>
        </div>

        <label className="notes-label">
          Notes
          <textarea
            value={input.rawText}
            onChange={(event) => onChange({ ...input, rawText: event.target.value })}
            rows={11}
          />
        </label>

        <button className="wide-action" onClick={onGenerate} disabled={loading}>
          <BrainCircuit size={18} />
          {loading ? "Agents working" : "Generate Session"}
        </button>
      </div>

      <div className="panel results-panel">
        <div className="panel-heading">
          <div>
            <h2>Study session</h2>
            <p>Concrete plan from the free local agent network.</p>
          </div>
          <span className="status-chip">{session?.provider ?? "Free local"}</span>
        </div>

        {session ? (
          <div className="result-stack">
            <section>
              <h3>Summary</h3>
              <p>{session.summary}</p>
            </section>
            <section>
              <h3>Key ideas</h3>
              <ul className="clean-list">
                {session.keyIdeas.map((idea) => (
                  <li key={idea}>
                    <CheckCircle2 size={16} />
                    {idea}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Flashcards</h3>
              <div className="flashcard-grid">
                {session.flashcards.slice(0, 4).map((card) => (
                  <article className="mini-card" key={card.front}>
                    <strong>{card.front}</strong>
                    <p>{card.back}</p>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <h3>Study plan</h3>
              <ol className="plan-list">
                {session.studyPlan.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={36} />
            <h3>No session yet</h3>
            <p>Upload a note photo or tap Generate Session to create a plan.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AiTutorPage({
  input,
  exams,
  plans,
  progress,
  onSaveExam,
  onGeneratePlan,
  onCommitPlan,
  onTaskStatus,
  onNavigate
}: {
  input: StudyInput;
  exams: StudentExam[];
  plans: StudyPlan[];
  progress: ProgressSnapshot;
  onSaveExam: (exam: Partial<StudentExam> & Pick<StudentExam, "subject" | "title" | "date" | "topics">) => StudentExam;
  onGeneratePlan: (exam: StudentExam) => StudyPlan;
  onCommitPlan: (planId: string) => StudyPlan | undefined;
  onTaskStatus: (planId: string, taskId: string, status: TaskStatus) => void;
  onNavigate: (route: RoutePath) => void;
}) {
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id ?? "");
  const [message, setMessage] = useState("I will use your test data first. If it is missing, I will ask for it.");
  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? exams[0];
  const selectedPlan = selectedExam ? plans.find((plan) => plan.examIds.includes(selectedExam.id)) : undefined;

  useEffect(() => {
    if (!selectedExamId && exams[0]) {
      setSelectedExamId(exams[0].id);
    }
    if (selectedExamId && !exams.some((exam) => exam.id === selectedExamId)) {
      setSelectedExamId(exams[0]?.id ?? "");
    }
  }, [exams, selectedExamId]);

  function handleGeneratePlan() {
    if (!selectedExam) {
      return;
    }
    const plan = onGeneratePlan(selectedExam);
    setMessage(`I created ${plan.tasks.length} concrete tasks for ${selectedExam.title}. Review them, then commit.`);
  }

  function handleCommitPlan() {
    if (!selectedPlan) {
      return;
    }
    onCommitPlan(selectedPlan.id);
    setMessage(`Committed. Your tasks for ${selectedExam?.title ?? "this test"} now count toward Progress Hub.`);
  }

  return (
    <DeepDivePage route="/ai-tutor" tone="violet" icon={BrainCircuit}>
      <div className="study-page-grid">
        <section className="panel tutor-thread" data-agent-section="test-data-check">
          <div className="panel-heading">
            <div>
              <h2>Test-aware tutor</h2>
              <p>The tutor checks Study Planner first, then asks for test details when the planner is empty.</p>
            </div>
            <span className="status-chip">{exams.length} upcoming</span>
          </div>

          {exams.length === 0 ? (
            <div className="missing-data-flow">
              <div className="tutor-bubble">
                <BrainCircuit size={21} />
                <p>I do not have your upcoming tests yet. Add the next one and I will build the first plan from it.</p>
              </div>
              <ExamForm
                defaultSubject={input.subject}
                defaultDate={input.examDate}
                defaultTopics={input.goals}
                onSave={(exam) => {
                  const saved = onSaveExam(exam);
                  setSelectedExamId(saved.id);
                  setMessage(`Great. I can now plan around ${saved.title} on ${formatDate(saved.date)}.`);
                }}
                submitLabel="Save test for tutor"
              />
            </div>
          ) : (
            <>
              <div className="exam-selector" role="list" aria-label="Upcoming tests">
                {exams.map((exam) => (
                  <button
                    type="button"
                    key={exam.id}
                    className={selectedExam?.id === exam.id ? "exam-chip selected" : "exam-chip"}
                    onClick={() => setSelectedExamId(exam.id)}
                  >
                    <strong>{exam.subject}</strong>
                    <span>{formatDate(exam.date)}</span>
                  </button>
                ))}
              </div>

              <div className="tutor-bubble">
                <BrainCircuit size={21} />
                <p>{message}</p>
              </div>

              {selectedExam ? (
                <article className="exam-focus">
                  <div>
                    <span className={`priority-dot ${selectedExam.priority}`} />
                    <strong>{selectedExam.title}</strong>
                    <p>{selectedExam.subject} test in {describeDaysUntil(selectedExam.date)}. Confidence: {selectedExam.confidence}%.</p>
                  </div>
                  <div className="topic-tags">
                    {selectedExam.topics.map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                </article>
              ) : null}

              {selectedExam ? (
                <TutorSchoolIntel exam={selectedExam} onOpenIntel={() => onNavigate("/school-intelligence")} />
              ) : null}

              <div className="action-row">
                <button className="primary-action" type="button" onClick={handleGeneratePlan}>
                  <ListChecks size={18} />
                  Generate plan
                </button>
                <button className="secondary-action" type="button" onClick={handleCommitPlan} disabled={!selectedPlan}>
                  <CheckCircle2 size={18} />
                  I commit to this plan
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel" data-agent-section="commitment-board">
          <div className="panel-heading">
            <div>
              <h2>Commitment board</h2>
              <p>Tasks created here become the measurable plan used by Progress Hub.</p>
            </div>
            <span className="status-chip">{progress.percent}% ready</span>
          </div>

          {selectedPlan ? (
            <>
              <div className={selectedPlan.committedAt ? "commitment-banner committed" : "commitment-banner"}>
                <Target size={20} />
                <span>
                  {selectedPlan.committedAt
                    ? `Committed on ${formatDate(selectedPlan.committedAt.slice(0, 10))}`
                    : "Plan drafted. Commit when it feels realistic."}
                </span>
              </div>
              <TaskChecklist plan={selectedPlan} onTaskStatus={onTaskStatus} />
            </>
          ) : (
            <div className="empty-state compact">
              <ListChecks size={34} />
              <h3>No plan yet</h3>
              <p>Choose a test and generate the plan. The tutor will convert topics into daily tasks.</p>
              <button className="secondary-action" type="button" onClick={() => onNavigate("/study-planner")}>
                Open Study Planner
              </button>
            </div>
          )}
        </section>
      </div>
    </DeepDivePage>
  );
}

function TutorSchoolIntel({
  exam,
  onOpenIntel
}: {
  exam: StudentExam;
  onOpenIntel: () => void;
}) {
  const [intelligence, setIntelligence] = useState<SchoolIntelligenceResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSchoolIntelligence({ subject: exam.subject, topic: exam.topics[0] })
      .then((payload) => {
        if (!cancelled) {
          setIntelligence(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIntelligence(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [exam.id, exam.subject, exam.topics]);

  const hasSignals = intelligence
    ? intelligence.tests.length + intelligence.correctionPatterns.length + intelligence.commonMistakes.length > 0
    : false;

  return (
    <article className="school-intel-mini" data-agent-section="shared-school-intelligence">
      <div>
        <Database size={18} />
        <strong>Shared school memory</strong>
      </div>
      {hasSignals && intelligence ? (
        <p>
          Tutor hint: {intelligence.correctionPatterns[0]?.guidance ?? intelligence.tests[0]?.correctionStyleSummary}
        </p>
      ) : (
        <p>
          No safe shared signal yet for this topic. Add corrected result photos after the test to build the database.
        </p>
      )}
      <button className="secondary-action" type="button" onClick={onOpenIntel}>
        Open School Intelligence
      </button>
    </article>
  );
}

function StudyPlannerPage({
  input,
  exams,
  plans,
  onSaveExam,
  onDeleteExam,
  onTaskStatus
}: {
  input: StudyInput;
  exams: StudentExam[];
  plans: StudyPlan[];
  onSaveExam: (exam: Partial<StudentExam> & Pick<StudentExam, "subject" | "title" | "date" | "topics">) => StudentExam;
  onDeleteExam: (examId: string) => void;
  onTaskStatus: (planId: string, taskId: string, status: TaskStatus) => void;
}) {
  const [editingExam, setEditingExam] = useState<StudentExam | undefined>();

  return (
    <DeepDivePage route="/study-planner" tone="teal" icon={CalendarDays}>
      <div className="study-page-grid planner-layout">
        <section className="panel" data-agent-section="exam-editor">
          <div className="panel-heading">
            <div>
              <h2>{editingExam ? "Edit test" : "Add upcoming test"}</h2>
              <p>Manual entry is the v1 source of truth. AI Tutor reads this data before asking questions.</p>
            </div>
            {editingExam ? (
              <button className="secondary-action" type="button" onClick={() => setEditingExam(undefined)}>
                <Plus size={17} />
                New test
              </button>
            ) : null}
          </div>
          <ExamForm
            key={editingExam?.id ?? "new-exam"}
            initialExam={editingExam}
            defaultSubject={input.subject}
            defaultDate={input.examDate}
            defaultTopics={input.goals}
            onSave={(exam) => {
              onSaveExam(exam);
              setEditingExam(undefined);
            }}
            submitLabel={editingExam ? "Update test" : "Add test"}
          />
        </section>

        <section className="panel" data-agent-section="calendar-overview">
          <div className="panel-heading">
            <div>
              <h2>Calendar overview</h2>
              <p>Agent-readable week view with tests and planned study tasks.</p>
            </div>
            <span className="status-chip">{exams.length} tests</span>
          </div>
          <CalendarOverview exams={exams} plans={plans} />
        </section>
      </div>

      <section className="panel" data-agent-section="upcoming-tests">
        <div className="panel-heading">
          <div>
            <h2>Upcoming tests</h2>
            <p>These records drive the tutor, practice mode, and progress calculations.</p>
          </div>
        </div>
        {exams.length > 0 ? (
          <div className="exam-list">
            {exams.map((exam) => (
              <article className="exam-card" key={exam.id}>
                <div>
                  <div className="exam-card-topline">
                    <span className={`priority-dot ${exam.priority}`} />
                    <strong>{exam.title}</strong>
                  </div>
                  <p>{exam.subject} on {formatDate(exam.date)}. Confidence {exam.confidence}%.</p>
                  <div className="topic-tags">
                    {exam.topics.map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                </div>
                <div className="exam-actions">
                  <button className="secondary-action" type="button" onClick={() => setEditingExam(exam)}>
                    Edit
                  </button>
                  <button className="icon-danger" type="button" aria-label={`Delete ${exam.title}`} onClick={() => onDeleteExam(exam.id)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <CalendarDays size={34} />
            <h3>No tests saved</h3>
            <p>Add a test above and it will become visible to AI Tutor and Smart Practice.</p>
          </div>
        )}

        {plans.length > 0 ? (
          <div className="task-plan-strip">
            {plans.map((plan) => (
              <TaskChecklist key={plan.id} plan={plan} onTaskStatus={onTaskStatus} compact />
            ))}
          </div>
        ) : null}
      </section>
    </DeepDivePage>
  );
}

function SmartPracticePage({
  exams,
  practiceResults,
  onRecordPractice,
  onNavigate
}: {
  exams: StudentExam[];
  practiceResults: PracticeResult[];
  onRecordPractice: (result: Omit<PracticeResult, "id" | "createdAt">) => PracticeResult;
  onNavigate: (route: RoutePath) => void;
}) {
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id ?? "");
  const [mode, setMode] = useState<"briefing" | "flashcards">("briefing");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? exams[0];
  const practiceItems = selectedExam ? buildPracticeItems(selectedExam) : [];
  const currentItem = practiceItems[cardIndex % Math.max(1, practiceItems.length)];
  const examAttempts = selectedExam ? practiceResults.filter((result) => result.examId === selectedExam.id) : [];

  useEffect(() => {
    if (!selectedExamId && exams[0]) {
      setSelectedExamId(exams[0].id);
    }
    if (selectedExamId && !exams.some((exam) => exam.id === selectedExamId)) {
      setSelectedExamId(exams[0]?.id ?? "");
    }
  }, [exams, selectedExamId]);

  function handlePractice(correct: boolean) {
    if (!selectedExam || !currentItem) {
      return;
    }

    onRecordPractice({
      examId: selectedExam.id,
      topic: currentItem.topic,
      correct
    });
    setResultMessage(correct ? "Marked correct. Nice, move to the next card." : "Marked for retry. This topic will appear in Progress Hub.");
    setRevealed(false);
    setCardIndex((current) => (current + 1) % practiceItems.length);
  }

  return (
    <DeepDivePage route="/smart-practice" tone="blue" icon={Star}>
      {exams.length === 0 ? (
        <section className="panel">
          <div className="empty-state compact">
            <Star size={34} />
            <h3>No practice source yet</h3>
            <p>Add an upcoming test in Study Planner, then Smart Practice will create summaries and flashcards from its topics.</p>
            <button className="primary-action" type="button" onClick={() => onNavigate("/study-planner")}>
              <Plus size={18} />
              Add a test
            </button>
          </div>
        </section>
      ) : (
        <div className="study-page-grid">
          <section className="panel" data-agent-section="practice-source">
            <div className="panel-heading">
              <div>
                <h2>Practice source</h2>
                <p>Choose a planned test. The practice set stays concrete by using its exact topics.</p>
              </div>
              <span className="status-chip">{examAttempts.length} attempts</span>
            </div>

            <div className="exam-selector vertical" role="list" aria-label="Tests for practice">
              {exams.map((exam) => (
                <button
                  type="button"
                  key={exam.id}
                  className={selectedExam?.id === exam.id ? "exam-chip selected" : "exam-chip"}
                  onClick={() => {
                    setSelectedExamId(exam.id);
                    setCardIndex(0);
                    setRevealed(false);
                    setResultMessage(null);
                  }}
                >
                  <strong>{exam.title}</strong>
                  <span>{exam.subject} · {formatDate(exam.date)}</span>
                </button>
              ))}
            </div>

            <div className="segmented-control" aria-label="Practice mode">
              <button className={mode === "briefing" ? "active" : ""} type="button" onClick={() => setMode("briefing")}>
                Summary
              </button>
              <button className={mode === "flashcards" ? "active" : ""} type="button" onClick={() => setMode("flashcards")}>
                Flashcards
              </button>
            </div>
          </section>

          <section className="panel" data-agent-section="practice-content">
            {mode === "briefing" ? (
              <>
                <div className="panel-heading">
                  <div>
                    <h2>Important information</h2>
                    <p>Summaries, definitions, and quiz prompts for the chosen test.</p>
                  </div>
                </div>
                <div className="practice-briefing-list">
                  {practiceItems.map((item) => (
                    <article className="practice-topic" key={item.id}>
                      <h3>{item.topic}</h3>
                      <p>{item.summary}</p>
                      <strong>Definition target</strong>
                      <p>{item.definition}</p>
                      <div className="quiz-box">
                        <span>{item.quiz.prompt}</span>
                        <small>{item.quiz.answer}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : currentItem ? (
              <div className="flashcard-mode">
                <div className="panel-heading">
                  <div>
                    <h2>Flashcard mode</h2>
                    <p>Reveal the answer, then mark your recall honestly.</p>
                  </div>
                  <span className="status-chip">{cardIndex + 1} / {practiceItems.length}</span>
                </div>

                <button className={revealed ? "big-flashcard revealed" : "big-flashcard"} type="button" onClick={() => setRevealed((value) => !value)}>
                  <small>{currentItem.topic}</small>
                  <strong>{revealed ? currentItem.flashcard.back : currentItem.flashcard.front}</strong>
                  <span>{revealed ? "Tap to hide" : "Tap to reveal"}</span>
                </button>

                <div className="action-row">
                  <button className="secondary-action" type="button" onClick={() => handlePractice(false)}>
                    Retry later
                  </button>
                  <button className="primary-action" type="button" onClick={() => handlePractice(true)}>
                    I knew it
                  </button>
                </div>
                {resultMessage ? <p className="lead-signal">{resultMessage}</p> : null}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </DeepDivePage>
  );
}

function ProgressHubPage({
  exams,
  plans,
  progress,
  practiceResults,
  onTaskStatus,
  onNavigate
}: {
  exams: StudentExam[];
  plans: StudyPlan[];
  progress: ProgressSnapshot;
  practiceResults: PracticeResult[];
  onTaskStatus: (planId: string, taskId: string, status: TaskStatus) => void;
  onNavigate: (route: RoutePath) => void;
}) {
  const committedPlans = plans.filter((plan) => plan.committedAt);

  return (
    <DeepDivePage route="/progress-hub" tone="amber" icon={TrendingUp}>
      <div className="progress-hero-grid">
        <section className="panel progress-score-panel" data-agent-section="readiness-score">
          <div className="readiness-ring large" style={{ "--score": `${progress.percent}%` } as CSSProperties}>
            <strong>{progress.percent}%</strong>
            <span>ready</span>
          </div>
          <div>
            <h2>Progress formula</h2>
            <p>
              70% comes from completed AI Tutor tasks. 30% comes from Smart Practice accuracy.
              This keeps the score tied to real work instead of passive rereading.
            </p>
          </div>
        </section>

        <section className="panel metric-grid" data-agent-section="progress-metrics">
          <Metric label="Tasks done" value={`${progress.completedTasks}/${progress.totalTasks}`} />
          <Metric label="Practice accuracy" value={`${progress.practiceAccuracy}%`} />
          <Metric label="Tests tracked" value={String(progress.examsTracked)} />
          <Metric label="Committed plans" value={String(committedPlans.length)} />
        </section>
      </div>

      <div className="study-page-grid">
        <section className="panel" data-agent-section="exam-progress">
          <div className="panel-heading">
            <div>
              <h2>Exam progress</h2>
              <p>Each test shows plan completion and practice history.</p>
            </div>
          </div>
          {exams.length > 0 ? (
            <div className="exam-progress-list">
              {exams.map((exam) => {
                const examTasks = plans.flatMap((plan) => plan.tasks.filter((task) => task.examId === exam.id));
                const done = examTasks.filter((task) => task.status === "done").length;
                const percent = examTasks.length > 0 ? Math.round((done / examTasks.length) * 100) : 0;
                const attempts = practiceResults.filter((result) => result.examId === exam.id);

                return (
                  <article className="exam-progress-card" key={exam.id}>
                    <div>
                      <strong>{exam.title}</strong>
                      <span>{exam.subject} · {formatDate(exam.date)}</span>
                    </div>
                    <div className="progress-track">
                      <div style={{ width: `${percent}%` }} />
                    </div>
                    <p>{percent}% plan completion · {attempts.length} practice attempts</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact">
              <TrendingUp size={34} />
              <h3>No progress yet</h3>
              <p>Add a test, generate a plan, then complete tasks and flashcards.</p>
              <button className="primary-action" type="button" onClick={() => onNavigate("/study-planner")}>
                Add test
              </button>
            </div>
          )}
        </section>

        <section className="panel" data-agent-section="weak-spots">
          <div className="panel-heading">
            <div>
              <h2>Weak spots</h2>
              <p>Topics missed in Smart Practice are pulled forward for the next session.</p>
            </div>
          </div>
          {progress.weakSpots.length > 0 ? (
            <ul className="clean-list">
              {progress.weakSpots.map((spot) => (
                <li key={spot}>
                  <Target size={16} />
                  {spot}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state compact">
              <Target size={34} />
              <h3>No weak spots recorded</h3>
              <p>Use flashcards and mark missed answers to build a retry list.</p>
            </div>
          )}
        </section>
      </div>

      <section className="panel" data-agent-section="task-completion">
        <div className="panel-heading">
          <div>
            <h2>Task completion</h2>
            <p>Check off the exact tasks created by AI Tutor.</p>
          </div>
        </div>
        {plans.length > 0 ? (
          <div className="task-plan-strip">
            {plans.map((plan) => (
              <TaskChecklist key={plan.id} plan={plan} onTaskStatus={onTaskStatus} compact />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <ListChecks size={34} />
            <h3>No tasks yet</h3>
            <p>Open AI Tutor and generate a plan from an upcoming test.</p>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/ai-tutor")}>
              Open AI Tutor
            </button>
          </div>
        )}
      </section>
    </DeepDivePage>
  );
}

function DeepDivePage({
  route,
  tone,
  icon: Icon,
  children
}: {
  route: RoutePath;
  tone: FeatureTone;
  icon: typeof BrainCircuit;
  children: ReactNode;
}) {
  const meta = routeMeta[route];

  return (
    <article className={`deep-page ${tone}`} data-agent-route={route}>
      <RouteSchema route={route} />
      <section className="deep-hero">
        <div className="deep-hero-icon">
          <Icon size={30} />
        </div>
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
      </section>
      {children}
    </article>
  );
}

function RouteSchema({ route }: { route: RoutePath }) {
  const meta = routeMeta[route];
  const payload = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: meta.title,
    applicationCategory: "EducationalApplication",
    description: meta.description,
    url: route
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}

function ExamForm({
  initialExam,
  defaultSubject,
  defaultDate,
  defaultTopics,
  submitLabel,
  onSave
}: {
  initialExam?: StudentExam;
  defaultSubject?: string;
  defaultDate?: string;
  defaultTopics?: string[];
  submitLabel: string;
  onSave: (exam: Partial<StudentExam> & Pick<StudentExam, "subject" | "title" | "date" | "topics">) => void;
}) {
  const [subject, setSubject] = useState(initialExam?.subject ?? defaultSubject ?? "");
  const [title, setTitle] = useState(initialExam?.title ?? `${defaultSubject ?? "Math"} test`);
  const [date, setDate] = useState(initialExam?.date ?? defaultDate ?? addDaysIso(new Date().toISOString().slice(0, 10), 7));
  const [topicsText, setTopicsText] = useState((initialExam?.topics ?? defaultTopics ?? ["Core concepts"]).join(", "));
  const [confidence, setConfidence] = useState(initialExam?.confidence ?? 45);
  const [priority, setPriority] = useState<ExamPriority>(initialExam?.priority ?? "medium");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const topics = topicsText.split(/[\n,]+/).map((topic) => topic.trim()).filter(Boolean);
    onSave({
      id: initialExam?.id,
      subject,
      title,
      date,
      topics,
      confidence,
      priority
    });

    if (!initialExam) {
      setTitle(`${subject || "Next"} test`);
      setTopicsText("");
      setConfidence(45);
      setPriority("medium");
    }
  }

  return (
    <form className="exam-form" onSubmit={handleSubmit}>
      <div className="field-grid">
        <label>
          Subject
          <input value={subject} onChange={(event) => setSubject(event.target.value)} required />
        </label>
        <label>
          Test title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Test date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value as ExamPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="span-2">
          Topics
          <textarea value={topicsText} onChange={(event) => setTopicsText(event.target.value)} rows={3} placeholder="Algebra, functions, graph interpretation" />
        </label>
        <label className="span-2 range-field">
          Confidence: {confidence}%
          <input type="range" min={0} max={100} step={5} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} />
        </label>
      </div>
      <button className="wide-action sticky-mobile-action" type="submit">
        <Plus size={18} />
        {submitLabel}
      </button>
    </form>
  );
}

function CalendarOverview({ exams, plans }: { exams: StudentExam[]; plans: StudyPlan[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, index) => addDaysIso(today, index));
  const tasks = plans.flatMap((plan) => plan.tasks.map((task) => ({ ...task, planId: plan.id })));

  return (
    <div className="calendar-week" role="list" aria-label="Next seven study days">
      {days.map((day) => {
        const dayExams = exams.filter((exam) => exam.date === day);
        const dayTasks = tasks.filter((task) => task.date === day);
        return (
          <article className={day === today ? "calendar-day today" : "calendar-day"} key={day} role="listitem">
            <div className="calendar-day-head">
              <strong>{formatWeekday(day)}</strong>
              <span>{formatDate(day)}</span>
            </div>
            {dayExams.map((exam) => (
              <div className="calendar-event exam" key={exam.id}>
                <small>Test</small>
                <span>{exam.subject}</span>
              </div>
            ))}
            {dayTasks.slice(0, 3).map((task) => (
              <div className="calendar-event task" key={task.id}>
                <small>{task.estimateMinutes} min</small>
                <span>{task.topic}</span>
              </div>
            ))}
            {dayExams.length === 0 && dayTasks.length === 0 ? <p>No planned work</p> : null}
          </article>
        );
      })}
    </div>
  );
}

function TaskChecklist({
  plan,
  onTaskStatus,
  compact = false
}: {
  plan: StudyPlan;
  onTaskStatus: (planId: string, taskId: string, status: TaskStatus) => void;
  compact?: boolean;
}) {
  return (
    <article className={compact ? "task-checklist compact-listing" : "task-checklist"}>
      <div className="task-checklist-head">
        <div>
          <strong>{plan.title}</strong>
          <span>{plan.committedAt ? "Committed plan" : "Draft plan"}</span>
        </div>
        <span>{plan.tasks.filter((task) => task.status === "done").length}/{plan.tasks.length}</span>
      </div>
      <div className="task-list">
        {plan.tasks.map((task) => (
          <label className={task.status === "done" ? "task-row done" : "task-row"} key={task.id}>
            <input
              type="checkbox"
              checked={task.status === "done"}
              onChange={(event) => onTaskStatus(plan.id, task.id, event.target.checked ? "done" : "todo")}
            />
            <span>
              <strong>{task.topic}</strong>
              <small>{formatDate(task.date)} · {task.estimateMinutes} min</small>
            </span>
          </label>
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function MobileToolNav({ activeRoute, onNavigate }: { activeRoute: RoutePath; onNavigate: (route: RoutePath) => void }) {
  return (
    <nav className="bottom-tool-nav" aria-label="Study tools">
      {toolNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.route}
            type="button"
            className={activeRoute === item.route ? "active" : ""}
            onClick={() => onNavigate(item.route)}
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SchoolIntelligencePage({
  exams,
  onNavigate
}: {
  exams: StudentExam[];
  onNavigate: (route: RoutePath) => void;
}) {
  const firstExam = exams[0];
  const [form, setForm] = useState({
    schoolName: "Luxembourg School",
    schoolCity: "Luxembourg",
    schoolYear: "2025-2026",
    subject: firstExam?.subject ?? "Mathematics",
    courseLevel: "upper secondary",
    teacherName: "",
    testTitle: firstExam?.title ?? "",
    testDate: firstExam?.date ?? "",
    topics: firstExam?.topics.join(", ") ?? "definitions, worked examples",
    markObtained: "",
    markMax: "60",
    expectedAnswers: "",
    correctionNotes: "",
    studentReflection: ""
  });
  const [images, setImages] = useState<ResultUploadImage[]>([]);
  const [intelligence, setIntelligence] = useState<SchoolIntelligenceResponse | null>(null);
  const [lastUpload, setLastUpload] = useState<ResultUploadResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const supabaseMode = getBrowserSupabaseMode();
  const supabaseSyncEnabled = isSchoolIntelligenceSupabaseEnabled();
  const [authEmail, setAuthEmail] = useState("");
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const client = getBrowserSupabaseClient();
    if (!client) {
      setAuthUserEmail(null);
      return;
    }

    client.auth.getSession().then(({ data }) => {
      setAuthUserEmail(data.session?.user.email ?? null);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setAuthUserEmail(session?.user.email ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingIntel(true);
    getSchoolIntelligence({ schoolName: form.schoolName, subject: form.subject })
      .then((payload) => {
        if (!cancelled) {
          setIntelligence(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIntelligence(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingIntel(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.schoolName, form.subject]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleImages(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const converted = await Promise.all(Array.from(files).map(fileToResultImage));
    setImages(converted);
    setStatus(`${converted.length} photo${converted.length === 1 ? "" : "s"} ready for private upload.`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (supabaseSyncEnabled && supabaseMode === "supabase-ready" && !authUserEmail) {
      setStatus("Sign in first so Supabase can store the upload under your private user account.");
      return;
    }
    if (images.length === 0) {
      setStatus("Add at least one corrected-test photo first.");
      return;
    }

    setUploading(true);
    setStatus(null);
    try {
      const payload: ResultUploadRequest = {
        schoolName: form.schoolName,
        schoolCity: form.schoolCity,
        schoolYear: form.schoolYear,
        subject: form.subject,
        courseLevel: form.courseLevel,
        teacherName: form.teacherName,
        testTitle: form.testTitle,
        testDate: form.testDate || undefined,
        topics: splitTopics(form.topics),
        markObtained: form.markObtained ? Number(form.markObtained) : undefined,
        markMax: form.markMax ? Number(form.markMax) : undefined,
        expectedAnswers: form.expectedAnswers,
        correctionNotes: form.correctionNotes,
        studentReflection: form.studentReflection,
        images
      };
      const response = await uploadTestResult(payload);
      setLastUpload(response);
      setIntelligence(response.intelligence);
      setStatus(`Extraction complete. ${response.result.sharedSummary}`);
    } catch (requestError) {
      setStatus(requestError instanceof Error ? requestError.message : "Could not upload this result.");
    } finally {
      setUploading(false);
    }
  }

  async function handleReport(tableName: "test_intelligence" | "teacher_correction_patterns" | "common_mistakes" | "expected_answers", recordId: string) {
    const details = window.prompt("What should moderation correct?");
    if (!details) {
      return;
    }

    const response = await reportSchoolIntelligence({
      tableName,
      recordId,
      reason: "wrong_extraction",
      details
    });
    setStatus(response.nextStep);
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authEmail) {
      return;
    }

    setAuthLoading(true);
    try {
      await sendSupabaseMagicLink(authEmail);
      setStatus("Magic link sent. Open it in this browser to sync private uploads.");
    } catch (requestError) {
      setStatus(requestError instanceof Error ? requestError.message : "Could not start Supabase sign-in.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setAuthLoading(true);
    try {
      await signOutSupabaseUser();
      setStatus("Signed out of Supabase.");
    } catch (requestError) {
      setStatus(requestError instanceof Error ? requestError.message : "Could not sign out.");
    } finally {
      setAuthLoading(false);
    }
  }

  const sharedCount = intelligence
    ? intelligence.tests.length +
      intelligence.expectedAnswers.length +
      intelligence.correctionPatterns.length +
      intelligence.commonMistakes.length
    : 0;

  return (
    <DeepDivePage route="/school-intelligence" tone="blue" icon={Database}>
      <div className="school-intel-layout">
        <section className="panel school-upload-panel" data-agent-section="private-result-upload">
          <div className="panel-heading">
            <div>
              <h2>Corrected result upload</h2>
              <p>Photos stay private. Only aggregate patterns can become school intelligence.</p>
            </div>
            <span className="status-chip">{supabaseSyncEnabled ? "Supabase ready" : "Local demo"}</span>
          </div>

          <form className="school-intel-form" onSubmit={handleSubmit}>
            <div className="field-grid">
              <label>
                School
                <input value={form.schoolName} onChange={(event) => updateField("schoolName", event.target.value)} />
              </label>
              <label>
                City
                <input value={form.schoolCity} onChange={(event) => updateField("schoolCity", event.target.value)} />
              </label>
              <label>
                Year
                <input value={form.schoolYear} onChange={(event) => updateField("schoolYear", event.target.value)} />
              </label>
              <label>
                Subject
                <input value={form.subject} onChange={(event) => updateField("subject", event.target.value)} />
              </label>
              <label>
                Teacher
                <input value={form.teacherName} onChange={(event) => updateField("teacherName", event.target.value)} />
              </label>
              <label>
                Test title
                <input value={form.testTitle} onChange={(event) => updateField("testTitle", event.target.value)} />
              </label>
              <label>
                Test date
                <input type="date" value={form.testDate} onChange={(event) => updateField("testDate", event.target.value)} />
              </label>
              <label>
                Course level
                <input value={form.courseLevel} onChange={(event) => updateField("courseLevel", event.target.value)} />
              </label>
              <label>
                Mark
                <input inputMode="decimal" value={form.markObtained} onChange={(event) => updateField("markObtained", event.target.value)} placeholder="42" />
              </label>
              <label>
                Max mark
                <input inputMode="decimal" value={form.markMax} onChange={(event) => updateField("markMax", event.target.value)} placeholder="60" />
              </label>
              <label className="span-2">
                Topics
                <input value={form.topics} onChange={(event) => updateField("topics", event.target.value)} />
              </label>
              <label className="span-2">
                Expected answers
                <textarea value={form.expectedAnswers} onChange={(event) => updateField("expectedAnswers", event.target.value)} rows={5} />
              </label>
              <label className="span-2">
                Correction notes
                <textarea value={form.correctionNotes} onChange={(event) => updateField("correctionNotes", event.target.value)} rows={4} />
              </label>
              <label className="span-2">
                Student reflection
                <textarea value={form.studentReflection} onChange={(event) => updateField("studentReflection", event.target.value)} rows={3} />
              </label>
              <label className="span-2 upload-dropzone">
                Corrected result photos
                <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => handleImages(event.target.files)} />
              </label>
            </div>

            {images.length > 0 ? (
              <div className="image-chip-row" aria-label="Selected result photos">
                {images.map((image) => (
                  <span className="image-chip" key={`${image.name}-${image.size}`}>
                    <Upload size={14} />
                    {image.name}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="action-row sticky-actions">
              <button className="primary-action" type="submit" disabled={uploading}>
                <Upload size={18} />
                {uploading ? "Extracting result" : "Upload result"}
              </button>
              <button className="secondary-action" type="button" onClick={() => onNavigate("/study-planner")}>
                <CalendarDays size={18} />
                Open planner
              </button>
            </div>
          </form>

          {status ? <p className="deck-status">{status}</p> : null}
        </section>

        <aside className="panel school-safety-panel" data-agent-section="privacy-thresholds">
          <div className="panel-heading">
            <div>
              <h2>Privacy boundary</h2>
              <p>Raw uploads are owner-only. Shared guidance needs evidence, confidence, and auditability.</p>
            </div>
          </div>
          {supabaseSyncEnabled ? (
            <form className="auth-card" onSubmit={handleAuthSubmit}>
              <div>
                <LockKeyhole size={20} />
                <span>
                  <strong>{authUserEmail ? "Signed in" : "Supabase sign-in"}</strong>
                  <small>{authUserEmail ?? "Use a magic link before syncing private uploads."}</small>
                </span>
              </div>
              {authUserEmail ? (
                <button className="secondary-action" type="button" onClick={handleSignOut} disabled={authLoading}>
                  Sign out
                </button>
              ) : (
                <>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="student@example.com"
                  />
                  <button className="secondary-action" type="submit" disabled={authLoading}>
                    Send magic link
                  </button>
                </>
              )}
            </form>
          ) : null}
          <div className="safety-stack">
            <article>
              <LockKeyhole size={20} />
              <strong>Private by default</strong>
              <p>Storage paths are per-user. Other students never read original photos or individual marks.</p>
            </article>
            <article>
              <ShieldCheck size={20} />
              <strong>{intelligence?.minEvidence ?? 3}+ evidence threshold</strong>
              <p>Teacher-specific patterns only surface after enough independent uploads.</p>
            </article>
            <article>
              <School size={20} />
              <strong>Careful wording</strong>
              <p>Guidance is phrased as learning advice, not personal criticism of teachers.</p>
            </article>
          </div>

          {lastUpload ? (
            <div className="extraction-card">
              <h3>Latest extraction</h3>
              <div className="confidence-row">
                <span>Confidence</span>
                <strong>{Math.round(lastUpload.result.confidenceScore * 100)}%</strong>
              </div>
              <div className="progress-track">
                <div style={{ width: `${Math.round(lastUpload.result.confidenceScore * 100)}%` }} />
              </div>
              <p>{lastUpload.result.privateFeedback}</p>
              <ul className="clean-list">
                {lastUpload.result.auditTrail.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      <section className="panel" data-agent-section="shared-aggregate-intelligence">
        <div className="panel-heading">
          <div>
            <h2>Shared school intelligence</h2>
            <p>
              {loadingIntel
                ? "Loading safe shared records."
                : `${sharedCount} visible record${sharedCount === 1 ? "" : "s"} passed the threshold.`}
            </p>
          </div>
          <span className="status-chip">{intelligence?.provider ?? "demo-local"}</span>
        </div>

        {sharedCount > 0 && intelligence ? (
          <div className="shared-intel-grid">
            {intelligence.tests.map((record) => (
              <article className="shared-intel-card" key={record.id}>
                <strong>{record.testTitle}</strong>
                <p>{record.correctionStyleSummary}</p>
                <small>{record.evidenceCount} uploads - {Math.round(record.confidenceScore * 100)}% confidence</small>
                <button type="button" onClick={() => handleReport("test_intelligence", record.id)}>
                  Report
                </button>
              </article>
            ))}
            {intelligence.correctionPatterns.map((record) => (
              <article className="shared-intel-card" key={record.id}>
                <strong>Correction pattern</strong>
                <p>{record.guidance}</p>
                <small>{record.evidenceCount} uploads - {Math.round(record.confidenceScore * 100)}% confidence</small>
                <button type="button" onClick={() => handleReport("teacher_correction_patterns", record.id)}>
                  Report
                </button>
              </article>
            ))}
            {intelligence.commonMistakes.map((record) => (
              <article className="shared-intel-card" key={record.id}>
                <strong>{record.topic}</strong>
                <p>{record.mistake}</p>
                <small>{record.recommendedFix}</small>
                <button type="button" onClick={() => handleReport("common_mistakes", record.id)}>
                  Report
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <Database size={34} />
            <h3>No shared records visible yet</h3>
            <p>
              Uploads can still generate private feedback immediately. Shared guidance appears only after the minimum evidence and confidence rules pass.
            </p>
          </div>
        )}
      </section>
    </DeepDivePage>
  );
}

function PowerPointCreator({
  input,
  onChange
}: {
  input: StudyInput;
  onChange: (input: StudyInput) => void;
}) {
  const [audience, setAudience] = useState("Luxembourg secondary students");
  const [goal, setGoal] = useState("Teach this topic clearly with examples from my notes.");
  const [slideCount, setSlideCount] = useState(8);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const deckPreview = buildDeckPreview(input.rawText, input.subject);

  async function handleCreatePowerPoint() {
    setCreating(true);
    setStatus(null);
    try {
      const payload: PowerPointRequest = {
        topic: input.subject,
        rawText: input.rawText,
        audience,
        goal,
        language: input.language,
        level: input.level,
        slideCount
      };
      const { blob, filename } = await createPowerPoint(payload);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(`Created ${slideCount}-slide deck: ${filename}`);
    } catch (requestError) {
      setStatus(requestError instanceof Error ? requestError.message : "Could not create PowerPoint.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="powerpoint-layout">
      <div className="panel powerpoint-builder">
        <div className="panel-heading">
          <div>
            <h2>PowerPoint Creator</h2>
            <p>Feed Kloer your notes and get a topic-specific student deck, not a generic slide shell.</p>
          </div>
          <span className="status-chip">.pptx</span>
        </div>

        <div className="field-grid">
          <label>
            Topic
            <input value={input.subject} onChange={(event) => onChange({ ...input, subject: event.target.value })} />
          </label>
          <label>
            Audience
            <input value={audience} onChange={(event) => setAudience(event.target.value)} />
          </label>
          <label className="span-2">
            Presentation goal
            <input value={goal} onChange={(event) => setGoal(event.target.value)} />
          </label>
          <label>
            Slides
            <select value={slideCount} onChange={(event) => setSlideCount(Number(event.target.value))}>
              <option value={5}>5 slides</option>
              <option value={6}>6 slides</option>
              <option value={8}>8 slides</option>
              <option value={10}>10 slides</option>
            </select>
          </label>
        </div>

        <label className="notes-label">
          Source information
          <textarea
            value={input.rawText}
            onChange={(event) => onChange({ ...input, rawText: event.target.value })}
            rows={14}
          />
        </label>

        <button className="wide-action" onClick={handleCreatePowerPoint} disabled={creating}>
          <Download size={18} />
          {creating ? "Creating deck" : "Create full PowerPoint"}
        </button>
        {status ? <p className="deck-status">{status}</p> : null}
      </div>

      <div className="panel deck-preview">
        <div className="panel-heading">
          <div>
            <h2>Deck plan</h2>
            <p>Kloer extracts these topic-specific anchors before generating the file.</p>
          </div>
        </div>
        <ol className="deck-outline">
          {deckPreview.map((slide) => (
            <li key={slide.title}>
              <strong>{slide.title}</strong>
              <span>{slide.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function buildDeckPreview(rawText: string, topic: string) {
  const sentences = rawText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const terms = rawText
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 5)
    .slice(0, 8);
  const uniqueTerms = Array.from(new Set(terms)).slice(0, 5);

  return [
    {
      title: `${topic} title slide`,
      body: "Opening, audience, goal, and the central idea from the notes."
    },
    {
      title: "Why it matters",
      body: sentences[0] ?? "Kloer will use the first strong sentence as the context."
    },
    {
      title: "Key ideas",
      body: (sentences.slice(0, 3).join(" ") || "The strongest ideas from the source text.").slice(0, 150)
    },
    {
      title: "Concept map",
      body: uniqueTerms.length > 0 ? uniqueTerms.join(", ") : "Important terms extracted from your notes."
    },
    {
      title: "Practice and takeaway",
      body: "The final slides include class questions, common mistakes, and what to remember."
    }
  ];
}

interface AgentConsoleProps {
  input: StudyInput;
  agents: AgentMeta[];
  selectedAgentId: string;
  selectedAgent?: AgentMeta;
  response: AgentRunResponse | null;
  loading: boolean;
  onSelectAgent: (agentId: string) => void;
  onRunAgent: () => void;
}

function AgentConsole({
  input,
  agents,
  selectedAgentId,
  selectedAgent,
  response,
  loading,
  onSelectAgent,
  onRunAgent
}: AgentConsoleProps) {
  return (
    <section className="agent-layout">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Agent registry</h2>
            <p>Every agent starts free-local. Paid providers can be added behind the same API.</p>
          </div>
        </div>

        <div className="agent-list">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={selectedAgentId === agent.id ? "agent-row selected" : "agent-row"}
              onClick={() => onSelectAgent(agent.id)}
            >
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.role}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedAgent?.name ?? "Agent"}</h2>
            <p>{selectedAgent?.role ?? "Select an agent to run it."}</p>
          </div>
          <button className="secondary-action" onClick={onRunAgent} disabled={loading}>
            <FlaskConical size={17} />
            Run agent
          </button>
        </div>

        <div className="code-panel">
          <pre>{JSON.stringify({ agentId: selectedAgentId, input }, null, 2)}</pre>
        </div>

        {response ? (
          <div className="code-panel response">
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface LaunchBoardProps {
  email: string;
  leadSignal: string | null;
  onEmailChange: (email: string) => void;
  onWaitlist: () => void;
}

function LaunchBoard({ email, leadSignal, onEmailChange, onWaitlist }: LaunchBoardProps) {
  return (
    <section className="launch-layout">
      <div className="panel launch-main">
        <div className="panel-heading">
          <div>
            <h2>Business execution board</h2>
            <p>Built around a Luxembourg-first wedge and a low-cost validation path.</p>
          </div>
        </div>

        <div className="pillar-grid">
          {launchPillars.map((pillar) => (
            <article className="mini-card" key={pillar.title}>
              <Library size={20} />
              <strong>{pillar.title}</strong>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>

        <h3>Launch sequence</h3>
        <ol className="plan-list">
          {launchSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Beta lead capture</h2>
            <p>Simple endpoint for early validation and interviews.</p>
          </div>
        </div>

        <label>
          Student email
          <input value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="name@example.com" />
        </label>
        <button className="wide-action" onClick={onWaitlist}>
          <ClipboardList size={18} />
          Score beta lead
        </button>

        {leadSignal ? <p className="lead-signal">{leadSignal}</p> : null}

        <div className="compliance-box">
          <ShieldCheck size={20} />
          <p>
            Keep the first release as self-study support. Add parental consent, retention controls, and human review
            before working with minors at scale.
          </p>
        </div>
      </div>
    </section>
  );
}

function fileToResultImage(file: File): Promise<ResultUploadImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type || "image/jpeg",
        size: file.size,
        dataUrl: String(reader.result)
      });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function splitTopics(value: string) {
  return value
    .split(/,|\n|;/)
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function useAppRoute(): [RoutePath, (route: RoutePath) => void] {
  const [route, setRoute] = useState<RoutePath>(() => routeFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(nextRoute: RoutePath) {
    const browserPath = toBrowserPath(nextRoute);
    if (window.location.pathname !== browserPath) {
      window.history.pushState({}, "", browserPath);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return [route, navigate];
}

function routeFromPath(pathname: string): RoutePath {
  const appPath = stripBasePath(pathname);
  const normalized = (appPath.replace(/\/+$/, "") || "/") as RoutePath;
  return supportedRoutes.has(normalized) ? normalized : "/";
}

function normalizeBasePath(baseUrl: string) {
  const withoutTrailingSlash = baseUrl.replace(/\/+$/, "");
  return withoutTrailingSlash === "" ? "" : withoutTrailingSlash;
}

function stripBasePath(pathname: string) {
  if (!appBasePath || appBasePath === "/") {
    return pathname;
  }

  if (pathname === appBasePath) {
    return "/";
  }

  if (pathname.startsWith(`${appBasePath}/`)) {
    return pathname.slice(appBasePath.length) || "/";
  }

  return pathname;
}

function toBrowserPath(route: RoutePath) {
  if (!appBasePath || appBasePath === "/") {
    return route;
  }

  return route === "/" ? `${appBasePath}/` : `${appBasePath}${route}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function describeDaysUntil(value: string) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`).getTime();
  const target = new Date(`${value}T12:00:00`).getTime();
  const days = Math.ceil((target - today) / dayMs);

  if (days < 0) {
    return "already due";
  }
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day";
  }
  return `${days} days`;
}

export default App;
