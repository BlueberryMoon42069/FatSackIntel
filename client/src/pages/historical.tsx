import { useState, useEffect, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import { apiFetch } from "@/lib/api";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Users,
  Clock,
  AlertTriangle,
  Map,
  List,
  FileText,
} from "lucide-react";

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type HistoricalOutage = {
  id: string;
  town: string;
  street: string | null;
  customersOut: number | null;
  durationHours: number | null;
  cause: string | null;
  incidentStart: string | null;
  utility: string;
  year: number;
  weather: string | null;
  failedComponent: string | null;
};

type HistoricalStats = {
  totalRecords: number;
  utilities: string[];
  years: number[];
  causes: string[];
  topTowns: { town: string; count: number }[];
};

type HistoricalResponse = {
  updatedAt: string;
  total: number;
  outages: HistoricalOutage[];
};

type HeatmapTown = {
  town: string;
  totalOutages: number;
  totalCustomersAffected: number;
  totalDuration: number;
  avgDuration: number;
  lat: number | null;
  lon: number | null;
};

type DocumentMetric = {
  type: "SAIDI" | "SAIFI" | "CAIDI";
  value: number;
  unit?: string;
  year?: number;
  territory?: string;
};

type DocumentRow = {
  id: string;
  title: string;
  provider?: string;
  year?: number;
  url?: string;
  tags: string[];
  snippet: string;
  metrics: DocumentMetric[];
};

type DocumentsResponse = {
  updatedAt: string;
  total: number;
  items: DocumentRow[];
};

type SortField = "town" | "street" | "customersOut" | "durationHours" | "cause" | "incidentStart";
type SortDir = "asc" | "desc";
type TabKey = "heatmap" | "search" | "directory";

const PAGE_SIZE = 25;

function getColor(count: number, maxCount: number): string {
  const ratio = Math.min(count / maxCount, 1);
  if (ratio < 0.2) return "#22c55e";
  if (ratio < 0.4) return "#84cc16";
  if (ratio < 0.6) return "#eab308";
  if (ratio < 0.8) return "#f97316";
  return "#ef4444";
}

function getRadius(count: number, maxCount: number): number {
  const minRadius = 8;
  const maxRadius = 30;
  const ratio = Math.min(count / maxCount, 1);
  return minRadius + ratio * (maxRadius - minRadius);
}

