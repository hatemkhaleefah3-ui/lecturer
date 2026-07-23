import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const lecturerJobsTable = pgTable("lecturer_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"),
  progressStep: text("progress_step"),
  progressPct: integer("progress_pct"),
  inputFilename: text("input_filename").notNull(),
  inputMimetype: text("input_mimetype"),
  extractedTextCount: integer("extracted_text_count"),
  extractedImageCount: integer("extracted_image_count"),
  slideCount: integer("slide_count"),
  slidesJson: jsonb("slides_json"),
  integrityJson: jsonb("integrity_json"),
  pptxPath: text("pptx_path"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LecturerJob = typeof lecturerJobsTable.$inferSelect;
export type InsertLecturerJob = typeof lecturerJobsTable.$inferInsert;
