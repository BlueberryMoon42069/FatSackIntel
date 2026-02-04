import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { apiFetch } from "@/lib/api";
import { Activity, Database, TrendingUp, MessageSquare, Sun, BarChart } from "lucide-react";

type AdminStatus = {
  counts: {
    activeOutages: number;
    reliabilityRecords: number;
    recentSocialSignals: number;
    solarDataPoints: number;
    scoredLocations: number;
  };
  lastUpdated: string;
};

export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminStatus>("/api/admin/status");
      setStatus(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const triggerAction = async (endpoint: string, name: string) => {
    setActionLoading(name);
    try {
      await apiFetch(endpoint, { method: "POST", timeoutMs: 60000 });
      await loadStatus();
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${name}`);
    } finally {
      setActionLoading(null);
    }
  };

  const statusCards = [
    {
      title: "Active Outages",
      value: status?.counts.activeOutages ?? 0,
      icon: Activity,
      description: "Live outage events",
      color: "text-red-600",
    },
    {
      title: "Reliability Data",
      value: status?.counts.reliabilityRecords ?? 0,
      icon: Database,
      description: "Historical metrics",
      color: "text-blue-600",
    },
    {
      title: "Social Signals",
      value: status?.counts.recentSocialSignals ?? 0,
      icon: MessageSquare,
      description: "Last 24h",
      color: "text-purple-600",
    },
    {
      title: "Solar Data Points",
      value: status?.counts.solarDataPoints ?? 0,
      icon: Sun,
      description: "Analyzed locations",
      color: "text-yellow-600",
    },
    {
      title: "Scored Locations",
      value: status?.counts.scoredLocations ?? 0,
      icon: BarChart,
      description: "Composite rankings",
      color: "text-green-600",
    },
  ];

  return (
    <AppShell subtitle="Test and manage data sources for OutageIntel MA">
      <div className="grid gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Data Pipeline Control</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import, scrape, and test all data sources before publishing
            </p>
          </div>
          <Button onClick={loadStatus} disabled={loading} data-testid="button-refresh-status">
            {loading ? "Loading..." : "Refresh Status"}
          </Button>
        </div>

        {/* Status Overview */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-sm text-red-600" data-testid="text-admin-error">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && !status ? (
          <EmptyState title="Loading system status..." description="Please wait" testId="state-loading" />
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {statusCards.map((card) => (
                <Card key={card.title}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-stat-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          {card.title}
                        </p>
                        <p className={`text-2xl font-bold mt-1 ${card.color}`} data-testid={`text-value-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          {card.value.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                      </div>
                      <card.icon className={`h-8 w-8 ${card.color} opacity-50`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Data Import Actions */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base" data-testid="text-import-title">Data Import</CardTitle>
                  <CardDescription>Import historical and baseline data</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button
                    variant="outline"
                    onClick={() => triggerAction("/api/admin/import/historical", "Import Historical")}
                    disabled={actionLoading === "Import Historical"}
                    data-testid="button-import-historical"
                    className="justify-start"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {actionLoading === "Import Historical" ? "Importing..." : "Import Historical Reliability Data"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Loads 10 years (2014-2023) of SAIDI/SAIFI/CAIDI metrics from MA DPU filings for National Grid, Eversource, and Unitil
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base" data-testid="text-scrape-title">Live Scrapers</CardTitle>
                  <CardDescription>Trigger data collection from external sources</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button
                    variant="outline"
                    onClick={() => triggerAction("/api/admin/scrape/providers", "Scrape Providers")}
                    disabled={actionLoading === "Scrape Providers"}
                    data-testid="button-scrape-providers"
                    className="justify-start"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    {actionLoading === "Scrape Providers" ? "Scraping..." : "Scrape Outage Providers"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Fetches live outage data from MEMA and National Grid using QuadKey tiling
                  </p>

                  <Button
                    variant="outline"
                    onClick={() => triggerAction("/api/admin/scrape/social", "Scrape Social")}
                    disabled={actionLoading === "Scrape Social"}
                    data-testid="button-scrape-social"
                    className="justify-start"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {actionLoading === "Scrape Social" ? "Scraping..." : "Scrape Social Signals"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Monitors public Facebook groups for outage mentions, billing complaints, and solar interest in Worcester County
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* API Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base" data-testid="text-api-title">API Endpoints</CardTitle>
                <CardDescription>Test backend REST endpoints</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="font-mono text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/outages/active</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Active outages</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/reliability?provider=National+Grid</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Historical metrics</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/social/sentiment</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Town sentiment</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/scores/top?limit=100</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Top locations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">POST</Badge>
                      <span className="text-muted-foreground">/api/solar/analyze</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Calculate solar potential</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-medium" data-testid="text-last-updated">
                      {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : "—"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Database</span>
                    <Badge variant="secondary" data-testid="badge-db-status">PostgreSQL + PostGIS</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Scoring Engine</span>
                    <Badge variant="secondary" data-testid="badge-scoring-status">Ready</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">NREL PVWatts</span>
                    <Badge variant="secondary" data-testid="badge-solar-status">Integrated</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
