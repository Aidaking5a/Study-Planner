import { createWorker, PSM } from "tesseract.js";
import type { StudyLanguage } from "../types";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  wordCount: number;
}

const languageCodes: Record<StudyLanguage, string[]> = {
  en: ["eng"],
  fr: ["fra", "eng"],
  de: ["deu", "eng"],
  "lb-simple": ["deu", "fra", "eng"]
};

export async function transcribeNoteImage(
  file: File,
  language: StudyLanguage,
  onProgress: (progress: OcrProgress) => void
): Promise<OcrResult> {
  onProgress({ status: "Preparing image", progress: 0 });

  const worker = await createWorker(languageCodes[language], 1, {
    logger: (message) => {
      onProgress({
        status: normalizeStatus(message.status),
        progress: Math.round((message.progress ?? 0) * 100)
      });
    }
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT
    });

    const result = await worker.recognize(file);
    const text = cleanOcrText(result.data.text);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    onProgress({ status: "Transcription ready", progress: 100 });

    return {
      text,
      confidence: Math.round(result.data.confidence),
      wordCount
    };
  } finally {
    await worker.terminate();
  }
}

function cleanOcrText(text: string) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeStatus(status: string) {
  if (status.includes("loading")) {
    return "Loading OCR engine";
  }

  if (status.includes("initializing")) {
    return "Starting OCR";
  }

  if (status.includes("recognizing")) {
    return "Reading notes";
  }

  return status.replace(/^\w/, (letter) => letter.toUpperCase());
}
