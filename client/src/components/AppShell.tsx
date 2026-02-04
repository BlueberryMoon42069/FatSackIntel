import { PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Layers,
  ListOrdered,
  Map,
  FileText,
  Shield,
  Search,
  MessageSquare,
  History,
  MapPin,
} from "lucide-react";

const nav = [
  { href: "/", label: "Live Outage Map", icon: Map, testId: "link-nav-map" },
  { href: "/rankings", label: "Knock Now", icon: ListOrdered, testId: "link-nav-rankings" },
  { href: "/social", label: "Social Pulse", icon: MessageSquare, testId: "link-nav-social" },
  { href: "/lookup", label: "Lookup", icon: Search, testId: "link-nav-lookup" },
  { href: "/historical", label: "Historical", icon: History, testId: "link-nav-historical" },
  { href: "/heatmap", label: "Heatmap", icon: MapPin, testId: "link-nav-heatmap" },
  { href: "/documents", label: "Historical Directory", icon: FileText, testId: "link-nav-docs" },
  { href: "/layers", label: "Layers", icon: Layers, testId: "link-nav-layers" },
  { href: "/admin", label: "Admin", icon: Shield, testId: "link-nav-admin" },
];

export function AppShell(props: PropsWithChildren<{ subtitle?: string }>) {
  const [loc] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl border bg-card shadow-sm grid place-items-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <div
                  className="text-sm font-semibold tracking-tight"
                  data-testid="text-app-title"
                >
                  SackFinder
                </div>
                <Badge variant="secondary" className="rounded-full" data-testid="badge-mode">
                  prototype
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-app-subtitle">
                {props.subtitle ?? "Massachusetts outage intelligence for outreach."}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {nav.map((n) => {
              const active = loc === n.href;
              const Icon = n.icon;
              return (
                <Link key={n.href} href={n.href}>
                  <Button
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className={cn("gap-2", active ? "shadow-sm" : "")}
                    data-testid={n.testId}
                  >
                    <Icon className="h-4 w-4" />
                    {n.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{props.children}</main>

      <footer className="border-t mt-10">
        <div className="mx-auto max-w-7xl px-4 py-6 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="text-xs text-muted-foreground" data-testid="text-footer-copy">
            SackFinder — prototype UI wired for API with graceful mock fallback.
          </div>
          <div className="text-xs text-muted-foreground" data-testid="text-footer-hint">
            Tip: set <span className="font-mono">VITE_API_BASE_URL</span> to point at your backend.
          </div>
        </div>
      </footer>
    </div>
  );
}
