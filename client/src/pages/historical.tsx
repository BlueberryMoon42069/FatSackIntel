import { useState, useEffect, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Search, ChevronUp, ChevronDown, Users, Clock, AlertTriangle } from "lucide-react";

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

type SortField = "town" | "street" | "customersOut" | "durationHours" | "cause" | "incidentStart";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

export default function HistoricalPage() {
  const [stats, setStats] = useState<HistoricalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [outages, setOutages] = useState<HistoricalOutage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("incidentStart");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [searchText, setSearchText] = useState("");
  const [utility, setUtility] = useState("");
  const [year, setYear] = useState("");
  const [cause, setCause] = useState("");

  useEffect(() => {
    apiFetch<HistoricalStats>("/api/historical/stats")
      .then((data) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const doSearch = async (newPage = 0) => {
    setSearchLoading(true);
    setPage(newPage);
    try {
      const params = new URLSearchParams();
      if (searchText) params.set("town", searchText);
      if (utility) params.set("utility", utility);
      if (year) params.set("year", year);
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

  useEffect(() => {
    doSearch(0);
  }, []);

  const handleSearch = () => {
    doSearch(0);
  };

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
    const avgDuration =
      durationsWithValue.length > 0
        ? durationsWithValue.reduce((sum, o) => sum + (o.durationHours || 0), 0) / durationsWithValue.length
        : 0;
    return { totalCustomers, avgDuration };
  }, [outages]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 inline ml-1" />
    );
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => handleSort(field)}
      data-testid={`header-${field}`}
    >
      {children}
      <SortIcon field={field} />
    </TableHead>
  );

  if (loading) {
    return (
      <AppShell subtitle="Historical outage records from DPU filings">
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell subtitle="Historical outage records from DPU filings">
      <div className="grid gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" data-testid="text-historical-title">
              Search Historical Outages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label htmlFor="search" className="text-sm">
                  Town or Street
                </Label>
                <Input
                  id="search"
                  placeholder="Search town or street..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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
                    <SelectItem value="">All utilities</SelectItem>
                    {stats?.utilities.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
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
                    <SelectItem value="">All years</SelectItem>
                    {stats?.years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleSearch}
                  disabled={searchLoading}
                  className="w-full"
                  data-testid="button-search"
                >
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
                  <p className="text-2xl font-bold" data-testid="stat-total-incidents">
                    {total.toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold" data-testid="stat-customers">
                    {summaryStats.totalCustomers.toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold" data-testid="stat-avg-duration">
                    {summaryStats.avgDuration.toFixed(1)} hrs
                  </p>
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
              <EmptyState
                title="No outages found"
                description="Try adjusting your search filters."
                testId="state-no-results"
              />
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
                            {outage.incidentStart
                              ? new Date(outage.incidentStart).toLocaleDateString()
                              : "—"}
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => doSearch(page - 1)}
                      data-testid="button-prev"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => doSearch(page + 1)}
                      data-testid="button-next"
                    >
                      Next
                    </Button>
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
