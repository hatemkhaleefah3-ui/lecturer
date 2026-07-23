import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { UploadPage } from '@/pages/Upload';
import { ProcessingPage } from '@/pages/Processing';
import { PreviewPage } from '@/pages/Preview';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={UploadPage} />
      <Route path="/jobs/:jobId" component={ProcessingPage} />
      <Route path="/jobs/:jobId/preview" component={PreviewPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
