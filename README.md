# Lecturer

Lecturer converts any lecture file into a professionally redesigned PowerPoint deck using the Gemini AI API. Upload a PDF, DOCX, PPTX, TXT, or Markdown file — the app extracts all text and images, sends them to Gemini for intelligent restructuring, and returns a polished, editable `.pptx` you can download immediately.

## Features

- **Supported input formats:** `.pdf`, `.docx`, `.pptx`, `.txt`, `.md`
- **7 monochrome slide types:** Title, Section Header, Content, Data Table, Chart, Comparison, Callout
- **AI-driven restructuring:** Gemini reorganizes content into a logical deck — it does not preserve the original file order
- **Data integrity check:** After generation, the app verifies every extracted text block and image was placed in a slide, with a visible inventory count
- **In-browser preview:** Preview all slides before downloading
- **Editable PPTX output:** Real PowerPoint format via `pptxgenjs`, not flattened images

## Architecture

```
artifacts/lecturer-app/          # React + Vite frontend
artifacts/api-server/            # Express 5 API backend
  src/
    routes/lecturer/             # Upload, status, slides, download endpoints
    lib/lecturer/
      parser.ts                  # File parsing (PDF/DOCX/PPTX/TXT/MD)
      gemini.ts                  # Gemini API call → structured JSON slides
      pptx-generator.ts          # pptxgenjs PPTX rendering (7 slide types)
      processor.ts               # Async pipeline orchestrator
      db-helpers.ts              # Job status updates
lib/db/src/schema/lecturer-jobs.ts   # PostgreSQL job tracking (Drizzle ORM)
lib/api-spec/openapi.yaml            # OpenAPI contract (source of truth)
```

### Processing Pipeline

1. **Upload** → file saved to `/tmp/lecturer-uploads/`, job record created in PostgreSQL
2. **Extract** → parse file type to get text blocks + images with proximity metadata
3. **Analyze** → send text + image thumbnails to Gemini 2.5 Flash; receive structured JSON slide outline
4. **Generate** → render JSON into `.pptx` with `pptxgenjs` using monochrome theme
5. **Integrity check** → verify every text block and image is placed; report unplaced items

## Setup

### 1. Add your Gemini API key

In Replit, go to **Secrets** and add:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get a key at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

The key is never hardcoded — it is read from `process.env.GEMINI_API_KEY` at runtime.

### 2. Database

A PostgreSQL database is pre-provisioned. Run schema migrations with:

```bash
pnpm --filter @workspace/db run push
```

### 3. Run locally

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend (in another terminal)
pnpm --filter @workspace/lecturer-app run dev
```

### 4. Codegen (after OpenAPI changes)

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Tech Stack

- **Frontend:** React 19, Vite, TanStack Query, wouter, Tailwind CSS, shadcn/ui
- **Backend:** Express 5, Node.js 24, TypeScript 5.9
- **AI:** Google Gemini 2.5 Flash (`@google/genai`)
- **PPTX generation:** `pptxgenjs`
- **File parsing:** `pdf-parse`, `mammoth`, `jszip` (DOCX/PPTX)
- **Database:** PostgreSQL + Drizzle ORM
- **Monorepo:** pnpm workspaces
