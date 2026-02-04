import { useState, useEffect, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import { apiFetch } from "@/lib/api";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type HeatmapTown = {
  town: string;
  totalOutages: number;
  totalCustomersAffected: number;
  totalDuration: number;
  avgDuration: number;
  lat: number | null;
  lon: number | null;
};

type HistoricalStats = {
  totalRecords: number;
  utilities: string[];
  years: number[];
  topTowns: { town: string; count: number }[];
};

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

export default function HeatmapPage() {
  const [towns, setTowns] = useState<HeatmapTown[]>([]);
  const [stats, setStats] = useState<HistoricalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [utility, setUtility] = useState("");
  const [year, setYear] = useState("");
  const [selectedTown, setSelectedTown] = useState<HeatmapTown | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (utility) params.set("utility", utility);
      if (year) params.set("year", year);
      
      const data = await apiFetch<HeatmapTown[]>(`/api/historical/heatmap?${params.toString()}`);
      setTowns(data);
    } catch (e) {
      console.error("Failed to load heatmap data:", e);
      setTowns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiFetch<HistoricalStats>("/api/historical/stats")
      .then((data) => setStats(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadData();
  }, [utility, year]);

  const validTowns = useMemo(() => towns.filter((t) => t.lat != null && t.lon != null), [towns]);
  const maxOutages = useMemo(() => Math.max(...validTowns.map((t) => t.totalOutages), 1), [validTowns]);

  return (
    <AppShell subtitle="Outage heatmap by town">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="grid gap-4 content-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base" data-testid="text-heatmap-title">
                Outage Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground">Utility</label>
                <Select value={utility} onValueChange={setUtility}>
                  <SelectTrigger data-testid="select-utility">
                    <SelectValue placeholder="All utilities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All utilities</SelectItem>
                    {stats?.utilities.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground">Year</label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger data-testid="select-year">
                    <SelectValue placeholder="All years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All years</SelectItem>
                    {stats?.years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-2">Legend</div>
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-500" />
                    <span className="text-sm">Few incidents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-yellow-500" />
                    <span className="text-sm">Moderate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-red-500" />
                    <span className="text-sm">Many incidents</span>
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
            <EmptyState
              title="No location data available"
              description="No towns with coordinates found for the selected filters."
              testId="state-no-data"
            />
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
                  eventHandlers={{
                    click: () => setSelectedTown(town),
                  }}
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
    </AppShell>
  );
}
