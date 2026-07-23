import * as React from "react"
import { useLocation } from "wouter"
import { UploadCloud } from "lucide-react"
import { useCreateLecturerJob } from "@workspace/api-client-react"

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const candidate = error as {
      error?: unknown
      message?: unknown
      data?: { error?: unknown }
      response?: { data?: { error?: unknown } }
    }
    const value =
      candidate.response?.data?.error ??
      candidate.data?.error ??
      candidate.error ??
      candidate.message
    if (typeof value === "string" && value.trim()) return value
  }
  return "Upload failed. Please try again."
}

export function UploadPage() {
  const [, setLocation] = useLocation()
  const createJob = useCreateLecturerJob()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = React.useState(false)

  const submitFile = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      return
    }
    createJob.mutate(
      { data: { file } },
      {
        onSuccess: (job) => setLocation(`/jobs/${job.id}`),
      },
    )
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === "dragenter" || e.type === "dragover")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) submitFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    const file = e.target.files?.[0]
    if (file) submitFile(file)
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-2xl space-y-12">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-primary">Lecturer</h1>
          <p className="text-muted-foreground text-lg sm:text-xl font-medium tracking-tight">
            Restructure dense academic documents into precise presentation decks.
          </p>
        </div>

        <div
          className={`relative flex flex-col items-center justify-center p-12 sm:p-24 border-2 border-dashed transition-colors cursor-pointer ${
            dragActive
              ? "border-primary bg-accent/50"
              : "border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/20"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.pptx,.txt,.md"
            onChange={handleChange}
          />

          <div className="flex flex-col items-center space-y-6 text-center pointer-events-none">
            <div className="p-4 bg-secondary rounded-full">
              <UploadCloud className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold tracking-tight">Upload your document</h3>
              <p className="text-sm text-muted-foreground">Drag and drop a file here, or click to browse.</p>
              <p className="text-xs text-muted-foreground">Maximum file size: 50 MB</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {[".pdf", ".docx", ".pptx", ".txt", ".md"].map((ext) => (
                <span key={ext} className="px-2 py-1 text-xs font-mono font-medium tracking-wider bg-accent text-accent-foreground border border-border">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        </div>

        {createJob.isPending && (
          <div className="p-4 bg-secondary text-sm font-medium text-center">Uploading document…</div>
        )}

        {createJob.isError && (
          <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium text-center">
            {getErrorMessage(createJob.error)}
          </div>
        )}
      </div>
    </div>
  )
}
