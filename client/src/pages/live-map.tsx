import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import { apiWithFallback } from "@/lib/api";
import {
  mockOutages,
  type OutageApiResponse,
  type ProviderKey,
} from "@/lib/mockData";

import { MapContainer, TileLayer, GeoJSON, useMapEvents } from "react-leaflet";
import type { LeafletEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

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

export default function LiveMapPage() {
  const [providers, setProviders] = useState<ProviderKey[]>(["mema", "mock"]);
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
    source?: "api" | "mock";
    updatedAt?: string;
    data?: OutageApiResponse;
  }>({ loading: true });

  const providerToggles: { key: ProviderKey; label: string }[] = [
    { key: "mema", label: "MEMA" },
    { key: "mock", label: "Mock" },
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
        source: "api",
        updatedAt: cached.updatedAt,
      });
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((s) => ({ ...s, loading: true, error: undefined }));

    apiWithFallback<OutageApiResponse>(
      url,
      () => mockOutages(debouncedProviders),
      { signal: controller.signal, timeoutMs: 10000 },
    ).then((r) => {
      if (controller.signal.aborted) return;
      cacheRef.current.set(key, r.data);
      setState({
        loading: false,
        data: r.data,
        source: r.source,
        updatedAt: r.data.updatedAt,
        error: r.source === "mock" ? r.error?.message : undefined,
      });
    });

    return () => controller.abort();
  }, [url, debouncedBbox, debouncedProviders]);

  const featureCount = state.data?.features?.features?.length ?? 0;

  return (
    <AppShell subtitle="Street-level geometry (when available) with provider toggles and live bbox querying.">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base" data-testid="text-live-title">
                Live Outage Map
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground" data-testid="text-live-providers">
                    Providers
                  </div>
                  {state.source ? (
                    <Badge
                      variant={state.source === "api" ? "secondary" : "outline"}
                      className="rounded-full"
                      data-testid="badge-live-source"
                    >
                      {state.source === "api" ? "API" : "Mock fallback"}
                    </Badge>
                  ) : null}
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
                  <div className="text-sm font-medium" data-testid="text-live-count">
                    {featureCount.toLocaleString()} features
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-live-updated">
                    Updated: {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "—"}
                  </div>
                  {state.error ? (
                    <div className="text-xs text-muted-foreground" data-testid="text-live-error">
                      Could not reach server. Using sample data.
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="secondary"
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

        <Card className="overflow-hidden">
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
                    style: (f: any) => {
                      const provider = f?.properties?.provider as string | undefined;
                      const color = provider === "mema" ? "#2563eb" : provider === "mock" ? "#7c3aed" : "#0ea5e9";
                      return {
                        color,
                        weight: 2,
                        fillColor: color,
                        fillOpacity: 0.15,
                      };
                    },
                    pointToLayer: (feature: any, latlng: any) => {
                      const provider = feature?.properties?.provider as string | undefined;
                      const color = provider === "mema" ? "#2563eb" : provider === "mock" ? "#7c3aed" : "#0ea5e9";
                      const L = (window as any).L;
                      if (L?.circleMarker) {
                        return L.circleMarker(latlng, {
                          radius: 7,
                          color,
                          weight: 2,
                          fillColor: color,
                          fillOpacity: 0.3,
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
    </AppShell>
  );
}
