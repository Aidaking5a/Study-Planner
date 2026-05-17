import type { PowerPointRequest, StudyInput } from "../types";
import { createLocalStudySession } from "./localStudyProvider";

interface LocalDeckSlide {
  title: string;
  subtitle?: string;
  bullets: string[];
  note?: string;
}

export async function createLocalPowerPoint(payload: PowerPointRequest) {
  const pptxModule = await import("pptxgenjs");
  const PptxGenJS = ((pptxModule as any).default ?? pptxModule) as new () => any;
  const pptx = new PptxGenJS();
  const studyInput: StudyInput = {
    rawText: payload.rawText,
    subject: payload.topic,
    level: payload.level,
    language: payload.language,
    goals: [payload.goal, "presentation"]
  };
  const session = createLocalStudySession(studyInput);
  const outline = buildDeckOutline(payload, session).slice(0, payload.slideCount);

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Kloer Study";
  pptx.company = "Kloer";
  pptx.subject = payload.topic;
  pptx.title = `${payload.topic} - Kloer presentation`;
  pptx.lang = payload.language === "fr" ? "fr-FR" : payload.language === "de" ? "de-DE" : "en-US";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-US"
  };

  addTitleSlide(pptx, payload, session.summary);
  for (const slide of outline.slice(1)) {
    addContentSlide(pptx, slide, payload.topic);
  }

  const output = await pptx.write({ outputType: "blob" });
  const blob = output instanceof Blob ? output : new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });

  return {
    blob,
    filename: buildPowerPointFilename(payload.topic)
  };
}

function addTitleSlide(pptx: any, request: PowerPointRequest, summary: string) {
  const slide = pptx.addSlide();
  addBackground(pptx, slide);
  addAccent(pptx, slide, "7C5CFF");
  slide.addText(request.topic, {
    x: 0.7,
    y: 0.75,
    w: 7.4,
    h: 1,
    fontFace: "Aptos Display",
    fontSize: 36,
    bold: true,
    color: "FFFFFF",
    margin: 0.03
  });
  slide.addText(request.goal, {
    x: 0.74,
    y: 1.68,
    w: 6.8,
    h: 0.42,
    fontSize: 15,
    color: "C9D1FF",
    margin: 0.03
  });
  slide.addText(`For: ${request.audience}`, {
    x: 0.74,
    y: 2.22,
    w: 4.6,
    h: 0.35,
    fontSize: 12,
    color: "8EECE0",
    bold: true,
    margin: 0.03
  });
  slide.addText(summary, {
    x: 0.78,
    y: 3.18,
    w: 5.5,
    h: 1.5,
    fontSize: 14,
    color: "FFFFFF",
    breakLine: false,
    fit: "shrink",
    margin: 0.08,
    valign: "mid"
  });
  slide.addText("Kloer", {
    x: 9.1,
    y: 2.1,
    w: 1.8,
    h: 0.5,
    color: "FFFFFF",
    fontSize: 24,
    bold: true,
    align: "center",
    margin: 0
  });
  addFooter(slide, request.topic);
}

function addContentSlide(pptx: any, deckSlide: LocalDeckSlide, topic: string) {
  const slide = pptx.addSlide();
  addBackground(pptx, slide);
  addAccent(pptx, slide, "5DEBDC");
  slide.addText(deckSlide.title, {
    x: 0.7,
    y: 0.58,
    w: 10.7,
    h: 0.55,
    fontFace: "Aptos Display",
    fontSize: 25,
    bold: true,
    color: "FFFFFF",
    margin: 0.03
  });

  if (deckSlide.subtitle) {
    slide.addText(deckSlide.subtitle, {
      x: 0.72,
      y: 1.16,
      w: 9.6,
      h: 0.34,
      fontSize: 12,
      color: "AAB6E8",
      margin: 0.03
    });
  }

  deckSlide.bullets.slice(0, 5).forEach((bullet, index) => {
    const y = 1.75 + index * 0.78;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.82,
      y: y + 0.08,
      w: 0.22,
      h: 0.22,
      fill: { color: index % 2 === 0 ? "7C5CFF" : "5DEBDC" },
      line: { color: "FFFFFF", transparency: 100 }
    });
    slide.addText(bullet, {
      x: 1.2,
      y,
      w: 9.3,
      h: 0.45,
      fontSize: 15,
      color: "F4F7FF",
      fit: "shrink",
      margin: 0.03,
      breakLine: false
    });
  });

  if (deckSlide.note) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.1,
      y: 5.55,
      w: 4.8,
      h: 0.78,
      rectRadius: 0.08,
      fill: { color: "15214A", transparency: 8 },
      line: { color: "5061AA", transparency: 22, width: 1 }
    });
    slide.addText(deckSlide.note, {
      x: 7.35,
      y: 5.74,
      w: 4.25,
      h: 0.35,
      fontSize: 11,
      color: "C9D1FF",
      fit: "shrink",
      margin: 0
    });
  }

  addFooter(slide, topic);
}

