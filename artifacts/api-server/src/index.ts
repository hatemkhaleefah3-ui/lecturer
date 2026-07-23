import express, { type RequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(currentDir, "../public");
const frontendIndex = path.join(frontendDir, "index.html");

const requestLogger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: (...args: unknown[]) => console.debug(...args),
  child: () => requestLogger,
};

app.use((req, _res, next) => {
  (req as unknown as { log: unknown }).log = requestLogger;
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

let databaseReady: Promise<void> | undefined;
let lecturerRouter: Promise<RequestHandler> | undefined;
let converterRouter: Promise<RequestHandler> | undefined;

function ensureDatabase(): Promise<void> {
  databaseReady ??= import("@workspace/db").then(async ({ pool }) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lecturer_jobs (
        id text PRIMARY KEY,
        status text NOT NULL DEFAULT 'pending',
        progress_step text,
        progress_pct integer,
        input_filename text NOT NULL,
        input_mimetype text,
        extracted_text_count integer,
        extracted_image_count integer,
        slide_count integer,
        slides_json jsonb,
        integrity_json jsonb,
        pptx_path text,
        error text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
  });

  return databaseReady;
}

function getLecturerRouter(): Promise<RequestHandler> {
  lecturerRouter ??= import("./routes/lecturer/index.js").then(
    ({ default: router }) => router as unknown as RequestHandler,
  );
  return lecturerRouter;
}

function getConverterRouter(): Promise<RequestHandler> {
  converterRouter ??= import("./routes/lecturer/convert.js").then(
    ({ default: router }) => router as unknown as RequestHandler,
  );
  return converterRouter;
}

// Stateless conversion is mounted before the optional database-backed job API.
app.use("/api", async (req, res, next) => {
  if (req.method === "POST" && req.path === "/lecturer/convert") {
    try {
      const router = await getConverterRouter();
      router(req, res, next);
    } catch (error) {
      console.error("Failed to initialize stateless Lecturer converter", error);
      res.status(500).json({ error: "Failed to initialize document conversion" });
    }
    return;
  }

  if (!req.path.startsWith("/lecturer")) {
    next();
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(503).json({
      error:
        "The legacy job API requires DATABASE_URL. Use POST /api/lecturer/convert for stateless conversion.",
    });
    return;
  }

  try {
    await ensureDatabase();
    const router = await getLecturerRouter();
    router(req, res, next);
  } catch (error) {
    console.error("Failed to initialize Lecturer API", error);
    res.status(500).json({ error: "Failed to initialize Lecturer API" });
  }
});

app.use(express.static(frontendDir));
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api") &&
    req.accepts("html")
  ) {
    res.sendFile(frontendIndex, (error) => {
      if (error) next(error);
    });
    return;
  }

  next();
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled request error", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

if (!process.env.VERCEL) {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, () => {
    console.info(`Lecturer server listening on port ${port}`);
  });
}

export default app;
