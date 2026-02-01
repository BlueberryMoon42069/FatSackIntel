import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { apiWithFallback } from "@/lib/api";
import { downloadTextFile, toCsv } from "@/lib/csv";
import {
  mockScores,
  type ScoresApiResponse,
  type ScoreCell,
  type ScoreWindow,
} from "@/lib/mockData";

function fmt(n: number | undefined, digits = 3) {
  if (n === undefined || n === null) return "—";
  return Number(n).toFixed(digits);
}

function boostRows(cell: ScoreCell) {
  return [
    { k: "Outage score", v: cell.score_outage, hint: "Events/minutes + episode detection" },
    { k: "Heat", v: cell.boosts.heat ?? 0, hint: "+0.10 top quartile electric heat share" },
    { k: "No gas", v: cell.boosts.noGas ?? 0, hint: "+0.08 limited gas coverage" },
    { k: "Repeat-day", v: cell.boosts.repeatDay ?? 0, hint: "+0.08 repeated across days" },
    { k: "Large", v: cell.boosts.large ?? 0, hint: "+0.05 large footprint" },
    { k: "Social", v: cell.boosts.social ?? 0, hint: "Up to +0.05 capped; multiplier max +5%" },
  ];
}

export default function RankingsPage() {
  const [window, setWindow] = useState<ScoreWindow>("24h");
  const [sortBy, setSortBy] = useState<"score" | "minutes" | "events">("score");
  const [selected, setSelected] = useState<string | null>(null);

  const [state, setState] = useState<{ loading: boolean; source?: "api" | "mock"; error?: string; data?: ScoresApiResponse }>({
    loading: true,
  });

  useMemo(() => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    apiWithFallback<ScoresApiResponse>(
      `/api/scores?window=${encodeURIComponent(window)}`,
      () => mockScores(window),
      { timeoutMs: 12000 },
    ).then((r) => {
      setState({
        loading: false,
        data: r.data,
        source: r.source,
        error: r.source === "mock" ? r.error?.message : undefined,
      });
    });
  }, [window]);

  const rows = (state.data?.cells ?? []).slice();

  const sorted = useMemo(() => {
    const list = rows.slice();
    list.sort((a, b) => {
      if (sortBy === "minutes") return (b.features.minutes_out ?? 0) - (a.features.minutes_out ?? 0);
      if (sortBy === "events") return (b.features.events ?? 0) - (a.features.events ?? 0);
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return list;
  }, [rows, sortBy]);

  const selectedCell = useMemo(() => {
    const id = selected ?? sorted[0]?.h3;
    return sorted.find((c) => c.h3 === id) ?? null;
  }, [selected, sorted]);

  useMemo(() => {
    if (!selected && sorted[0]?.h3) setSelected(sorted[0].h3);
  }, [selected, sorted]);

  const exportCsv = () => {
    const out = sorted.map((c, idx) => ({
      rank: idx + 1,
      h3: c.h3,
      score: c.score,
      score_outage: c.score_outage,
      minutes_out: c.features.minutes_out,
      events: c.features.events,
      customers_affected_est: c.features.customers_affected_est,
      boost_heat: c.boosts.heat ?? 0,
      boost_no_gas: c.boosts.noGas ?? 0,
      boost_repeat_day: c.boosts.repeatDay ?? 0,
      boost_large: c.boosts.large ?? 0,
      boost_social: c.boosts.social ?? 0,
    }));
    downloadTextFile(`outageintel_ma_knocknow_${window}.csv`, toCsv(out));
  };

  return (
    <AppShell subtitle="Rank locations for outreach using outage episodes and risk-layer boosts.">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle className="text-base" data-testid="text-rankings-title">Knock Now Rankings</CardTitle>
                <div className="text-xs text-muted-foreground" data-testid="text-rankings-sub">
                  Window: {window}. Sort by score/minutes/events. Exportable.
                </div>
              </div>
              <div className="flex items-center gap-2">
                {state.source ? (
                  <Badge className="rounded-full" variant={state.source === "api" ? "secondary" : "outline"} data-testid="badge-rankings-source">
                    {state.source === "api" ? "API" : "Mock fallback"}
                  </Badge>
                ) : null}
                <Button variant="secondary" onClick={exportCsv} data-testid="button-export-csv">
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4">
            {state.error ? (
              <div className="text-xs text-muted-foreground" data-testid="text-rankings-error">
                API unreachable: {state.error}
              </div>
            ) : null}

            <Tabs value={window} onValueChange={(v) => setWindow(v as ScoreWindow)}>
              <TabsList data-testid="tabs-window">
                <TabsTrigger value="24h" data-testid="tab-24h">24h</TabsTrigger>
                <TabsTrigger value="7d" data-testid="tab-7d">7d</TabsTrigger>
                <TabsTrigger value="30d" data-testid="tab-30d">30d</TabsTrigger>
              </TabsList>
              <TabsContent value={window} className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={sortBy === "score" ? "default" : "ghost"}
                    onClick={() => setSortBy("score")}
                    data-testid="button-sort-score"
                  >
                    Sort: Score
                  </Button>
                  <Button
                    size="sm"
                    variant={sortBy === "minutes" ? "default" : "ghost"}
                    onClick={() => setSortBy("minutes")}
                    data-testid="button-sort-minutes"
                  >
                    Sort: Minutes
                  </Button>
                  <Button
                    size="sm"
                    variant={sortBy === "events" ? "default" : "ghost"}
                    onClick={() => setSortBy("events")}
                    data-testid="button-sort-events"
                  >
                    Sort: Events
                  </Button>
                </div>

                <Separator className="my-3" />

                {state.loading ? (
                  <div className="rounded-xl border bg-card p-6" data-testid="state-rankings-loading">
                    <div className="text-sm font-medium">Loading scores…</div>
                    <div className="text-sm text-muted-foreground mt-1">Fetching top cells for {window}.</div>
                  </div>
                ) : sorted.length === 0 ? (
                  <EmptyState
                    title="No ranked cells yet"
                    description="Once the backend scoring job runs, results will appear here."
                    testId="state-rankings-empty"
                  />
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[64px]">Rank</TableHead>
                          <TableHead>Cell (H3)</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead className="text-right">Minutes</TableHead>
                          <TableHead className="text-right">Events</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sorted.slice(0, 50).map((c, idx) => {
                          const active = selectedCell?.h3 === c.h3;
                          return (
                            <TableRow
                              key={c.h3}
                              className={active ? "bg-muted/50" : ""}
                              onClick={() => setSelected(c.h3)}
                              data-testid={`row-cell-${c.h3}`}
                            >
                              <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="grid">
                                  <div className="font-mono text-xs" data-testid={`text-h3-${c.h3}`}>{c.h3}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {c.centroid.lat.toFixed(3)}, {c.centroid.lng.toFixed(3)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium" data-testid={`text-score-${c.h3}`}>{fmt(c.score)}</TableCell>
                              <TableCell className="text-right" data-testid={`text-minutes-${c.h3}`}>{c.features.minutes_out}</TableCell>
                              <TableCell className="text-right" data-testid={`text-events-${c.h3}`}>{c.features.events}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" data-testid="text-why-title">Why here</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!selectedCell ? (
              <EmptyState
                title="Select a cell"
                description="Click a ranked row to see the boost breakdown and top reasons."
                testId="state-why-empty"
              />
            ) : (
              <>
                <div className="rounded-xl border bg-card p-4 grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs" data-testid="text-why-h3">{selectedCell.h3}</div>
                    <Badge className="rounded-full" variant="secondary" data-testid="badge-why-score">
                      score {fmt(selectedCell.score)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-why-window">
                    Window: {selectedCell.window} • {selectedCell.centroid.lat.toFixed(3)}, {selectedCell.centroid.lng.toFixed(3)}
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-semibold text-muted-foreground" data-testid="text-why-breakdown">Breakdown</div>
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableBody>
                        {boostRows(selectedCell).map((r) => (
                          <TableRow key={r.k}>
                            <TableCell>
                              <div className="grid">
                                <div className="text-sm font-medium" data-testid={`text-breakdown-${r.k}`}>{r.k}</div>
                                <div className="text-xs text-muted-foreground">{r.hint}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs" data-testid={`text-breakdown-val-${r.k}`}>{fmt(r.v)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="text-sm font-semibold">Total</TableCell>
                          <TableCell className="text-right font-mono text-xs" data-testid="text-breakdown-total">{fmt(selectedCell.score)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-semibold text-muted-foreground" data-testid="text-why-reasons">Top reasons</div>
                  <div className="rounded-xl border bg-card p-4 grid gap-2" data-testid="panel-why-reasons">
                    {selectedCell.top_reasons.map((t, i) => (
                      <div key={i} className="text-sm" data-testid={`text-reason-${i}`}>• {t}</div>
                    ))}
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