function addBackground(pptx: any, slide: any) {
  slide.background = { color: "080E20" };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.34,
    h: 7.5,
    fill: { color: "080E20" },
    line: { color: "080E20", transparency: 100 }
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.42,
    y: 0.34,
    w: 12.5,
    h: 6.78,
    rectRadius: 0.12,
    fill: { color: "121B3A", transparency: 8 },
    line: { color: "38477E", transparency: 18, width: 1 }
  });
}

function addAccent(pptx: any, slide: any, color: string) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.42,
    y: 0.34,
    w: 0.08,
    h: 6.78,
    fill: { color },
    line: { color, transparency: 100 }
  });
}

function addFooter(slide: any, topic: string) {
  slide.addText(`Kloer Study - ${topic}`, {
    x: 0.72,
    y: 6.78,
    w: 6,
    h: 0.24,
    fontSize: 8.5,
    color: "7F8AB5",
    margin: 0
  });
}

function buildDeckOutline(request: PowerPointRequest, session: ReturnType<typeof createLocalStudySession>): LocalDeckSlide[] {
  const sentences = splitSentences(request.rawText);
  const keywords = extractKeywords(request.rawText);
  const examples = sentences.filter((sentence) => sentence.length > 35).slice(0, 4);
  const quizBullets = session.quiz.slice(0, 4).map((question) => question.prompt);
  const specificKeywords = keywords.slice(0, 6).join(", ");

  return [
    {
      title: request.topic,
      subtitle: request.goal,
      bullets: [session.summary],
      note: `Audience: ${request.audience}`
    },
    {
      title: `Why ${request.topic} matters`,
      subtitle: "Opening context based on your notes",
      bullets: [
        session.summary,
        `Main vocabulary from the notes: ${specificKeywords || request.topic}.`,
        examples[0] ?? `Connect ${request.topic} to a real classroom example.`
      ],
      note: "Start with the problem before definitions."
    },
    {
      title: "Key ideas to explain",
      subtitle: "Use these as your main speaking points",
      bullets: session.keyIdeas.map(stripIdeaPrefix),
      note: "Each point should become one spoken example."
    },
    {
      title: "Concept map",
      subtitle: "How the important terms connect",
      bullets: keywords.slice(0, 5).map((keyword, index) => {
        const supporting = sentences[index % Math.max(sentences.length, 1)] ?? request.rawText.slice(0, 120);
        return `${titleCase(keyword)}: ${supporting}`;
      }),
      note: "Do not list terms alone; explain the link."
    },
    {
      title: "Evidence and examples",
      subtitle: "Details pulled from the student's source material",
      bullets: examples.length > 0 ? examples : session.keyIdeas.map(stripIdeaPrefix),
      note: "Use examples to avoid a generic presentation."
    },
    {
      title: "Common mistakes",
      subtitle: "What the audience should not confuse",
      bullets: session.weakSpots,
      note: "Turn weak spots into warning signs."
    },
    {
      title: "Practice check",
      subtitle: "Questions for the class or revision session",
      bullets: quizBullets.length > 0 ? quizBullets : ["Ask the audience to define the hardest term in their own words."],
      note: "Use active recall instead of rereading."
    },
    {
      title: "Concrete study plan",
      subtitle: "What to do after the presentation",
      bullets: session.studyPlan,
      note: "End with action, not only summary."
    }
  ];
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 18);
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 4);
  return Array.from(new Set(words)).slice(0, 10);
}

function buildPowerPointFilename(topic: string) {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  return `${slug || "kloer-presentation"}.pptx`;
}

function stripIdeaPrefix(value: string) {
  return value.replace(/^Idea \d+:\s*/i, "");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
