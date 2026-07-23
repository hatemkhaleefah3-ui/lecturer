import * as React from "react"
import { useRoute } from "wouter"
import { useGetLecturerSlides, getGetLecturerSlidesQueryKey } from "@workspace/api-client-react"
import { SlideData } from "@workspace/api-client-react/src/generated/api.schemas"
import { Button } from "@/components/ui/button"
import { Download, ChevronLeft, ChevronRight, AlertCircle, FileText, Image as ImageIcon } from "lucide-react"

function SlidePreviewCard({ slide }: { slide: SlideData }) {
  const { type, title, subtitle, body, images, tableHeaders, tableRows, chartType, chartData, leftColumn, rightColumn, calloutStyle } = slide
  
  const hasImages = images && images.length > 0
  const firstImage = hasImages ? images[0] : null

  switch (type) {
    case 'title':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-card">
          <h2 className="text-5xl font-bold tracking-tight max-w-4xl">{title}</h2>
          {subtitle && (
            <>
              <div className="w-24 h-px bg-border my-8" />
              <p className="text-xl text-muted-foreground max-w-2xl">{subtitle}</p>
            </>
          )}
        </div>
      )
    
    case 'section_header':
      return (
        <div className="w-full h-full flex items-center justify-center p-12 text-center bg-[#1A1A1A]">
          <h2 className="text-5xl font-bold tracking-tight text-white max-w-4xl">{title}</h2>
        </div>
      )

    case 'content':
      return (
        <div className="w-full h-full flex flex-col p-12 bg-card">
          <h2 className="text-3xl font-bold tracking-tight mb-8 pb-4 border-b border-border">{title}</h2>
          <div className="flex-1 flex gap-8">
            <div className={`flex flex-col gap-4 ${hasImages ? 'w-[55%]' : 'w-full'}`}>
              <div className="prose prose-sm max-w-none prose-p:leading-relaxed text-foreground"
                   dangerouslySetInnerHTML={{ __html: body || '' }} />
            </div>
            {hasImages && (
              <div className="w-[40%] flex flex-col gap-4">
                {images.map((img, i) => (
                  <div key={i} className="w-full aspect-[4/3] bg-muted flex items-center justify-center border border-border">
                    <span className="text-muted-foreground font-mono text-sm">
                      Image [{img.originalIndex}]
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
      
    case 'data_table':
      return (
        <div className="w-full h-full flex flex-col p-12 bg-card">
          <h2 className="text-3xl font-bold tracking-tight mb-8 pb-4 border-b border-border">{title}</h2>
          <div className="w-full overflow-hidden border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#1A1A1A] text-white">
                <tr>
                  {tableHeaders?.map((h, i) => (
                    <th key={i} className="px-4 py-3 font-medium tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows?.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-3 border-t border-border">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
      
    case 'chart':
      return (
        <div className="w-full h-full flex flex-col p-12 bg-card">
          <h2 className="text-3xl font-bold tracking-tight mb-8 pb-4 border-b border-border">{title}</h2>
          <div className="flex-1 border border-border bg-muted/10 p-8 flex flex-col items-center justify-center">
            <span className="px-3 py-1 bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wider mb-6">
              {chartType} chart
            </span>
            <div className="max-w-md w-full space-y-2">
              <div className="text-sm font-medium mb-4">Data points:</div>
              {chartData?.datasets?.[0]?.values?.slice(0, 5).map((v: number, i: number) => (
                <div key={i} className="flex justify-between items-center text-sm border-b border-border pb-2">
                  <span className="text-muted-foreground">{chartData.labels?.[i] || `Point ${i+1}`}</span>
                  <span className="font-mono">{v}</span>
                </div>
              ))}
              {((chartData?.datasets?.[0]?.values?.length || 0) > 5) && (
                <div className="text-xs text-muted-foreground text-center mt-4">...and more</div>
              )}
            </div>
          </div>
        </div>
      )
      
    case 'comparison':
      return (
        <div className="w-full h-full flex flex-col p-12 bg-card">
          <h2 className="text-3xl font-bold tracking-tight mb-8 pb-4 border-b border-border">{title}</h2>
          <div className="flex-1 flex gap-8">
            <div className="flex-1 pr-8 border-r border-border prose prose-sm max-w-none"
                 dangerouslySetInnerHTML={{ __html: leftColumn || '' }} />
            <div className="flex-1 prose prose-sm max-w-none"
                 dangerouslySetInnerHTML={{ __html: rightColumn || '' }} />
          </div>
        </div>
      )
      
    case 'callout':
      return (
        <div className="w-full h-full flex flex-col p-12 bg-card items-center justify-center">
          <div className="max-w-3xl w-full">
            <div className="mb-4">
              <span className="px-2 py-1 bg-[#1A1A1A] text-white font-mono text-xs uppercase tracking-wider">
                {calloutStyle || 'takeaway'}
              </span>
            </div>
            <div className="p-8 border-l-4 border-primary bg-secondary/50">
              <h3 className="text-2xl font-bold tracking-tight mb-4">{title}</h3>
              <div className="prose prose-sm max-w-none text-muted-foreground"
                   dangerouslySetInnerHTML={{ __html: body || '' }} />
            </div>
          </div>
        </div>
      )
      
    default:
      return (
        <div className="w-full h-full flex items-center justify-center bg-muted/20">
          <span className="text-muted-foreground font-mono">Unsupported slide type</span>
        </div>
      )
  }
}

export function PreviewPage() {
  const [, params] = useRoute("/jobs/:jobId/preview")
  const jobId = params?.jobId
  
  const { data: slidesResult, isLoading, error } = useGetLecturerSlides(jobId as string, {
    query: {
      enabled: !!jobId,
      queryKey: getGetLecturerSlidesQueryKey(jobId as string),
    }
  })

  const [currentIndex, setCurrentIndex] = React.useState(0)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-48 h-1 bg-muted overflow-hidden">
          <div className="h-full w-1/2 bg-primary animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !slidesResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-destructive flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium tracking-tight">Failed to load presentation preview</span>
        </div>
      </div>
    )
  }

  const { slides, integrity } = slidesResult
  const currentSlide = slides[currentIndex]

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border flex flex-col bg-secondary/30">
        <div className="p-4 border-b border-border bg-background">
          <h1 className="font-bold tracking-tight">Lecturer</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">{slides.length} slides generated</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {slides.map((slide, i) => (
            <button
              key={slide.index}
              onClick={() => setCurrentIndex(i)}
              className={`w-full text-left p-3 border transition-colors group ${
                i === currentIndex 
                  ? "border-primary bg-background shadow-sm" 
                  : "border-border/50 bg-background/50 hover:border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 text-secondary-foreground font-medium">
                  {slide.type.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm font-medium tracking-tight line-clamp-2">
                {slide.title || "Untitled Slide"}
              </p>
            </button>
          ))}
        </div>
        
        {/* Integrity Panel */}
        <div className="p-4 border-t border-border bg-background space-y-4">
          <h3 className="text-xs uppercase tracking-wider font-mono font-semibold">Integrity Report</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>Text Blocks</span>
              </div>
              <span className="font-mono">
                {integrity.textBlocksPlaced} <span className="text-muted-foreground">/</span> <span className={integrity.textBlocksPlaced < integrity.textBlocksExtracted ? "font-bold text-foreground" : "text-muted-foreground"}>{integrity.textBlocksExtracted}</span>
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ImageIcon className="w-4 h-4" />
                <span>Images</span>
              </div>
              <span className="font-mono">
                {integrity.imagesPlaced} <span className="text-muted-foreground">/</span> <span className={integrity.imagesPlaced < integrity.imagesExtracted ? "font-bold text-foreground" : "text-muted-foreground"}>{integrity.imagesExtracted}</span>
              </span>
            </div>
          </div>
          
          {integrity.allPlaced ? (
            <div className="text-xs py-2 px-3 bg-secondary text-secondary-foreground text-center font-medium">
              All content placed
            </div>
          ) : (
            <div className="text-xs py-2 px-3 border border-border text-foreground text-center font-medium">
              Some content omitted
            </div>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col bg-muted/10">
        <div className="h-16 border-b border-border flex items-center justify-between px-8 bg-background">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-mono tracking-wider font-medium">
              {currentIndex + 1} / {slides.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentIndex(Math.min(slides.length - 1, currentIndex + 1))}
              disabled={currentIndex === slides.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          <a
            href={`/api/lecturer/jobs/${jobId}/download`}
            download="lecture-deck.pptx"
            className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 h-10 px-6 py-2 gap-2"
          >
            <Download className="w-4 h-4" />
            Download PPTX
          </a>
        </div>
        
        <div className="flex-1 overflow-auto p-12 flex items-center justify-center">
          <div className="w-full max-w-[1024px] aspect-[16/9] shadow-2xl bg-card border border-border shrink-0 overflow-hidden">
            {currentSlide && <SlidePreviewCard slide={currentSlide} />}
          </div>
        </div>
      </div>
    </div>
  )
}
