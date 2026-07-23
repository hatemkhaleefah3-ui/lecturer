import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { v4 as uuid } from "uuid";
import { db, lecturerJobsTable } from "@workspace/db";
import {
  CreateLecturerJobResponse,
  GetLecturerJobResponse,
  GetLecturerJobParams,
  GetLecturerSlidesParams,
  GetLecturerSlidesResponse,
  DownloadLecturerPptxParams,
} from "@workspace/api-zod";
import { processJob, PPTX_DIR } from "../../lib/lecturer/processor.js";
import { getJob } from "../../lib/lecturer/db-helpers.js";

const UPLOAD_DIR = "/tmp/lecturer-uploads";

// Ensure upload dir exists on startup
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".pptx", ".txt", ".md"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(", ")}`));
    }
  },
});

function mapJob(job: Awaited<ReturnType<typeof getJob>>) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progressStep: job.progressStep ?? null,
    progressPct: job.progressPct ?? null,
    inputFilename: job.inputFilename,
    extractedTextCount: job.extractedTextCount ?? null,
    extractedImageCount: job.extractedImageCount ?? null,
    slideCount: job.slideCount ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

const router: IRouter = Router();

// POST /lecturer/jobs — upload file + create job
router.post(
  "/lecturer/jobs",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const jobId = uuid();
    const now = new Date();

    const [job] = await db
      .insert(lecturerJobsTable)
      .values({
        id: jobId,
        status: "pending",
        inputFilename: req.file.originalname,
        inputMimetype: req.file.mimetype,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    req.log.info({ jobId, filename: req.file.originalname }, "Job created");

    // Fire-and-forget async processing
    setImmediate(() => {
      processJob(jobId, req.file!.path, req.file!.originalname, req.file!.mimetype);
    });

    res.status(201).json(CreateLecturerJobResponse.parse(mapJob(job)));
  },
);

// GET /lecturer/jobs/:jobId — get job status
router.get("/lecturer/jobs/:jobId", async (req, res): Promise<void> => {
  const params = GetLecturerJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = await getJob(params.data.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetLecturerJobResponse.parse(mapJob(job)));
});

// GET /lecturer/jobs/:jobId/slides — get slides JSON
router.get("/lecturer/jobs/:jobId/slides", async (req, res): Promise<void> => {
  const params = GetLecturerSlidesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = await getJob(params.data.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status !== "completed") {
    res.status(409).json({ error: `Job is not complete. Status: ${job.status}` });
    return;
  }

  if (!job.slidesJson || !job.integrityJson) {
    res.status(409).json({ error: "Slides not yet available" });
    return;
  }

  res.json(
    GetLecturerSlidesResponse.parse({
      slides: job.slidesJson,
      integrity: job.integrityJson,
    }),
  );
});

// GET /lecturer/jobs/:jobId/download — download .pptx
router.get("/lecturer/jobs/:jobId/download", async (req, res): Promise<void> => {
  const params = DownloadLecturerPptxParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = await getJob(params.data.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status !== "completed" || !job.pptxPath) {
    res.status(409).json({ error: "PPTX not ready. Job status: " + job.status });
    return;
  }

  try {
    await fs.access(job.pptxPath);
  } catch {
    res.status(404).json({ error: "PPTX file not found on disk" });
    return;
  }

  const baseName = path.basename(job.inputFilename, path.extname(job.inputFilename));
  const downloadName = `${baseName}-deck.pptx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(downloadName)}"`,
  );

  const stream = createReadStream(job.pptxPath);
  stream.on("error", (err) => {
    req.log.error({ err }, "Failed to stream PPTX file");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream file" });
    }
  });
  stream.pipe(res);
});

export default router;
