import { chromium } from "playwright";

const baseUrl = process.env.KLOER_WEB_URL ?? "http://127.0.0.1:5173";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await page.getByRole("button", { name: /Switch quote/i }).click();
  await page.getByText("The best test prep starts before you reread,").waitFor({ timeout: 5000 });

  await page.getByRole("button", { name: /Open Tutor/i }).click();
  await page.waitForURL("**/ai-tutor");
  await page.getByText(/I do not have your upcoming tests yet/i).waitFor({ timeout: 5000 });
  await page.getByLabel("Subject").fill("Mathematics");
  await page.getByLabel("Test title").fill("Functions quiz");
  await page.getByLabel("Topics").fill("linear functions, slope, graph reading");
  await page.getByRole("button", { name: /Save test for tutor/i }).click();
  await page.getByText(/Great. I can now plan around Functions quiz/i).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: /Generate plan/i }).click();
  await page.getByText(/I created/i).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: /I commit to this plan/i }).click();
  await page.getByText(/Committed\. Your tasks/i).waitFor({ timeout: 5000 });
  await page.locator(".task-row input").first().check();

  await page.goto(`${baseUrl}/study-planner`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Calendar overview/i }).waitFor({ timeout: 5000 });
  await page.getByText("Functions quiz").first().waitFor({ timeout: 5000 });

  await page.goto(`${baseUrl}/smart-practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Flashcards/i }).click();
  await page.locator(".big-flashcard").click();
  await page.getByRole("button", { name: /I knew it/i }).click();
  await page.getByText(/Marked correct/i).waitFor({ timeout: 5000 });

  await page.goto(`${baseUrl}/progress-hub`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Progress formula/i }).waitFor({ timeout: 5000 });
  await page.getByText("Practice accuracy", { exact: true }).waitFor({ timeout: 5000 });

  await page.goto(`${baseUrl}/school-intelligence`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: /School Intelligence/i }).waitFor({ timeout: 5000 });
  await page.getByLabel("Teacher").fill("Mme Demo");
  await page.getByLabel("Expected answers").fill("Exact definition of linear function; one worked slope example");
  await page.getByLabel("Correction notes").fill("Teacher rewards exact definitions and visible method steps.");
  await page.getByLabel("Mark", { exact: true }).fill("48");
  await page.getByLabel("Corrected result photos").setInputFiles({
    name: "corrected-result.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lB2uWQAAAABJRU5ErkJggg==",
      "base64"
    )
  });
  await page.getByRole("button", { name: /Upload result/i }).click();
  await page.getByText(/Extraction complete/i).waitFor({ timeout: 10000 });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Generate Session/i }).click();
  await page.getByText("Summary").waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: /PowerPoint/i }).click();
  await page.waitForURL("**/powerpoint");
  await page.getByRole("heading", { level: 1, name: /PowerPoint Creator/i }).waitFor({ timeout: 10000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Create full PowerPoint/i }).click();
  const download = await downloadPromise;
  if (!download.suggestedFilename().endsWith(".pptx")) {
    throw new Error(`Unexpected PowerPoint filename: ${download.suggestedFilename()}`);
  }

  await page.getByRole("button", { name: /Agent API/i }).click();
  await page.waitForURL("**/agents");
  await page.getByRole("button", { name: /Run agent/i }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Run agent/i }).click();
  await page.getByText("free-local-template").waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: /Launch Board/i }).click();
  await page.waitForURL("**/launch");
  await page.getByPlaceholder("name@example.com").fill("student@example.com");
  await page.getByRole("button", { name: /Score beta lead/i }).click();
  await page.getByText(/Lead score/i).waitFor({ timeout: 10000 });

  console.log(`Smoke test passed against ${baseUrl}`);
} finally {
  await browser.close();
}
