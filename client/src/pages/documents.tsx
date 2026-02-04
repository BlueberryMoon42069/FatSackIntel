import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { apiFetch } from "@/lib/api";

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

function MetricPill(props: { t: string; v: number; unit?: string }) {
  return (
    <Badge variant="secondary" className="rounded-full" data-testid={`badge-metric-${props.t}`}>
      {props.t}: {props.v}{props.unit ? ` ${props.unit}` : ""}
    </Badge>
  );
}

export default function DocumentsPage() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: DocumentsResponse }>({
    loading: true,
  });

  const fetchKey = useMemo(() => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    return `/api/documents?${qs.toString()}`;
  }, [q]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    apiFetch<DocumentsResponse>(fetchKey, { timeoutMs: 12000 })
      .then((data) => {
        setState({ loading: false, data });
      })
      .catch((e: any) => {
        setState({ loading: false, error: e?.message ?? "Failed to load documents" });
      });
  }, [fetchKey]);

  const items: DocumentRow[] = state.data?.items ?? [];

  return (
    <AppShell subtitle="Search reliability documents and extracted SAIDI/SAIFI/CAIDI metrics.">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle className="text-base" data-testid="text-docs-title">Historical Directory</CardTitle>
              <div className="text-xs text-muted-foreground" data-testid="text-docs-sub">
                Filter by keywords, provider, or year.
              </div>
            </div>
            <div className="flex items-center gap-2">
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles, providers, tags…"
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
              <div className="text-sm font-medium">Loading documents…</div>
              <div className="text-sm text-muted-foreground mt-1">Searching and scoring relevance.</div>
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="No matching documents" description="Try a different keyword (e.g., SAIDI, storm, reliability)." testId="state-docs-empty" />
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
                            {d.provider ? (
                              <Badge variant="outline" className="rounded-full" data-testid={`badge-doc-provider-${d.id}`}>{d.provider}</Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground" data-testid={`text-doc-snippet-${d.id}`}>{d.snippet}</div>
                          <div className="flex flex-wrap gap-2">
                            {d.tags.slice(0, 4).map((t) => (
                              <Badge key={t} variant="secondary" className="rounded-full" data-testid={`badge-doc-tag-${d.id}-${t}`}>{t}</Badge>
                            ))}
                            {d.url ? (
                              <a href={d.url} target="_blank" rel="noreferrer" className="text-xs underline text-primary" data-testid={`link-doc-url-${d.id}`}>
                                Open
                              </a>
                            ) : null}
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
                      <TableCell className="text-right" data-testid={`text-doc-year-${d.id}`}>{d.year ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
