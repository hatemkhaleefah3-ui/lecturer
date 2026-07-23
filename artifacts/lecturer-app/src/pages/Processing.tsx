import * as React from "react"
import { useRoute, useLocation } from "wouter"
import { useGetLecturerJob, getGetLecturerJobQueryKey } from "@workspace/api-client-react"
import { Progress } from "@/components/ui/progress"
import { FileText, Image as ImageIcon, LayoutTemplate, AlertTriangle } from "lucide-react"

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "error" in error) {
    const value = (error as { error?: unknown }).error
    if (typeof value === "string") return value
  }
  return "An unknown error occurred."
}

function isTransientServerError(error: unknown): boolean {
  const message = errorMessage(error)
  return /HTTP\s+(502|503|504)\b/i.test(message) || /bad gateway|service unavailable|gateway timeout/i.test(message)
}

export function ProcessingPage() {
  const [, params] = useRoute("/jobs/:jobId")
  const jobId = params?.jobId
  const [, setLocation] = useLocation()

  const { data: job, error } = useGetLecturerJob(jobId as string, {
    query: {
      enabled: !!jobId,
      queryKey: getGetLecturerJobQueryKey(jobId as string),
      refetchInterval: (query) => {
        const state = query.state.data
        if (state?.status === "completed" || state?.status === "failed") return false
        return 2000
      },
      retry: (failureCount, queryError) =>
        isTransientServerError(queryError) && failureCount < 8,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  })

  React.useEffect(() => {
    if (job?.status === "completed") setLocation(`/jobs/${job.id}/preview`)
  }, [job?.status, job?.id, setLocation])

  if (!jobId) return null

  if (error && !job) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4">
          <div className="flex items-center space-x-3 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-xl font-semibold tracking-tight">Failed to load job</h2>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{errorMessage(error)}</p>
          <button onClick={() => setLocation("/")} className="text-sm font-medium underline hover:text-muted-foreground">
            Start over
          </button>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-8">
          <div className="h-4 w-1/3 bg-muted animate-pulse" />
          <div className="h-2 w-full bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  if (job.status === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6">
          <div className="flex items-center space-x-3 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-xl font-semibold tracking-tight">Processing failed</h2>
          </div>
          <div className="p-4 bg-muted text-sm font-mono text-muted-foreground">
            {job.error || "An internal error occurred while processing the document."}
          </div>
          <button onClick={() => setLocation("/")} className="text-sm font-medium underline hover:text-muted-foreground">
            Upload a different document
          </button>
        </div>
      </div>
    )
  }

  const steps = [
    { key: "extracting", label: "Extract Content" },
    { key: "analyzing", label: "Analyze with AI" },
    { key: "generating", label: "Generate Slides" },
  ]
  const currentStepIndex = steps.findIndex((step) => step.key === job.status)

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-2xl space-y-12">
        <div className="space-y-2 border-b border-border pb-8">
          <h1 className="text-2xl font-bold tracking-tight">Processing Document</h1>
          <p className="text-sm text-muted-foreground font-mono truncate">{job.inputFilename}</p>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-sm font-medium tracking-tight">{job.progressStep || "Initializing..."}</span>
              <span className="text-sm font-mono text-muted-foreground">
                {job.progressPct != null ? `${job.progressPct}%` : ""}
              </span>
            </div>
            <Progress value={job.progressPct} className="h-1 rounded-none" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {steps.map((step, index) => {
              const isActive = index === currentStepIndex
              const isPast = index < currentStepIndex
              return (
                <div
                  key={step.key}
                  className={`flex flex-col space-y-3 p-4 border-l-2 transition-colors ${
                    isActive
                      ? "border-primary bg-secondary/50 text-foreground"
                      : isPast
                        ? "border-primary/20 text-muted-foreground"
                        : "border-border text-muted-foreground/50"
                  }`}
                >
                  <span className="text-xs font-mono font-medium tracking-wider uppercase">Step 0{index + 1}</span>
                  <span className="text-sm font-medium tracking-tight">{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="pt-8 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider font-mono">Text Blocks</span>
            </div>
            <p className="text-2xl font-bold">{job.extractedTextCount ?? "—"}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-muted-foreground">
              <ImageIcon className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider font-mono">Images</span>
            </div>
            <p className="text-2xl font-bold">{job.extractedImageCount ?? "—"}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-muted-foreground">
              <LayoutTemplate className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider font-mono">Slides</span>
            </div>
            <p className="text-2xl font-bold">{job.slideCount ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
