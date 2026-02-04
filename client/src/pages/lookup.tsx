import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, History, Info, Sun, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { mockScores } from "@/lib/mockData";

export default function LookupPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    // Simulate lookup across historical datasets
    setTimeout(() => {
      const scores = mockScores("30d");
      setResults(scores.cells.slice(0, 3).map((c, i) => ({
        ...c,
        address: i === 0 ? "123 Main St, Worcester, MA" : i === 1 ? "45 High St, Springfield, MA" : "89 Oak Ave, Pittsfield, MA",
        history: [
          { date: "2023-12-14", duration: "142 min", cause: "Equipment Failure" },
          { date: "2023-08-22", duration: "89 min", cause: "Severe Weather" },
          { date: "2022-11-05", duration: "210 min", cause: "Tree Down" },
        ]
      })));
      setSearching(false);
    }, 600);
  };

  return (
    <AppShell subtitle="Deep lookup for specific streets, areas, or coordinates.">
      <div className="grid gap-6">
        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Location Intelligence Lookup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search street, town, or H3 cell..."
                  className="pl-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  data-testid="input-lookup-search"
                />
              </div>
              <Button onClick={handleSearch} disabled={searching} data-testid="button-lookup-submit">
                {searching ? "Searching..." : "Lookup"}
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Example: "Worcester", "Main Street", or "892a10d0b7fffff"
            </div>
          </CardContent>
        </Card>

        {results.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((r, i) => (
              <Card key={i} className="overflow-hidden border-muted hover:border-primary/50 transition-colors">
                <CardHeader className="bg-muted/30 pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-semibold">{r.address}</CardTitle>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">{r.h3}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 grid gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-card p-2 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground font-semibold">Risk Score</div>
                      <div className="text-lg font-bold text-primary">{(r.score * 100).toFixed(0)}</div>
                    </div>
                    <div className="rounded-lg border bg-card p-2 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground font-semibold">Reliability</div>
                      <div className="text-lg font-bold">Top 15%</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 grid gap-2">
                    <div className="text-xs font-semibold flex items-center gap-1 text-yellow-700">
                      <Sun className="h-3 w-3" />
                      Solar Potential (Mockup)
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                       <div className="text-muted-foreground">Roof Tilt: <span className="text-foreground font-medium">{r.solar?.roof_tilt?.toFixed(1)}°</span></div>
                       <div className="text-muted-foreground">Azimuth: <span className="text-foreground font-medium">{r.solar?.roof_azimuth?.toFixed(1)}°</span></div>
                       <div className="text-muted-foreground">Shading: <span className="text-foreground font-medium">{(r.solar?.shading_factor * 100).toFixed(0)}%</span></div>
                       <div className="text-muted-foreground">kWh/kW: <span className="text-foreground font-medium">{r.solar?.kwh_per_kw}</span></div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-yellow-500/10 mt-1">
                      <span className="font-medium text-yellow-700">Annual Est:</span>
                      <span className="font-bold">{Math.round(r.solar?.kwh_per_kw * 6.5).toLocaleString()} kWh</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <div className="text-xs font-semibold flex items-center gap-1 text-blue-700">
                      <Activity className="h-3 w-3" />
                      Outage Intelligence
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border bg-card p-2">
                        <div className="text-[10px] text-muted-foreground uppercase">Events</div>
                        <div className="font-bold">{r.features?.events}</div>
                      </div>
                      <div className="rounded border bg-card p-2">
                        <div className="text-[10px] text-muted-foreground uppercase">Min Out</div>
                        <div className="font-bold">{r.features?.minutes_out}</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <div className="text-xs font-semibold flex items-center gap-1">
                      <History className="h-3 w-3" />
                      Recent Outage Events
                    </div>
                    <div className="grid gap-2">
                      {r.history.map((h: any, j: number) => (
                        <div key={j} className="text-xs flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-muted-foreground">{h.date}</span>
                          <span className="font-medium">{h.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-1">
                    <div className="text-xs font-semibold flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Context
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.top_reasons[0]}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !searching && query ? (
          <div className="py-12 text-center text-muted-foreground">
            No detailed results for "{query}" yet. Try searching by town name.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
