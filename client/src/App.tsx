import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";

import LiveMapPage from "@/pages/live-map";
import RankingsPage from "@/pages/rankings";
import LookupPage from "@/pages/lookup";
import SocialPage from "@/pages/social";
import DocumentsPage from "@/pages/documents";
import LayersPage from "@/pages/layers";
import AdminPage from "@/pages/admin";

function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
      <div className="max-w-md w-full space-y-8 p-8 border rounded-2xl bg-card shadow-sm">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">SackFinder</h1>
          <p className="text-muted-foreground text-sm">
            Please log in to access the power outage intelligence platform.
          </p>
        </div>
        <Button 
          className="w-full py-6 text-lg" 
          onClick={() => window.location.href = "/api/login"}
          data-testid="button-login"
        >
          Log in with Replit
        </Button>
        <p className="text-xs text-muted-foreground">
          Secure authentication provided by Replit Auth
        </p>
      </div>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Switch>
      <Route path="/" component={LiveMapPage} />
      <Route path="/rankings" component={RankingsPage} />
      <Route path="/social" component={SocialPage} />
      <Route path="/lookup" component={LookupPage} />
      <Route path="/documents" component={DocumentsPage} />
      <Route path="/layers" component={LayersPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
