import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { apiWithFallback, apiFetch } from "@/lib/api";

type HealthResponse = { status: "ok" | "degraded" | "down"; now: string };

type JobsHealthResponse = {
  status: "ok" | "degraded" | "down";
  now: string;
  jobs: { name: string; lastRunAt?: string; lastOkAt?: string; lastError?: string }[];
};

type PageCandidate = { id: string; url: string; town?: string; confidence?: number; approved?: boolean };

type PagesResponse = { items: PageCandidate[] };

export default function AdminPage() {
  const [socialEnabled, setSocialEnabled] = useState(false);
  const [health, setHealth] = useState<{ loading: boolean; source?: "api" | "mock"; error?: string; data?: HealthResponse }>({
    loading: true,
  });
  const [jobs, setJobs] = useState<{ loading: boolean; source?: "api" | "mock"; error?: string; data?: JobsHealthResponse }>({
    loading: true,
  });

  const [pages, setPages] = useState<{ loading: boolean; error?: string; items: PageCandidate[] }>({ loading: false, items: [] });
  const [manualPageUrl, setManualPageUrl] = useState("");
  const [manualPostUrl, setManualPostUrl] = useState("");

  useMemo(() => {
    apiWithFallback<HealthResponse>(
      "/api/health",
      () => ({ status: "degraded", now: new Date().toISOString() }),
      { timeoutMs: 8000 },
    ).then((r) => {
      setHealth({ loading: false, data: r.data, source: r.source, error: r.source === "mock" ? r.error?.message : undefined });
    });

    apiWithFallback<JobsHealthResponse>(
      "/api/health/jobs",
      () => ({ status: "degraded", now: new Date().toISOString(), jobs: [] }),
      { timeoutMs: 8000 },
    ).then((r) => {
      setJobs({ loading: false, data: r.data, source: r.source, error: r.source === "mock" ? r.error?.message : undefined });
    });
  }, []);

  const loadPages = async () => {
    setPages((p) => ({ ...p, loading: true, error: undefined }));
    try {
      const res = await apiFetch<PagesResponse>("/api/admin/pages", { timeoutMs: 10000 });
      setPages({ loading: false, items: res.items ?? [] });
    } catch (e: any) {
      setPages((p) => ({ ...p, loading: false, error: e?.message ?? "Failed to load" }));
    }
  };

  const approvePage = async (id: string) => {
    try {
      await apiFetch(`/api/admin/pages/${encodeURIComponent(id)}/approve`, { method: "POST", timeoutMs: 10000 });
      await loadPages();
    } catch (e) {
      // swallow into UI
    }
  };

  const submitManualPage = async () => {
    if (!manualPageUrl.trim()) return;
    try {
      await apiFetch("/api/admin/pages", { method: "POST", body: { url: manualPageUrl.trim() }, timeoutMs: 10000 });
      setManualPageUrl("");
      await loadPages();
    } catch {
      // handled by list error
      await loadPages();
    }
  };

  const submitManualSignal = async () => {
    if (!manualPostUrl.trim()) return;
    try {
      await apiFetch("/api/admin/social_signals", { method: "POST", body: { url: manualPostUrl.trim() }, timeoutMs: 10000 });
      setManualPostUrl("");
    } catch {
      // noop
    }
  };

  return (
    <AppShell subtitle="Job health, page approvals, and feature-flagged social intake.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base" data-testid="text-admin-health-title">System health</CardTitle>
              <div className="flex gap-2">
                {health.source ? (
                  <Badge className="rounded-full" variant={health.source === "api" ? "secondary" : "outline"} data-testid="badge-health-source">
                    health: {health.source}
                  </Badge>
                ) : null}
                {jobs.source ? (
                  <Badge className="rounded-full" variant={jobs.source === "api" ? "secondary" : "outline"} data-testid="badge-jobs-source">
                    jobs: {jobs.source}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {health.error || jobs.error ? (
              <div className="text-xs text-muted-foreground" data-testid="text-admin-health-error">
                API unreachable: {health.error ?? jobs.error}
              </div>
            ) : null}

            <div className="rounded-xl border bg-card p-4 grid gap-1">
              <div className="text-sm font-semibold" data-testid="text-health-status">
                {health.data?.status ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-health-now">
                {health.data?.now ? new Date(health.data.now).toLocaleString() : "—"}
              </div>
            </div>

            <Separator />

            <div className="grid gap-2">
              <div className="text-xs font-semibold text-muted-foreground" data-testid="text-jobs-title">Jobs</div>
              {(jobs.data?.jobs?.length ?? 0) === 0 ? (
                <EmptyState title="No job telemetry yet" description="Backend will expose job run history here." testId="state-jobs-empty" />
              ) : (
                <div className="grid gap-2">
                  {jobs.data?.jobs.map((j) => (
                    <div key={j.name} className="rounded-xl border bg-card p-4 grid gap-1" data-testid={`card-job-${j.name}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold" data-testid={`text-job-name-${j.name}`}>{j.name}</div>
                        <Badge variant="secondary" className="rounded-full" data-testid={`badge-job-ok-${j.name}`}>
                          {j.lastOkAt ? "ok" : "unknown"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">Last run: {j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "—"}</div>
                      {j.lastError ? <div className="text-xs text-destructive">{j.lastError}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base" data-testid="text-admin-social-title">Social signals</CardTitle>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground" data-testid="text-social-flag">Feature flag</div>
                <Switch checked={socialEnabled} onCheckedChange={setSocialEnabled} data-testid="toggle-social-enabled" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!socialEnabled ? (
              <EmptyState
                title="Social intake is off"
                description="Enable to use admin endpoints for page approval and manual post-link intake."
                testId="state-social-off"
              />
            ) : (
              <>
                <div className="grid gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">Approved Pages</div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      value={manualPageUrl}
                      onChange={(e) => setManualPageUrl(e.target.value)}
                      placeholder="Add Page URL (public Pages only)"
                      data-testid="input-page-url"
                    />
                    <Button variant="secondary" onClick={submitManualPage} data-testid="button-add-page">
                      Add
                    </Button>
                    <Button variant="ghost" onClick={loadPages} data-testid="button-refresh-pages">
                      Refresh
                    </Button>
                  </div>
                  {pages.error ? (
                    <div className="text-xs text-muted-foreground" data-testid="text-pages-error">{pages.error}</div>
                  ) : null}
                  {pages.items.length === 0 ? (
                    <div className="text-xs text-muted-foreground" data-testid="text-pages-empty">
                      No pages loaded yet.
                    </div>
                  ) : (
                    <div className="grid gap-2" data-testid="list-pages">
                      {pages.items.map((p) => (
                        <div key={p.id} className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3" data-testid={`row-page-${p.id}`}>
                          <div className="grid">
                            <div className="text-sm font-medium" data-testid={`text-page-url-${p.id}`}>{p.url}</div>
                            <div className="text-xs text-muted-foreground">{p.town ?? "—"} • conf {p.confidence ?? "—"}</div>
                          </div>
                          <Button size="sm" onClick={() => approvePage(p.id)} data-testid={`button-approve-${p.id}`}>
                            Approve
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">Manual signal intake</div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      value={manualPostUrl}
                      onChange={(e) => setManualPostUrl(e.target.value)}
                      placeholder="Public Page post URL"
                      data-testid="input-social-url"
                    />
                    <Button variant="secondary" onClick={submitManualSignal} data-testid="button-add-signal">
                      Add
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-social-hint">
                    No scraping, no Groups, no login. Public Pages only.
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
