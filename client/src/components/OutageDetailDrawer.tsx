import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { 
  AlertTriangle, 
  Clock, 
  Users, 
  Zap, 
  TrendingUp,
  Calendar,
  MapPin,
  Calculator,
  Sun,
  ExternalLink,
} from "lucide-react";

type HistoricalSummary = {
  town: string | null;
  street: string | null;
  totalOutages: number;
  totalCustomersAffected: number;
  avgDurationMinutes: number;
  avgCustomersAffected: number;
  mostCommonCauses: { cause: string; count: number }[];
  recentOutages: {
    id: number;
    date: string;
    customersAffected: number;
    durationMinutes: number;
    cause: string;
    street: string;
    utility: string;
  }[];
  yearlyBreakdown: Record<string, { count: number; customers: number }>;
};

type OutageInfo = {
  id: string | number;
  location: string;
  provider: string;
  customers: number;
  status: string;
  knockScore?: number;
  outageScore?: number;
  socialScore?: number;
  solarScore?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outage: OutageInfo | null;
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

export function OutageDetailDrawer({ open, onOpenChange, outage }: Props) {
  const [, navigate] = useLocation();
  const [historicalData, setHistoricalData] = useState<HistoricalSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !outage?.location) {
      setHistoricalData(null);
      return;
    }

    const fetchHistorical = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Parse location - could be "TOWN" or "Street, Town" or "Town, MA" format
        const locationParts = outage.location.split(/[,\-]/);
        let town = "";
        let street = "";
        
        if (locationParts.length >= 2) {
          // Assume format like "123 Main St, BOSTON" or "Main St - Worcester"
          street = locationParts[0].trim().toUpperCase();
          town = locationParts[locationParts.length - 1].trim().toUpperCase().replace(/\s*(MA|MASSACHUSETTS)$/i, "").trim();
        } else {
          // Single part - assume it's the town name
          town = outage.location.trim().toUpperCase().replace(/\s*(MA|MASSACHUSETTS)$/i, "").trim();
        }
        
        // Build query params
        const params = new URLSearchParams();
        if (town) params.set("town", town);
        if (street) params.set("street", street);
        
        const data = await apiFetch<HistoricalSummary>(
          `/api/historical/summary?${params.toString()}`
        );
        setHistoricalData(data);
      } catch (e: any) {
        console.error("Failed to fetch historical data:", e);
        setError("Could not load historical data");
        setHistoricalData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchHistorical();
  }, [open, outage?.location]);

  if (!outage) return null;

  const knockScore = outage.knockScore ? (outage.knockScore * 100).toFixed(0) : "N/A";
  const outageRisk = outage.outageScore ? (outage.outageScore * 100).toFixed(0) : "N/A";
  const socialSignal = outage.socialScore ? (outage.socialScore * 100).toFixed(0) : "N/A";
  const solarPotential = outage.solarScore ? (outage.solarScore * 100).toFixed(0) : "N/A";

  const handleOpenCalculator = () => {
    navigate(`/calculator?address=${encodeURIComponent(outage.location)}`);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2" data-testid="text-drawer-title">
            <MapPin className="h-5 w-5" />
            {outage.location}
          </SheetTitle>
          <SheetDescription>
            <Badge variant={outage.customers > 100 ? "destructive" : "secondary"} className="mr-2">
              {outage.customers.toLocaleString()} Affected
            </Badge>
            <Badge variant="outline" className="uppercase">
              {outage.provider}
            </Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="p-4 bg-gradient-to-br from-primary/10 to-background rounded-lg border">
            <div className="text-sm font-medium text-muted-foreground mb-1">Knock Score</div>
            <div className="text-4xl font-bold text-primary" data-testid="text-knock-score">
              {knockScore}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Priority score for solar outreach
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-card rounded-lg border">
              <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-orange-500" />
              <div className="text-lg font-bold" data-testid="text-outage-risk">{outageRisk}%</div>
              <div className="text-xs text-muted-foreground">Outage Risk</div>
            </div>
            <div className="text-center p-3 bg-card rounded-lg border">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-blue-500" />
              <div className="text-lg font-bold" data-testid="text-social-signal">{socialSignal}%</div>
              <div className="text-xs text-muted-foreground">Social Signal</div>
            </div>
            <div className="text-center p-3 bg-card rounded-lg border">
              <Sun className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
              <div className="text-lg font-bold" data-testid="text-solar-potential">{solarPotential}%</div>
              <div className="text-xs text-muted-foreground">Solar Potential</div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Historical Outage Data
            </h4>
            
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="h-5 w-5" />
                <span className="ml-2 text-sm text-muted-foreground">Loading historical data...</span>
              </div>
            ) : error ? (
              <div className="text-sm text-muted-foreground bg-muted rounded-lg p-4">
                {error}
              </div>
            ) : historicalData && historicalData.totalOutages > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium">Total Incidents</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-total-incidents">
                      {historicalData.totalOutages.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Total Affected</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-total-affected">
                      {historicalData.totalCustomersAffected.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Avg Duration</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-avg-duration">
                      {formatDuration(historicalData.avgDurationMinutes)}
                    </div>
                  </div>
                  <div className="p-3 bg-card rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Avg Affected</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-avg-affected">
                      {historicalData.avgCustomersAffected.toLocaleString()}
                    </div>
                  </div>
                </div>

                {historicalData.mostCommonCauses.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">Common Causes</h5>
                    <div className="flex flex-wrap gap-2">
                      {historicalData.mostCommonCauses.map((c) => (
                        <Badge key={c.cause} variant="outline">
                          {c.cause} ({c.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {historicalData.recentOutages.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">Recent Incidents</h5>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {historicalData.recentOutages.slice(0, 5).map((o) => (
                        <div key={o.id} className="text-sm p-2 bg-muted rounded-md">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {new Date(o.date).toLocaleDateString()}
                            </span>
                            <span className="font-medium">{o.customersAffected} affected</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>{o.cause || "Unknown cause"}</span>
                            <span>{formatDuration(o.durationMinutes)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted rounded-lg p-4">
                No historical outage data available for this location.
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <Button 
              className="w-full gap-2" 
              onClick={handleOpenCalculator}
              data-testid="button-open-calculator"
            >
              <Calculator className="h-4 w-4" />
              Calculate Solar Savings
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => navigate(`/historical?town=${encodeURIComponent(outage.location.toUpperCase())}`)}
              data-testid="button-view-history"
            >
              <Calendar className="h-4 w-4" />
              View Full History
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
