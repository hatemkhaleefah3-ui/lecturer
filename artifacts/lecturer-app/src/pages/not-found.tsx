import { useToast } from "@/components/ui/use-toast"

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="text-muted-foreground font-mono">Page not found.</p>
        <a href="/" className="inline-block mt-4 text-sm font-medium underline">
          Return Home
        </a>
      </div>
    </div>
  )
}
export default NotFound;
