import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import LiveMapPage from "@/pages/live-map";
import RankingsPage from "@/pages/rankings";
import LookupPage from "@/pages/lookup";
import SocialPage from "@/pages/social";
import DocumentsPage from "@/pages/documents";
import LayersPage from "@/pages/layers";
import AdminPage from "@/pages/admin";

function Router() {
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
