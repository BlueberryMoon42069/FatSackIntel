import { useEffect, useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/EmptyState";
import { apiWithFallback, apiFetch } from "@/lib/api";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { mockScores } from "@/lib/mockData";
import { Spinner } from "@/components/ui/spinner";
import { 
  Activity, MessageSquare, Sun, Building2, TrendingUp, Search, RefreshCw, Map as MapIcon
} from "lucide-react";

import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

type RankingItem = {
  id: string;
  type: "h3_cell" | "town" | "territory";
  name: string;
  provider?: string;
  lat: number | null;
  lon: number | null;
  knockScore: number;
  outageScore: number;
  socialScore: number;
  solarScore: number;
  outageEvents24h?: number;
  socialMentions24h?: number;
  socialData?: {
    outageCount: number;
    billingCount: number;
    intentCount: number;
    avgUrgency: number;
  };
  reliabilityData?: {
    avgSAIDI: number;
    avgSAIFI: number;
    avgCAIDI: number;
    yearsAnalyzed: number;
  };
  historicalData?: {
    totalIncidents: number;
    totalCustomers: number;
    avgDuration: number;
    utilities: string[];
    years: number[];
    dataSource: string;
  };
  updatedAt?: string;
};

type RankingsResponse = {
  updatedAt: string;
  total: number;
  rankings: RankingItem[];
};

function fmt(n: number | undefined | null, digits = 2) {
  if (n === undefined || n === null) return "—";
  return Number(n).toFixed(digits);
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
      <div 
        className={`h-full ${color} rounded-full`} 
        style={{ width: `${Math.min(100, score * 100)}%` }} 
      />
    </div>
  );
}

function HeatmapLayer({ data, visible }: { data: RankingItem[]; visible: boolean }) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    const heatPoints: [number, number, number][] = data
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => [r.lat!, r.lon!, r.knockScore]);

    if (heatPoints.length === 0) return;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    heatLayerRef.current = (L as any).heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      max: 1.0,
      minOpacity: 0.4,
      gradient: {
        0.0: '#22c55e',
        0.25: '#84cc16',
        0.5: '#eab308',
        0.75: '#f97316',
        1.0: '#ef4444'
      }
    }).addTo(map);

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, data, visible]);

  return null;
}

function HeatmapLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg p-3 border" data-testid="heatmap-legend">
      <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">Knock Score</div>
      <div className="flex items-center gap-2">
        <div 
          className="w-24 h-3 rounded" 
          style={{ 
            background: 'linear-gradient(to right, #22c55e, #84cc16, #eab308, #f97316, #ef4444)' 
          }} 
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-1">
        <span>Low</span>
        <span>Medium</span>
        <span>High</span>
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span>Less Opportunity</span>
        <span>Hot Opportunity</span>
      </div>
    </div>
  );
}

