import app from "./app";
import { logger } from "./lib/logger";
import { hasDatabase, pool } from "@workspace/db";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureDatabaseSchema(): Promise<void> {
  if (!hasDatabase) {
    logger.warn(
      "DATABASE_URL is not configured; health checks and the web interface remain available, but lecturer jobs are disabled",
    );
    return;
  }

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

  // Processing currently runs inside this web process. If the process restarts,
  // those in-memory tasks cannot resume. Mark their database rows as failed
  // instead of leaving the UI permanently stuck at the last percentage.
  const orphaned = await pool.query(`
    UPDATE lecturer_jobs
    SET
      status = 'failed',
      progress_step = NULL,
      error = 'Processing was interrupted because the server restarted. Please upload the document again.',
      updated_at = now()
    WHERE status IN ('pending', 'extracting', 'analyzing', 'generating')
    RETURNING id
  `);

  if (orphaned.rowCount) {
    logger.warn(
      { orphanedJobs: orphaned.rowCount },
      "Marked interrupted lecturer jobs as failed",
    );
  }
}

async function start(): Promise<void> {
  try {
    await ensureDatabaseSchema();
    if (hasDatabase) logger.info("Database schema is ready");
  } catch (err) {
    logger.error(
      { err },
      "Database initialization failed; continuing with database-backed routes unavailable",
    );
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
