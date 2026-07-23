import * as React from "react"
import { useLocation } from "wouter"
import { UploadCloud, File as FileIcon } from "lucide-react"
import { useCreateLecturerJob } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"

export function UploadPage() {
  const [, setLocation] = useLocation()
  const createJob = useCreateLecturerJob()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  const [dragActive, setDragActive] = React.useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      submitFile(file)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      submitFile(file)
    }
  }
  
  const submitFile = (file: File) => {
    createJob.mutate(
      { data: { file } },
      {
        onSuccess: (job) => {
          setLocation(`/jobs/${job.id}`)
        },
      }
    )
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-2xl space-y-12">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-primary">
            Lecturer
          </h1>
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
          onClick={openFileDialog}
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
              <h3 className="text-xl font-semibold tracking-tight">
                Upload your document
              </h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop a file here, or click to browse.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {[".pdf", ".docx", ".pptx", ".txt", ".md"].map((ext) => (
                <span 
                  key={ext} 
                  className="px-2 py-1 text-xs font-mono font-medium tracking-wider bg-accent text-accent-foreground border border-border"
                >
                  {ext}
                </span>
              ))}
            </div>
          </div>
        </div>
        
        {createJob.isError && (
          <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium text-center">
            Upload failed. Please try again.
          </div>
        )}
      </div>
    </div>
  )
}
