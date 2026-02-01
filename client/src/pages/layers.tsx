import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { apiWithFallback } from "@/lib/api";
import { mockGasLayer, mockHeatingLayer, type GasLayerResponse, type HeatingLayerResponse } from "@/lib/mockData";

import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function LayersPage() {
  const [showGas, setShowGas] = useState(true);
  const [showHeating, setShowHeating] = useState(true);

  const cacheRef = useRef(new Map<string, any>());

  const [gasState, setGasState] = useState<{ loading: boolean; source?: "api" | "mock"; error?: string; data?: GasLayerResponse }>({
    loading: true,
  });
  const [heatState, setHeatState] = useState<{ loading: boolean; source?: "api" | "mock"; error?: string; data?: HeatingLayerResponse }>({
    loading: true,
  });

  useEffect(() => {
    const key = "gas";
    const cached = cacheRef.current.get(key);
    if (cached) setGasState({ loading: false, data: cached, source: "api" });

    setGasState((s) => ({ ...s, loading: true }));
    apiWithFallback<GasLayerResponse>("/api/layers/gas", mockGasLayer, { timeoutMs: 12000 }).then((r) => {
      cacheRef.current.set(key, r.data);
      setGasState({ loading: false, data: r.data, source: r.source, error: r.source === "mock" ? r.error?.message : undefined });
    });
  }, []);

  useEffect(() => {
    const key = "heating";
    const cached = cacheRef.current.get(key);
    if (cached) setHeatState({ loading: false, data: cached, source: "api" });

    setHeatState((s) => ({ ...s, loading: true }));
    apiWithFallback<HeatingLayerResponse>("/api/layers/heating", mockHeatingLayer, { timeoutMs: 12000 }).then((r) => {
      cacheRef.current.set(key, r.data);
      setHeatState({ loading: false, data: r.data, source: r.source, error: r.source === "mock" ? r.error?.message : undefined });
    });
  }, []);

  const hasAny = useMemo(() => {
    const gasCount = gasState.data?.features.features.length ?? 0;
    const heatCount = heatState.data?.features.features.length ?? 0;
    return gasCount + heatCount > 0;
  }, [gasState.data, heatState.data]);

  return (
    <AppShell subtitle="Overlay gas coverage and heating fuel proxies to inform boosts.">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base" data-testid="text-layers-title">Layers</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                  <div className="grid">
                    <div className="text-sm font-medium" data-testid="text-layer-gas">Gas coverage</div>
                    <div className="text-xs text-muted-foreground">Municipality coverage overlay</div>
                  </div>
                  <Switch checked={showGas} onCheckedChange={setShowGas} data-testid="toggle-layer-gas" />
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                  <div className="grid">
                    <div className="text-sm font-medium" data-testid="text-layer-heating">Electric heat share</div>
                    <div className="text-xs text-muted-foreground">ACS B25040 proxy overlay</div>
                  </div>
                  <Switch checked={showHeating} onCheckedChange={setShowHeating} data-testid="toggle-layer-heating" />
                </div>
              </div>

              <Separator />

              <div className="grid gap-2">
                <div className="text-xs font-semibold text-muted-foreground" data-testid="text-layer-legend">Legend</div>
                <div className="grid gap-2">
                  <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
                    <div className="text-sm">Gas coverage</div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ background: "#10b981" }} />
                      <span className="text-xs text-muted-foreground">has gas</span>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
                    <div className="text-sm">Electric heat share</div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ background: "#f59e0b" }} />
                      <span className="text-xs text-muted-foreground">higher share</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {gasState.source ? (
                    <Badge className="rounded-full" variant={gasState.source === "api" ? "secondary" : "outline"} data-testid="badge-gas-source">
                      Gas: {gasState.source === "api" ? "API" : "Mock"}
                    </Badge>
                  ) : null}
                  {heatState.source ? (
                    <Badge className="rounded-full" variant={heatState.source === "api" ? "secondary" : "outline"} data-testid="badge-heat-source">
                      Heating: {heatState.source === "api" ? "API" : "Mock"}
                    </Badge>
                  ) : null}
                </div>

                {(gasState.error || heatState.error) ? (
                  <div className="text-xs text-muted-foreground" data-testid="text-layers-error">
                    API unreachable: {gasState.error ?? heatState.error}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {!hasAny && !gasState.loading && !heatState.loading ? (
            <EmptyState title="No layer geometry" description="Once overlays are imported, they will display here." testId="state-layers-empty" />
          ) : null}
        </div>

        <Card className="overflow-hidden">
          <div className="h-[70vh] min-h-[520px] w-full" data-testid="map-layers">
            <MapContainer center={[42.35, -71.06] as any} zoom={8 as any} className="h-full w-full">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {showGas && gasState.data ? (
                <GeoJSON
                  key={`gas-${gasState.data.updatedAt}`}
                  data={gasState.data.features as any}
                  {...({
                    style: () => ({
                      color: "#10b981",
                      weight: 2,
                      fillColor: "#10b981",
                      fillOpacity: 0.12,
                    }),
                  } as any)}
                />
              ) : null}

              {showHeating && heatState.data ? (
                <GeoJSON
                  key={`heat-${heatState.data.updatedAt}`}
                  data={heatState.data.features as any}
                  {...({
                    style: (f: any) => {
                      const share = Number(f?.properties?.electric_heat_share ?? 0);
                      const opacity = Math.max(0.08, Math.min(0.35, 0.08 + share * 0.6));
                      return {
                        color: "#f59e0b",
                        weight: 2,
                        fillColor: "#f59e0b",
                        fillOpacity: opacity,
                      };
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
