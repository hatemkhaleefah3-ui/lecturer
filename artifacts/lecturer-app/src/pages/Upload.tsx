import * as React from "react"
import { UploadCloud } from "lucide-react"

const MAX_FILE_BYTES = 4 * 1024 * 1024

async function getResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as { error?: unknown } | null
    if (typeof data?.error === "string" && data.error.trim()) return data.error
  }

  const text = await response.text().catch(() => "")
  return text.trim() || `Conversion failed with HTTP ${response.status}.`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function outputFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim() || "lecture"
  return `${base}-deck.pptx`
}

export function UploadPage() {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const submitFile = async (file: File) => {
    if (isProcessing) return
    setError(null)
    setMessage(null)

    if (file.size > MAX_FILE_BYTES) {
      setError("This Vercel deployment accepts files up to 4 MB. Please compress or split the document.")
      return
    }

    const form = new FormData()
    form.append("file", file)
    setIsProcessing(true)
    setMessage("Extracting content and generating your presentation…")

    try {
      const response = await fetch("/api/lecturer/convert", {
        method: "POST",
        body: form,
      })

      if (!response.ok) throw new Error(await getResponseError(response))

      const blob = await response.blob()
      if (blob.size === 0) throw new Error("The generated PowerPoint was empty.")

      downloadBlob(blob, outputFilename(file.name))
      setMessage("Your PowerPoint is ready and the download has started.")
    } catch (cause) {
      setMessage(null)
      setError(cause instanceof Error ? cause.message : "Document conversion failed. Please try again.")
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isProcessing) setDragActive(e.type === "dragenter" || e.type === "dragover")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void submitFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void submitFile(file)
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
          className={`relative flex flex-col items-center justify-center p-12 sm:p-24 border-2 border-dashed transition-colors ${
            isProcessing
              ? "cursor-wait border-primary/20 bg-accent/20"
              : dragActive
                ? "cursor-pointer border-primary bg-accent/50"
                : "cursor-pointer border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/20"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          aria-busy={isProcessing}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.pptx,.txt,.md"
            onChange={handleChange}
            disabled={isProcessing}
          />

          <div className="flex flex-col items-center space-y-6 text-center pointer-events-none">
            <div className="p-4 bg-secondary rounded-full">
              <UploadCloud className={`w-8 h-8 text-primary ${isProcessing ? "animate-pulse" : ""}`} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold tracking-tight">
                {isProcessing ? "Creating your presentation" : "Upload your document"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isProcessing
                  ? "Keep this page open while Lecturer prepares the PowerPoint."
                  : "Drag and drop a file here, or click to browse."}
              </p>
              <p className="text-xs text-muted-foreground">Maximum file size: 4 MB</p>
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

        {message && (
          <div className="p-4 bg-secondary text-sm font-medium text-center" role="status">
            {message}
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium text-center" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