function MapBoundsUpdater({ towns }: { towns: HeatmapTown[] }) {
  const map = useMap();
  useEffect(() => {
    const validTowns = towns.filter((t) => t.lat != null && t.lon != null);
    if (validTowns.length > 0) {
      const bounds = validTowns.map((t) => [t.lat!, t.lon!] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [towns, map]);
  return null;
}

function MetricPill(props: { t: string; v: number; unit?: string }) {
  return (
    <Badge variant="secondary" className="rounded-full" data-testid={`badge-metric-${props.t}`}>
      {props.t}: {props.v}{props.unit ? ` ${props.unit}` : ""}
    </Badge>
  );
}

export default function HistoricalPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("heatmap");
  const [stats, setStats] = useState<HistoricalStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    apiFetch<HistoricalStats>("/api/historical/stats")
      .then((data) => setStats(data))
      .catch(console.error)
      .finally(() => setStatsLoading(false));
  }, []);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "heatmap", label: "Heatmap", icon: <Map className="h-4 w-4" /> },
    { key: "search", label: "Location Lookup", icon: <List className="h-4 w-4" /> },
    { key: "directory", label: "Directory", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <AppShell subtitle="Historical outage data from DPU filings — heatmap, location search, and document directory.">
      <div className="grid gap-4">
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit" data-testid="tabs-historical">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <>
            {activeTab === "heatmap" && <HeatmapTab stats={stats} />}
            {activeTab === "search" && <SearchTab stats={stats} />}
            {activeTab === "directory" && <DirectoryTab />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function HeatmapTab({ stats }: { stats: HistoricalStats | null }) {
  const [towns, setTowns] = useState<HeatmapTown[]>([]);
  const [loading, setLoading] = useState(true);
  const [utility, setUtility] = useState("");
  const [year, setYear] = useState("");
  const [selectedTown, setSelectedTown] = useState<HeatmapTown | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (utility && utility !== "__all__") params.set("utility", utility);
      if (year && year !== "__all__") params.set("year", year);
      const response = await apiFetch<{ total: number; data: HeatmapTown[] }>(`/api/historical/heatmap?${params.toString()}`);
      setTowns(response.data || []);
    } catch (e) {
      console.error("Failed to load heatmap data:", e);
      setTowns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [utility, year]);

  const validTowns = useMemo(() => towns.filter((t) => t.lat != null && t.lon != null), [towns]);
  const maxOutages = useMemo(() => Math.max(...validTowns.map((t) => t.totalOutages), 1), [validTowns]);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="grid gap-4 content-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" data-testid="text-heatmap-title">
              Outage Density by Town
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label className="text-sm">Utility</Label>
              <Select value={utility} onValueChange={setUtility}>
                <SelectTrigger data-testid="select-heatmap-utility">
                  <SelectValue placeholder="All utilities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All utilities</SelectItem>
                  {stats?.utilities.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger data-testid="select-heatmap-year">
                  <SelectValue placeholder="All years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All years</SelectItem>
                  {stats?.years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="grid gap-2">
              <div className="text-xs font-semibold text-muted-foreground">Legend</div>
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs">Few incidents</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-xs">Moderate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-xs">Many incidents</span>
                </div>
              </div>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Loading data...
              </div>
            )}
          </CardContent>
        </Card>

        {selectedTown && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                {selectedTown.town}
                <Badge variant="secondary">{selectedTown.totalOutages} incidents</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Customers Affected</span>
                <span className="font-medium" data-testid="detail-customers">
                  {selectedTown.totalCustomersAffected.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Duration</span>
                <span className="font-medium" data-testid="detail-duration">
                  {selectedTown.totalDuration.toFixed(1)} hrs
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Duration per Incident</span>
                <span className="font-medium" data-testid="detail-avg-duration">
                  {selectedTown.avgDuration.toFixed(1)} hrs
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && validTowns.length === 0 && (
          <EmptyState title="No location data available" description="No towns with coordinates found for the selected filters." testId="state-no-data" />
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="h-[70vh] min-h-[520px] w-full" data-testid="map-heatmap">
          <MapContainer center={[42.35, -71.8]} zoom={9} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {validTowns.length > 0 && <MapBoundsUpdater towns={validTowns} />}
            {validTowns.map((town) => (
              <CircleMarker
                key={town.town}
                center={[town.lat!, town.lon!]}
                radius={getRadius(town.totalOutages, maxOutages)}
                pathOptions={{
                  color: getColor(town.totalOutages, maxOutages),
                  fillColor: getColor(town.totalOutages, maxOutages),
                  fillOpacity: 0.6,
                  weight: 2,
                }}
                eventHandlers={{ click: () => setSelectedTown(town) }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">{town.town}</div>
                    <div>{town.totalOutages} outages</div>
                    <div>{town.totalCustomersAffected.toLocaleString()} customers affected</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </Card>
    </div>
  );
}

function SearchTab({ stats }: { stats: HistoricalStats | null }) {
  const [searchLoading, setSearchLoading] = useState(false);
  const [outages, setOutages] = useState<HistoricalOutage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("incidentStart");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [searchText, setSearchText] = useState("");
  const [utility, setUtility] = useState("");
  const [year, setYear] = useState("");

  const doSearch = async (newPage = 0) => {
    setSearchLoading(true);
    setPage(newPage);
    try {
      const params = new URLSearchParams();
      if (searchText) params.set("town", searchText);
      if (utility && utility !== "__all__") params.set("utility", utility);
      if (year && year !== "__all__") params.set("year", year);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(newPage * PAGE_SIZE));
      const data = await apiFetch<HistoricalResponse>(`/api/historical?${params.toString()}`);
      setOutages(data.outages);
      setTotal(data.total);
    } catch (e) {
      console.error("Search failed:", e);
      setOutages([]);
      setTotal(0);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => { doSearch(0); }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedOutages = useMemo(() => {
    const sorted = [...outages];
    sorted.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [outages, sortField, sortDir]);

  const summaryStats = useMemo(() => {
    const totalCustomers = outages.reduce((sum, o) => sum + (o.customersOut || 0), 0);
    const durationsWithValue = outages.filter((o) => o.durationHours != null);
    const avgDuration = durationsWithValue.length > 0
      ? durationsWithValue.reduce((sum, o) => sum + (o.durationHours || 0), 0) / durationsWithValue.length
      : 0;
    return { totalCustomers, avgDuration };
  }, [outages]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="h-4 w-4 inline ml-1" /> : <ChevronDown className="h-4 w-4 inline ml-1" />;
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort(field)} data-testid={`header-${field}`}>
      {children}
      <SortIcon field={field} />
    </TableHead>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" data-testid="text-search-title">Search Historical Outages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label htmlFor="search" className="text-sm">Town or Street</Label>
              <Input
                id="search"
                placeholder="Search town or street..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch(0)}
                data-testid="input-search"
              />
            </div>
            <div>
              <Label className="text-sm">Utility</Label>
              <Select value={utility} onValueChange={setUtility}>
                <SelectTrigger data-testid="select-utility">
                  <SelectValue placeholder="All utilities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All utilities</SelectItem>
                  {stats?.utilities.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger data-testid="select-year">
                  <SelectValue placeholder="All years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All years</SelectItem>
                  {stats?.years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => doSearch(0)} disabled={searchLoading} className="w-full" data-testid="button-search">
                {searchLoading ? <Spinner className="h-4 w-4 mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-500 opacity-60" />
              <div>
                <p className="text-sm text-muted-foreground">Incidents</p>
                <p className="text-2xl font-bold" data-testid="stat-total-incidents">{total.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500 opacity-60" />
              <div>
                <p className="text-sm text-muted-foreground">Customers Affected</p>
                <p className="text-2xl font-bold" data-testid="stat-customers">{summaryStats.totalCustomers.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-green-500 opacity-60" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
                <p className="text-2xl font-bold" data-testid="stat-avg-duration">{summaryStats.avgDuration.toFixed(1)} hrs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {searchLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="h-8 w-8" />
            </div>
          ) : outages.length === 0 ? (
            <EmptyState title="No outages found" description="Try adjusting your search filters." testId="state-no-results" />
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader field="town">Town</SortableHeader>
                      <SortableHeader field="street">Street</SortableHeader>
                      <SortableHeader field="customersOut">Customers</SortableHeader>
                      <SortableHeader field="durationHours">Duration (hrs)</SortableHeader>
                      <SortableHeader field="cause">Cause</SortableHeader>
                      <SortableHeader field="incidentStart">Date</SortableHeader>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedOutages.map((outage) => (
                      <TableRow key={outage.id} data-testid={`row-outage-${outage.id}`}>
                        <TableCell className="font-medium">{outage.town}</TableCell>
                        <TableCell>{outage.street || "—"}</TableCell>
                        <TableCell>{outage.customersOut?.toLocaleString() || "—"}</TableCell>
                        <TableCell>{outage.durationHours?.toFixed(1) || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{outage.cause || "—"}</TableCell>
                        <TableCell>
                          {outage.incidentStart ? new Date(outage.incidentStart).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground" data-testid="text-page-info">
                  Showing {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => doSearch(page - 1)} data-testid="button-prev">
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => doSearch(page + 1)} data-testid="button-next">
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DirectoryTab() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: DocumentsResponse }>({ loading: true });

  const fetchKey = useMemo(() => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    return `/api/documents?${qs.toString()}`;
  }, [q]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    apiFetch<DocumentsResponse>(fetchKey, { timeoutMs: 12000 })
      .then((data) => setState({ loading: false, data }))
      .catch((e: any) => setState({ loading: false, error: e?.message ?? "Failed to load documents" }));
  }, [fetchKey]);

  const items: DocumentRow[] = state.data?.items ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="text-base" data-testid="text-docs-title">Document Directory</CardTitle>
            <div className="text-xs text-muted-foreground" data-testid="text-docs-sub">
              Search reliability documents and extracted SAIDI/SAIFI/CAIDI metrics.
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, providers, tags..."
            data-testid="input-docs-search"
          />
          <Button variant="secondary" onClick={() => setQ("")} data-testid="button-docs-clear">
            Clear
          </Button>
        </div>

        {state.error ? (
          <div className="text-xs text-muted-foreground" data-testid="text-docs-error">
            API unreachable: {state.error}
          </div>
        ) : null}

        {state.loading ? (
          <div className="rounded-xl border bg-card p-6" data-testid="state-docs-loading">
            <div className="text-sm font-medium">Loading documents...</div>
            <div className="text-sm text-muted-foreground mt-1">Searching and scoring relevance.</div>
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No matching documents" description='Try a different keyword (e.g., SAIDI, storm, reliability).' testId="state-docs-empty" />
        ) : (
          <div className="rounded-xl border overflow-hidden" data-testid="table-docs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead className="w-[220px]">Metrics</TableHead>
                  <TableHead className="w-[120px] text-right">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id} data-testid={`row-doc-${d.id}`}>
                    <TableCell>
                      <div className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold" data-testid={`text-doc-title-${d.id}`}>{d.title}</div>
                          {d.provider && <Badge variant="outline" className="rounded-full" data-testid={`badge-doc-provider-${d.id}`}>{d.provider}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid={`text-doc-snippet-${d.id}`}>{d.snippet}</div>
                        <div className="flex flex-wrap gap-2">
                          {d.tags.slice(0, 4).map((t) => (
                            <Badge key={t} variant="secondary" className="rounded-full">{t}</Badge>
                          ))}
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noreferrer" className="text-xs underline text-primary">Open</a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {d.metrics.slice(0, 3).map((m, i) => (
                          <MetricPill key={i} t={m.type} v={m.value} unit={m.unit} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{d.year ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
