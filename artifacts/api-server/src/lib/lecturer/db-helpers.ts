import { eq } from "drizzle-orm";
import { db, lecturerJobsTable, type LecturerJob } from "@workspace/db";
import type { SlideData, IntegrityReport } from "./types.js";

export async function getJob(id: string): Promise<LecturerJob | null> {
  const [job] = await db
    .select()
    .from(lecturerJobsTable)
    .where(eq(lecturerJobsTable.id, id));
  return job ?? null;
}

export async function updateJob(
  id: string,
  updates: Partial<{
    status: string;
    progressStep: string | null;
    progressPct: number | null;
    extractedTextCount: number | null;
    extractedImageCount: number | null;
    slideCount: number | null;
    slidesJson: SlideData[] | null;
    integrityJson: IntegrityReport | null;
    pptxPath: string | null;
    error: string | null;
  }>,
): Promise<void> {
  await db
    .update(lecturerJobsTable)
    .set({ ...updates, updatedAt: new Date() } as Partial<LecturerJob>)
    .where(eq(lecturerJobsTable.id, id));
}
