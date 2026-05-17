# Free Provider Stack

Kloer now uses a provider-safe API layer:

- Study sessions and agents: Express API when available, browser-local deterministic generation on static hosts.
- OCR: Tesseract.js in the browser, so note photos can be transcribed without a paid OCR API.
- PowerPoint: Express API when available, PptxGenJS in the browser on static hosts.
- School intelligence: Supabase when configured, browser-local demo storage on static hosts.

## Static Hosting

GitHub Pages is static, so the workflow builds with:

```bash
VITE_API_MODE=static
```

That prevents the frontend from calling missing `/api/*` routes and removes noisy 404 banners. When an API host exists, unset `VITE_API_MODE` and set:

```bash
VITE_API_BASE_URL=https://your-api-host.example
```

## Current Free API Choices

- Tesseract.js is the best no-key OCR choice for privacy-first beta use because it runs locally in the browser.
- PptxGenJS is the best no-key PPTX choice because it works in both Node and browser builds.
- Supabase remains the best free-tier database target for Auth, Postgres, Storage, and RLS.
- Hugging Face Inference Providers are the best optional free-tier hosted model path when you want cloud LLMs later, but Kloer does not require them for the free beta.
