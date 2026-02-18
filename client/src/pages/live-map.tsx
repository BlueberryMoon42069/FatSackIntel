import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import { OutageDetailDrawer } from "@/components/OutageDetailDrawer";
import { apiFetch } from "@/lib/api";
import { useOutagesWebSocket } from "@/hooks/use-outages-ws";
import type { FeatureCollection, Geometry } from "geojson";

import { MapContainer, TileLayer, GeoJSON, useMapEvents } from "react-leaflet";
import type { LeafletEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

type ProviderKey = "mema" | "eversource" | "national_grid" | "unitil";

type OutageApiResponse = {
  updatedAt: string;
  providers: ProviderKey[];
  features: FeatureCollection<Geometry, any>;
};

type BBox = { west: number; south: number; east: number; north: number };

function bboxKey(b: BBox, providers: ProviderKey[]) {
  const p = [...providers].sort().join(",");
  return `${p}|${b.west.toFixed(3)},${b.south.toFixed(3)},${b.east.toFixed(3)},${b.north.toFixed(3)}`;
}

function boundsToBBox(bounds: any): BBox {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat };
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

function MapEvents(props: { onMoveEnd: (bbox: BBox) => void }) {
  useMapEvents({
    moveend(e: LeafletEvent) {
      props.onMoveEnd(boundsToBBox((e as any).target.getBounds()));
    },
    zoomend(e: LeafletEvent) {
      props.onMoveEnd(boundsToBBox((e as any).target.getBounds()));
    },
  });
  return null;
}

function formatHoursOut(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return `${days}d ${remaining.toFixed(0)}h`;
}

function severityLabel(score: number): { text: string; color: string; bgColor: string } {
  if (score >= 0.7) return { text: "Critical", color: "text-red-700", bgColor: "bg-red-100 border-red-300" };
  if (score >= 0.5) return { text: "High", color: "text-orange-700", bgColor: "bg-orange-100 border-orange-300" };
  if (score >= 0.3) return { text: "Medium", color: "text-yellow-700", bgColor: "bg-yellow-100 border-yellow-300" };
  return { text: "Low", color: "text-green-700", bgColor: "bg-green-100 border-green-300" };
}

function severityColor(score: number): string {
  if (score >= 0.7) return "#dc2626";
  if (score >= 0.5) return "#ea580c";
  if (score >= 0.3) return "#d97706";
  return "#2563eb";
}

export default function LiveMapPage() {
  const [providers, setProviders] = useState<ProviderKey[]>(["mema", "eversource", "national_grid", "unitil"]);
  const [bbox, setBbox] = useState<BBox>({
    west: -73.6,
    south: 41.2,
    east: -69.8,
    north: 42.9,
  });

  const debouncedBbox = useDebouncedValue(bbox, 350);
  const debouncedProviders = useDebouncedValue(providers, 150);

  const cacheRef = useRef(new Map<string, OutageApiResponse>());
  const abortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    updatedAt?: string;
    data?: OutageApiResponse;
  }>({ loading: true });

  const providerToggles: { key: ProviderKey; label: string }[] = [
    { key: "mema", label: "MEMA" },
    { key: "eversource", label: "Eversource" },
    { key: "national_grid", label: "National Grid" },
    { key: "unitil", label: "Unitil" },
  ];

  const url = useMemo(() => {
    const p = debouncedProviders.join(",");
    const b = debouncedBbox;
    const qs = new URLSearchParams();
    qs.set("providers", p);
    qs.set("bbox", `${b.west},${b.south},${b.east},${b.north}`);
    return `/api/outages?${qs.toString()}`;
  }, [debouncedBbox, debouncedProviders]);

  useEffect(() => {
    const key = bboxKey(debouncedBbox, debouncedProviders);

    const cached = cacheRef.current.get(key);
    if (cached) {
      setState({
        loading: false,
        data: cached,
        updatedAt: cached.updatedAt,
      });
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((s) => ({ ...s, loading: true, error: undefined }));

    apiFetch<OutageApiResponse>(url, { signal: controller.signal, timeoutMs: 10000 })
      .then((data) => {
        if (controller.signal.aborted) return;
        cacheRef.current.set(key, data);
        setState({
          loading: false,
          data,
          updatedAt: data.updatedAt,
        });
      })
      .catch((e: any) => {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e?.message ?? "Failed to load outages",
        }));
      });

    return () => controller.abort();
  }, [url, debouncedBbox, debouncedProviders]);

  const { connected: wsConnected } = useOutagesWebSocket();

  const [selectedOutageId, setSelectedOutageId] = useState<string | number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const outageList = useMemo(() => {
    if (!state.data?.features?.features) return [];
    return state.data.features.features
      .map((f: any) => ({
        id: f.properties?.id,
        provider: f.properties?.provider,
        customers: f.properties?.customers ?? 0,
        status: f.properties?.status,
        location: f.properties?.location || "Unknown Area",
        town: f.properties?.town || null,
        hoursOut: f.properties?.hoursOut ?? 0,
        severity: f.properties?.severity ?? 0,
        knockScore: f.properties?.knockScore,
        outageScore: f.properties?.outageScore,
        socialScore: f.properties?.socialScore,
        solarScore: f.properties?.solarScore,
      }))
      .sort((a, b) => (b.severity || 0) - (a.severity || 0));
  }, [state.data]);

  const featureCount = state.data?.features?.features?.length ?? 0;
  const totalAffected = useMemo(() => outageList.reduce((sum, o) => sum + o.customers, 0), [outageList]);

  // Historical outages for active towns
  const activeTowns = useMemo(() => {
    const towns = new Set<string>();
    outageList.forEach(o => { if (o.town) towns.add(o.town); });
    return Array.from(towns);
  }, [outageList]);

  const [historicalData, setHistoricalData] = useState<Record<string, { totalOutages: number; totalCustomersAffected: number; avgDurationMinutes: number }>>({});

  useEffect(() => {
    setHistoricalData({});
    if (activeTowns.length === 0) return;
    const results: Record<string, any> = {};
    Promise.allSettled(
      activeTowns.map(town =>
        apiFetch<any>(`/api/historical/summary?town=${encodeURIComponent(town)}`, { timeoutMs: 5000 })
          .then(data => { if (data.totalOutages > 0) results[town] = data; })
      )
    ).then(() => setHistoricalData(results));
  }, [activeTowns.join(",")]);

  return (
    <AppShell subtitle="Real-time outage monitoring with severity scoring and historical context.">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="grid gap-4 h-[70vh] overflow-y-auto pr-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base" data-testid="text-live-title">
                  Live Outage Map
                </CardTitle>
                <Badge
                  variant="outline"
                  className={wsConnected
                    ? "bg-green-50 text-green-700 border-green-300"
                    : "bg-yellow-50 text-yellow-700 border-yellow-300"}
                >
                  {wsConnected ? "Live" : "Polling"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground" data-testid="text-live-providers">
                    Providers
                  </div>
                </div>
                <div className="grid gap-2">
                  {providerToggles.map((p) => {
                    const on = providers.includes(p.key);
                    return (
                      <div key={p.key} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                        <div className="text-sm" data-testid={`text-provider-${p.key}`}>{p.label}</div>
                        <Switch
                          checked={on}
                          onCheckedChange={(v) => {
                            setProviders((cur) => {
                              const set = new Set(cur);
                              if (v) set.add(p.key);
                              else set.delete(p.key);
                              return Array.from(set);
                            });
                          }}
                          data-testid={`toggle-provider-${p.key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground" data-testid="text-live-status">
                    Status
                  </div>
                  {state.loading ? <Spinner data-testid="spinner-live" /> : null}
                </div>
                <div className="rounded-lg border bg-card p-3 grid gap-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium" data-testid="text-live-count">
                      {featureCount} active outage{featureCount !== 1 ? "s" : ""}
                    </div>
                    {totalAffected > 0 && (
                      <div className="text-xs text-muted-foreground" data-testid="text-live-total-affected">
                        {totalAffected.toLocaleString()} total affected
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-live-updated">
                    Updated: {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "—"}
                  </div>
                  {state.error ? (
                    <div className="text-xs text-destructive" data-testid="text-live-error">
                      {state.error}
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    cacheRef.current.clear();
                    setState((s) => ({ ...s }));
                  }}
                  data-testid="button-live-clear-cache"
                >
                  Clear client cache
                </Button>
              </div>
            </CardContent>
          </Card>

          {outageList.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Active Outages by Severity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 p-0">
                <div className="max-h-[300px] overflow-y-auto px-4 pb-4">
                  {outageList.map((outage) => {
                    const sev = severityLabel(outage.severity);
                    return (
                      <div 
                        key={outage.id}
                        className={`p-2.5 rounded-md border mb-2 cursor-pointer transition-colors ${selectedOutageId === outage.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted'}`}
                        onClick={() => {
                          setSelectedOutageId(outage.id);
                          setDrawerOpen(true);
                        }}
                        data-testid={`outage-item-${outage.id}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-medium text-sm truncate" data-testid={`outage-location-${outage.id}`}>
                            {outage.location}
                          </div>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${sev.bgColor} ${sev.color}`}>
                            {sev.text}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium uppercase" data-testid={`outage-provider-${outage.id}`}>
                            {outage.provider}
                          </span>
                          <span className="text-xs text-muted-foreground" data-testid={`outage-affected-${outage.id}`}>
                            {outage.customers.toLocaleString()} affected
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground" data-testid={`outage-hours-${outage.id}`}>
                            Out for {formatHoursOut(outage.hoursOut)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Score: {(outage.severity * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTowns.length > 0 && Object.keys(historicalData).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Historical Context</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">
                  Past DPU records for towns with active outages
                </div>
                {activeTowns.filter(t => historicalData[t]).map(town => {
                  const h = historicalData[town];
                  return (
                    <div key={town} className="rounded-lg border p-2.5" data-testid={`historical-town-${town}`}>
                      <div className="font-medium text-sm">{town}</div>
                      <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] text-muted-foreground">
                        <div>{h.totalOutages} incidents</div>
                        <div>{h.totalCustomersAffected.toLocaleString()} affected</div>
                        <div>Avg {Math.round(h.avgDurationMinutes)}m</div>
                      </div>
                      <Badge variant="outline" className="mt-1 text-[9px]">DPU</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {state.loading ? (
            <div className="rounded-xl border bg-card p-6 flex items-center gap-3" data-testid="state-loading">
              <Spinner className="h-5 w-5" />
              <div className="text-sm font-medium">Loading outages...</div>
            </div>
          ) : featureCount === 0 ? (
            <EmptyState
              title="No active outages reported"
              description="All systems appear to be operating normally in this area."
              testId="state-live-empty"
            />
          ) : null}
        </div>

        <Card className="overflow-hidden relative">
          <style>{`
            .leaflet-popup { z-index: 1000 !important; }
            .leaflet-popup-content-wrapper { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .leaflet-popup-content { margin: 0 !important; }
          `}</style>
          <div className="h-[70vh] min-h-[520px] w-full" data-testid="map-live">
            <MapContainer center={[42.35, -71.06] as any} zoom={8 as any} className="h-full w-full">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapEvents onMoveEnd={setBbox} />
              {state.data ? (
                <GeoJSON
                  key={`${state.data.updatedAt}-${featureCount}`}
                  data={state.data.features as any}
                  {...({
                    onEachFeature: (feature: any, layer: any) => {
                      layer.on('click', () => {
                        setSelectedOutageId(feature.properties?.id);
                        setDrawerOpen(true);
                      });
                      if (feature.properties) {
                        const props = feature.properties;
                        const sev = props.severity ?? 0;
                        const sevPct = (sev * 100).toFixed(0);
                        const knock = props.knockScore ? (props.knockScore * 100).toFixed(0) : 'N/A';
                        const hoursStr = props.hoursOut != null ? formatHoursOut(props.hoursOut) : '—';
                        
                        const sevColor = sev >= 0.7 ? '#dc2626' : sev >= 0.5 ? '#ea580c' : sev >= 0.3 ? '#d97706' : '#16a34a';
                        const sevText = sev >= 0.7 ? 'Critical' : sev >= 0.5 ? 'High' : sev >= 0.3 ? 'Medium' : 'Low';
                        
                        layer.bindPopup(`
                          <div style="padding: 10px; min-width: 220px; font-family: system-ui, sans-serif;">
                            <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
                              ${props.location || 'Unknown Area'}
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                              <span style="color: #6b7280;">Provider</span>
                              <span style="font-weight: 600; text-transform: uppercase;">${props.provider}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                              <span style="color: #6b7280;">Affected</span>
                              <span style="font-weight: 600;">${(props.customers ?? 0).toLocaleString()}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                              <span style="color: #6b7280;">Duration</span>
                              <span style="font-weight: 600;">${hoursStr}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                              <span style="color: #6b7280;">Severity</span>
                              <span style="font-weight: 700; color: ${sevColor};">${sevText} (${sevPct}%)</span>
                            </div>
                            <div style="border-top: 1px solid #e5e7eb; padding-top: 6px; font-size: 13px; font-weight: 600; color: #2563eb;">
                              Knock Score: ${knock}%
                            </div>
                            <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">Click for full details</div>
                          </div>
                        `, { maxWidth: 280, className: 'outage-popup' });
                      }
                    },
                    style: (f: any) => {
                      const sev = f?.properties?.severity ?? 0;
                      const color = severityColor(sev);
                      return {
                        color,
                        weight: 2,
                        fillColor: color,
                        fillOpacity: 0.2,
                      };
                    },
                    pointToLayer: (feature: any, latlng: any) => {
                      const sev = feature?.properties?.severity ?? 0;
                      const customers = feature?.properties?.customers ?? 0;
                      const color = severityColor(sev);
                      const radius = Math.max(6, Math.min(14, 6 + Math.log10(1 + customers) * 3));
                      const L = (window as any).L;
                      if (L?.circleMarker) {
                        return L.circleMarker(latlng, {
                          radius,
                          color,
                          weight: 2,
                          fillColor: color,
                          fillOpacity: 0.4,
                        });
                      }
                      return (window as any).L.marker(latlng);
                    },
                  } as any)}
                />
              ) : null}
            </MapContainer>
          </div>
        </Card>
      </div>
      
      <OutageDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        outage={outageList.find(o => o.id === selectedOutageId) || null}
      />
    </AppShell>
  );
}
