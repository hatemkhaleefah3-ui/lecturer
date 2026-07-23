import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureDatabaseSchema(): Promise<void> {
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

  // Processing currently runs inside this web process. If Render restarts the
  // instance, those in-memory tasks cannot resume. Mark their database rows as
  // failed instead of leaving the UI permanently stuck at the last percentage.
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
    logger.info("Database schema is ready");
  } catch (err) {
    logger.error({ err }, "Failed to initialize database schema");
    process.exit(1);
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