export default function RankingsPage() {
  const [townFilter, setTownFilter] = useState("");
  const [minScore, setMinScore] = useState("");
  const [sortBy, setSortBy] = useState<"knockScore" | "outageScore" | "socialScore" | "solarScore">("knockScore");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"api" | "mock">("api");
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const loadRankings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (townFilter) params.set("town", townFilter);
      if (minScore) params.set("minScore", minScore);
      params.set("sortBy", sortBy);
      params.set("limit", "100");
      
      const result = await apiWithFallback<RankingsResponse>(
        `/api/rankings?${params.toString()}`,
        () => {
          // Fallback to mock data
          const mock = mockScores("24h");
          return {
            updatedAt: mock.updatedAt,
            total: mock.cells.length,
            rankings: mock.cells.map((c, i) => ({
              id: c.h3,
              type: "h3_cell" as const,
              name: c.h3,
              lat: c.centroid.lat,
              lon: c.centroid.lng,
              knockScore: c.score,
              outageScore: c.score_outage,
              socialScore: c.boosts.social || 0.1,
              solarScore: (c.solar?.solar_score || 60) / 100,
            })),
          };
        },
        { timeoutMs: 15000 }
      );
      
      setRankings(result.data.rankings);
      setUpdatedAt(result.data.updatedAt);
      setSource(result.source);
      if (result.source === "mock" && result.error) {
        setError(result.error.message);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load rankings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRankings();
  }, [sortBy]);

  const handleSearch = () => {
    loadRankings();
  };

  const selectedItem = rankings.find(r => r.id === selected) ?? (rankings.length > 0 ? rankings[0] : null);

  const exportCsv = () => {
    const out = rankings.map((r, idx) => ({
      rank: idx + 1,
      name: r.name,
      type: r.type,
      knockScore: r.knockScore,
      outageScore: r.outageScore,
      socialScore: r.socialScore,
      solarScore: r.solarScore,
      lat: r.lat,
      lon: r.lon,
      outageEvents24h: r.outageEvents24h,
      socialMentions24h: r.socialMentions24h,
    }));
    downloadTextFile(`outageintel_rankings.csv`, toCsv(out));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "town": return <MessageSquare className="h-4 w-4" />;
      case "territory": return <Building2 className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <AppShell subtitle="Unified rankings combining outage risk, social signals, solar potential, and heating fuel data">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="grid gap-4">
          {/* Search / Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="Filter by town or location..."
                    value={townFilter}
                    onChange={(e) => setTownFilter(e.target.value)}
                    data-testid="input-town-filter"
                  />
                </div>
                <div className="w-24">
                  <Input
                    placeholder="Min score"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    data-testid="input-min-score"
                  />
                </div>
                <Button onClick={handleSearch} data-testid="button-search">
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
                <Button variant="ghost" onClick={loadRankings} data-testid="button-refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rankings Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle className="text-base" data-testid="text-rankings-title">Knock Now Rankings</CardTitle>
                  <div className="text-xs text-muted-foreground" data-testid="text-rankings-count">
                    {rankings.length} locations • Updated: {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="rounded-full" variant={source === "api" ? "secondary" : "outline"} data-testid="badge-source">
                    {source === "api" ? "Live Data" : "Mock fallback"}
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={exportCsv} data-testid="button-export">
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid gap-3">
              {error && (
                <div className="text-xs text-muted-foreground" data-testid="text-error">
                  Could not load rankings. Using sample data.
                </div>
              )}

              {/* Sort Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                <Button
                  size="sm"
                  variant={sortBy === "knockScore" ? "default" : "ghost"}
                  onClick={() => setSortBy("knockScore")}
                  data-testid="button-sort-knock"
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Knock Score
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === "outageScore" ? "default" : "ghost"}
                  onClick={() => setSortBy("outageScore")}
                  data-testid="button-sort-outage"
                >
                  <Activity className="h-3 w-3 mr-1" />
                  Outage Risk
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === "socialScore" ? "default" : "ghost"}
                  onClick={() => setSortBy("socialScore")}
                  data-testid="button-sort-social"
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Social
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === "solarScore" ? "default" : "ghost"}
                  onClick={() => setSortBy("solarScore")}
                  data-testid="button-sort-solar"
                >
                  <Sun className="h-3 w-3 mr-1" />
                  Solar
                </Button>
              </div>

              <Separator />

              {loading ? (
                <div className="rounded-xl border bg-card p-6 flex items-center gap-3" data-testid="state-loading">
                  <Spinner className="h-5 w-5" />
                  <div className="text-sm font-medium">Loading rankings...</div>
                </div>
              ) : rankings.length === 0 ? (
                <EmptyState
                  title="No rankings data yet"
                  description="Run scrapers from Admin to populate."
                  actionLabel="Go to Admin"
                  onAction={() => window.location.href = "/admin"}
                  testId="state-empty"
                />
              ) : (
                <div className="rounded-xl border overflow-hidden max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[48px]">#</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Knock Score</TableHead>
                        <TableHead className="text-right">Outage</TableHead>
                        <TableHead className="text-right">Social</TableHead>
                        <TableHead className="text-right">Solar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankings.map((r, idx) => (
                        <TableRow
                          key={r.id}
                          className={selectedItem?.id === r.id ? "bg-muted/50" : "cursor-pointer hover:bg-muted/30"}
                          onClick={() => setSelected(r.id)}
                          data-testid={`row-${r.id}`}
                        >
                          <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{getTypeIcon(r.type)}</span>
                              <div className="grid">
                                <div className="text-sm font-medium flex items-center gap-2" data-testid={`text-name-${r.id}`}>
                                  {r.name}
                                  {r.historicalData && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-green-50 text-green-700 border-green-300" data-testid={`badge-dpu-${r.id}`}>
                                      DPU
                                    </Badge>
                                  )}
                                  {!r.historicalData && r.socialData && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-300">
                                      Social
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {r.historicalData ? `${r.historicalData.totalIncidents} incidents` : r.type === "territory" && r.provider ? r.provider : r.type}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium" data-testid={`text-knock-${r.id}`}>
                                {fmt(r.knockScore)}
                              </span>
                              <ScoreBar score={r.knockScore} color="bg-primary" />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">{fmt(r.outageScore)}</span>
                              <ScoreBar score={r.outageScore} color="bg-red-500" />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">{fmt(r.socialScore)}</span>
                              <ScoreBar score={r.socialScore} color="bg-purple-500" />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">{fmt(r.solarScore)}</span>
                              <ScoreBar score={r.solarScore} color="bg-yellow-500" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle className="text-base flex items-center gap-2" data-testid="text-heatmap-title">
                    <MapIcon className="h-4 w-4" />
                    Opportunity Heatmap
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">
                    Score intensity visualization based on knock scores
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Heatmap</span>
                    <Switch
                      checked={showHeatmap}
                      onCheckedChange={setShowHeatmap}
                      data-testid="toggle-heatmap"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative h-[400px] rounded-xl overflow-hidden border" data-testid="map-heatmap">
                <MapContainer 
                  center={[42.35, -71.06] as any} 
                  zoom={8 as any} 
                  className="h-full w-full"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <HeatmapLayer data={rankings} visible={showHeatmap} />
                </MapContainer>
                {showHeatmap && <HeatmapLegend />}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base" data-testid="text-detail-title">Location Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!selectedItem ? (
              <EmptyState
                title="Select a location"
                description="Click a row to see the score breakdown and signal details."
                testId="state-detail-empty"
              />
            ) : (
              <>
                {/* Overview */}
                <div className="rounded-xl border bg-card p-4 grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(selectedItem.type)}
                      <span className="font-medium" data-testid="text-detail-name">{selectedItem.name}</span>
                    </div>
                    <Badge variant="secondary" className="rounded-full" data-testid="badge-detail-score">
                      {fmt(selectedItem.knockScore)} Knock Score
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Type: {selectedItem.type} 
                    {selectedItem.provider && ` • Provider: ${selectedItem.provider}`}
                    {selectedItem.lat && selectedItem.lon && ` • ${selectedItem.lat.toFixed(3)}, ${selectedItem.lon.toFixed(3)}`}
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="grid gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">Score Breakdown</div>
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-red-500" />
                            Outage Risk
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm" data-testid="text-detail-outage">
                            {fmt(selectedItem.outageScore)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-purple-500" />
                            Social Signal
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm" data-testid="text-detail-social">
                            {fmt(selectedItem.socialScore)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="flex items-center gap-2">
                            <Sun className="h-4 w-4 text-yellow-500" />
                            Solar Potential
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm" data-testid="text-detail-solar">
                            {fmt(selectedItem.solarScore)}
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/30">
                          <TableCell className="font-semibold">Knock Score (weighted)</TableCell>
                          <TableCell className="text-right font-mono font-semibold" data-testid="text-detail-total">
                            {fmt(selectedItem.knockScore)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Social Data */}
                {selectedItem.socialData && (
                  <div className="grid gap-2">
                    <div className="text-xs font-semibold text-muted-foreground">Social Signals (24h)</div>
                    <div className="rounded-xl border bg-card p-4 grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Outage Mentions</span>
                        <span className="font-medium" data-testid="text-social-outage">{selectedItem.socialData.outageCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Billing Complaints</span>
                        <span className="font-medium" data-testid="text-social-billing">{selectedItem.socialData.billingCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Solar/Battery Interest</span>
                        <span className="font-medium" data-testid="text-social-intent">{selectedItem.socialData.intentCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Urgency</span>
                        <span className="font-medium">{fmt(selectedItem.socialData.avgUrgency)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Historical Outage Data (DPU Filings) */}
                {selectedItem.historicalData && (
                  <div className="grid gap-2">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                      DPU Historical Data 
                      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-green-50 text-green-700 border-green-300">
                        Real Data
                      </Badge>
                    </div>
                    <div className="rounded-xl border bg-card p-4 grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Incidents</span>
                        <span className="font-medium" data-testid="text-hist-incidents">{selectedItem.historicalData.totalIncidents}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customers Affected</span>
                        <span className="font-medium" data-testid="text-hist-customers">{selectedItem.historicalData.totalCustomers.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Duration</span>
                        <span className="font-medium" data-testid="text-hist-duration">{fmt(selectedItem.historicalData.avgDuration, 1)} hrs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Utilities</span>
                        <span className="font-medium">{selectedItem.historicalData.utilities.join(", ")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Years</span>
                        <span className="font-medium">{selectedItem.historicalData.years.join(", ")}</span>
                      </div>
                      <div className="flex justify-between text-xs pt-2 border-t">
                        <span className="text-muted-foreground">Source</span>
                        <span className="text-green-600 font-medium">{selectedItem.historicalData.dataSource}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reliability Data (SAIDI/SAIFI) */}
                {selectedItem.reliabilityData && (
                  <div className="grid gap-2">
                    <div className="text-xs font-semibold text-muted-foreground">Historical Reliability ({selectedItem.reliabilityData.yearsAnalyzed} years)</div>
                    <div className="rounded-xl border bg-card p-4 grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg SAIDI</span>
                        <span className="font-medium" data-testid="text-rel-saidi">{fmt(selectedItem.reliabilityData.avgSAIDI, 1)} min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg SAIFI</span>
                        <span className="font-medium" data-testid="text-rel-saifi">{fmt(selectedItem.reliabilityData.avgSAIFI)} int/yr</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg CAIDI</span>
                        <span className="font-medium" data-testid="text-rel-caidi">{fmt(selectedItem.reliabilityData.avgCAIDI, 1)} min</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Activity */}
                {(selectedItem.outageEvents24h !== undefined || selectedItem.socialMentions24h !== undefined) && (
                  <div className="grid gap-2">
                    <div className="text-xs font-semibold text-muted-foreground">Recent Activity</div>
                    <div className="rounded-xl border bg-card p-4 grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-red-600" data-testid="text-events24h">
                          {selectedItem.outageEvents24h ?? 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Outage Events (24h)</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600" data-testid="text-mentions24h">
                          {selectedItem.socialMentions24h ?? 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Social Mentions (24h)</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
