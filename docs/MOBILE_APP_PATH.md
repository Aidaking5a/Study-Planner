# Mobile App Migration Path

Kloer should start as a mobile-first PWA, then move to a native wrapper only after students prove the workflow.

## Why PWA first

Most students are on phones, but a native app too early slows down validation. The current app is prepared as a PWA:

- portrait-first layout;
- touch-sized controls;
- installable manifest;
- camera/photo note capture;
- client-side OCR;
- no paid AI key needed for beta.

This lets you test with real students before choosing App Store and Play Store infrastructure.

## Current mobile workflow

1. Student opens Kloer on their phone.
2. Student taps Camera or Image.
3. OCR runs locally with Tesseract.js.
4. The extracted text fills the notes field.
5. The free agent API creates a concrete plan, flashcards, and quiz prompts.

The note photo does not need to be sent to the server in this beta flow.

## Stage 1: PWA beta

Use the current stack:

- React + Vite frontend;
- Express API;
- Tesseract.js client OCR;
- free local agent provider.

Ship this to 20-50 students through a normal URL. Ask them to add it to the home screen.

Add before a public beta:

- local history for recent study sessions;
- better OCR retry flow;
- analytics events for capture, OCR success, plan generated, and return usage;
- privacy copy for minors and parents.

## Stage 2: Capacitor wrapper

When phone usage is proven, wrap the same web app with Capacitor.

Good reasons to move to Capacitor:

- smoother camera access;
- app icon and home-screen presence;
- push notifications for study reminders;
- App Store and Play Store distribution;
- minimal rewrite.

Recommended native plugins:

- Camera;
- Filesystem;
- Preferences;
- Local Notifications;
- App;
- Haptics.

Keep the agent API unchanged. The mobile app should call the same `/api/study/session` and `/api/agents/run` endpoints.

## Stage 3: Native rewrite only if needed

Do not rewrite in React Native or native Swift/Kotlin until you have a reason:

- offline OCR and study generation must be more reliable;
- phone performance becomes a growth blocker;
- school/parent security requirements demand deeper native controls;
- you need native widgets, background work, or device-level integrations.

## Product priorities for students

1. Camera capture must be faster than typing.
2. OCR must be editable before planning.
3. The study plan must be concrete and short.
4. The app must work one-handed.
5. The app must feel private enough for school notes.

## Data guardrails

- Process OCR locally when possible.
- Store only the extracted text if the user saves a session.
- Delete original note images by default.
- Add parental authorization before accounts for under-16 users.
- Avoid official grading, ranking, or school placement features.
