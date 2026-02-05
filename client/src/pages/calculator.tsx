import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { 
  Calculator, 
  Download, 
  Sun, 
  Zap, 
  TrendingUp, 
  DollarSign,
  Home,
  FileText,
  Search,
  AlertTriangle,
} from "lucide-react";

// Preset options from the spreadsheet
const UTILITY_RATE_PRESETS = [
  { label: "Customer (from bill)", value: "customer", rate: 0 },
  { label: "New England Residential Avg", value: "new_england", rate: 0.2768 },
  { label: "Massachusetts Residential Avg", value: "massachusetts", rate: 0.2935 },
  { label: "National Grid MA", value: "national_grid", rate: 0.336 },
  { label: "Eversource (NSTAR)", value: "eversource", rate: 0.2991 },
  { label: "Unitil (Fitchburg)", value: "unitil", rate: 0.4008 },
];

const UTILITY_INCREASE_PRESETS = [
  { label: "Customer (custom)", value: "customer", rate: 0.0484 },
  { label: "MA 5yr (6.01%)", value: "ma_5yr", rate: 0.0601 },
  { label: "MA 10yr (5.37%)", value: "ma_10yr", rate: 0.0537 },
  { label: "MA 25yr (4.36%)", value: "ma_25yr", rate: 0.0436 },
  { label: "NE 5yr (5.57%)", value: "ne_5yr", rate: 0.0557 },
  { label: "National 5yr (4.84%)", value: "national_5yr", rate: 0.0484 },
];

const CPI_INFLATION_PRESETS = [
  { label: "National 10yr Avg (2.86%)", value: "national_10yr", rate: 0.0286 },
  { label: "National 5yr Avg (4.5%)", value: "national_5yr", rate: 0.045 },
  { label: "Custom", value: "custom", rate: 0.0286 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type YearlyData = {
  year: number;
  utilityMonthly: number;
  solarMonthly: number;
  savingsMonthly: number;
  savingsYearly: number;
  percentSaved: number;
  cumulativeSavings: number;
};

type HistoricalSummary = {
  totalOutages: number;
  totalCustomersAffected: number;
  avgDurationMinutes: number;
  avgCustomersAffected: number;
  mostCommonCauses: { cause: string; count: number }[];
  recentOutages: any[];
};

function calculateSavingsModel(inputs: {
  currentUtilityRate: number;
  monthlyUsage: number;
  utilityRateIncrease: number;
  solarMonthlyPayment: number;
  solarEscalator: number;
  solarOffset: number;
  rebatesYearly: number;
  years: number;
}): YearlyData[] {
  const data: YearlyData[] = [];
  let cumulativeSavings = 0;
  
  for (let year = 1; year <= inputs.years; year++) {
    const utilityRate = inputs.currentUtilityRate * Math.pow(1 + inputs.utilityRateIncrease, year - 1);
    const solarPayment = inputs.solarMonthlyPayment * Math.pow(1 + inputs.solarEscalator, year - 1);
    
    const utilityMonthly = utilityRate * inputs.monthlyUsage;
    // Solar covers offset%, remainder is utility
    const solarMonthly = solarPayment + (utilityRate * inputs.monthlyUsage * (1 - inputs.solarOffset));
    const rebateMonthly = inputs.rebatesYearly / 12;
    const savingsMonthly = utilityMonthly - solarMonthly + rebateMonthly;
    const savingsYearly = savingsMonthly * 12;
    cumulativeSavings += savingsYearly;
    
    data.push({
      year,
      utilityMonthly,
      solarMonthly,
      savingsMonthly,
      savingsYearly,
      percentSaved: utilityMonthly > 0 ? savingsMonthly / utilityMonthly : 0,
      cumulativeSavings,
    });
  }
  
  return data;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'percent', 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function CalculatorPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  
  // Main inputs
  const [inputs, setInputs] = useState({
    customerName: "",
    address: "",
    // Utility
    utilityRatePreset: "customer",
    utilityRateCustom: 0.359,
    utilityIncreasePreset: "national_5yr",
    utilityIncreaseCustom: 4.84,
    // Inflation
    cpiPreset: "national_10yr",
    cpiCustom: 2.86,
    // Solar
    solarMonthlyPayment: 156,
    solarEscalator: 3.5,
    solarOffset: 99,
    rebatesYearly: 400,
    termYears: 25,
  });

  // Monthly usage (12 months)
  const [monthlyUsage, setMonthlyUsage] = useState<number[]>([
    418, 346, 340, 322, 363, 317, 384, 516, 466, 388, 306, 322
  ]);

  // Current bill input (for calculating rate from bill)
  const [currentBill, setCurrentBill] = useState(160.20);
  const [currentMonthKwh, setCurrentMonthKwh] = useState(418);

  // Historical data for address
  const [historicalData, setHistoricalData] = useState<HistoricalSummary | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [searchedAddress, setSearchedAddress] = useState("");

  // Parse query params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const address = params.get("address");
    const name = params.get("name");
    if (address || name) {
      setInputs(prev => ({
        ...prev,
        ...(address && { address: decodeURIComponent(address) }),
        ...(name && { customerName: decodeURIComponent(name) }),
      }));
      if (address) {
        fetchHistoricalData(decodeURIComponent(address));
      }
    }
  }, []);

  // Fetch historical data for address
  const fetchHistoricalData = async (address: string) => {
    if (!address.trim()) return;
    
    setHistoricalLoading(true);
    setSearchedAddress(address);
    
    try {
      // Parse town from address
      const parts = address.split(/[,\-]/);
      let town = "";
      if (parts.length >= 2) {
        town = parts[parts.length - 1].trim().toUpperCase().replace(/\s*(MA|MASSACHUSETTS)$/i, "").trim();
      } else {
        town = address.trim().toUpperCase();
      }
      
      const data = await apiFetch<HistoricalSummary>(
        `/api/historical/summary?town=${encodeURIComponent(town)}`
      );
      setHistoricalData(data);
    } catch (e) {
      console.error("Failed to fetch historical data:", e);
      setHistoricalData(null);
    } finally {
      setHistoricalLoading(false);
    }
  };

  // Calculated values
  const yearlyKwh = useMemo(() => monthlyUsage.reduce((a, b) => a + b, 0), [monthlyUsage]);
  const avgMonthlyKwh = useMemo(() => Math.round(yearlyKwh / 12), [yearlyKwh]);
  const calculatedRateFromBill = currentMonthKwh > 0 ? currentBill / currentMonthKwh : 0.359;

  // Get effective utility rate
  const effectiveUtilityRate = useMemo(() => {
    if (inputs.utilityRatePreset === "customer") {
      return calculatedRateFromBill;
    }
    const preset = UTILITY_RATE_PRESETS.find(p => p.value === inputs.utilityRatePreset);
    return preset?.rate || 0.336;
  }, [inputs.utilityRatePreset, calculatedRateFromBill]);

  // Get effective utility increase
  const effectiveUtilityIncrease = useMemo(() => {
    if (inputs.utilityIncreasePreset === "customer") {
      return inputs.utilityIncreaseCustom / 100;
    }
    const preset = UTILITY_INCREASE_PRESETS.find(p => p.value === inputs.utilityIncreasePreset);
    return preset?.rate || 0.0484;
  }, [inputs.utilityIncreasePreset, inputs.utilityIncreaseCustom]);

  // Calculate yearly data
  const yearlyData = useMemo(() => calculateSavingsModel({
    currentUtilityRate: effectiveUtilityRate,
    monthlyUsage: avgMonthlyKwh,
    utilityRateIncrease: effectiveUtilityIncrease,
    solarMonthlyPayment: inputs.solarMonthlyPayment,
    solarEscalator: inputs.solarEscalator / 100,
    solarOffset: inputs.solarOffset / 100,
    rebatesYearly: inputs.rebatesYearly,
    years: inputs.termYears,
  }), [effectiveUtilityRate, avgMonthlyKwh, effectiveUtilityIncrease, inputs]);

  const year1 = yearlyData[0];
  const year10 = yearlyData[9] || yearlyData[yearlyData.length - 1];
  const yearFinal = yearlyData[yearlyData.length - 1];
  
  const first10YearsSavings = yearlyData.slice(0, 10).reduce((sum, y) => sum + y.savingsYearly, 0);
  const avgYearlySavingsFirst10 = first10YearsSavings / Math.min(10, yearlyData.length);

  // Calculate estimated monthly bills from usage
  const estimatedMonthlyBills = useMemo(() => {
    return monthlyUsage.map(kwh => kwh * effectiveUtilityRate);
  }, [monthlyUsage, effectiveUtilityRate]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Solar Savings Report - ${inputs.customerName || 'Customer'}</title>
        <style>
          @page { size: letter; margin: 0.5in; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
            line-height: 1.4;
            color: #1a1a1a;
            padding: 0.25in;
          }
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 2px solid #0066cc;
          }
          .header h1 { font-size: 20px; color: #0066cc; margin-bottom: 4px; }
          .header .subtitle { font-size: 12px; color: #666; }
          .header .date { font-size: 10px; color: #888; text-align: right; }
          .customer-info { 
            background: #f5f5f5; 
            padding: 10px 14px; 
            border-radius: 6px;
            margin-bottom: 16px;
          }
          .customer-info h3 { font-size: 14px; margin-bottom: 4px; }
          .customer-info p { color: #666; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .card { 
            background: white; 
            border: 1px solid #e0e0e0; 
            border-radius: 8px; 
            padding: 12px;
          }
          .card.highlight { background: #e8f5e9; border-color: #4caf50; }
          .card h4 { font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
          .card .value { font-size: 20px; font-weight: bold; color: #1a1a1a; }
          .card .value.green { color: #2e7d32; }
          .card .subtext { font-size: 9px; color: #888; margin-top: 2px; }
          .comparison { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 16px; 
            margin-bottom: 16px;
          }
          .comparison-box { 
            padding: 14px; 
            border-radius: 8px; 
            text-align: center;
          }
          .comparison-box.utility { background: #ffebee; border: 1px solid #ef9a9a; }
          .comparison-box.solar { background: #e8f5e9; border: 1px solid #a5d6a7; }
          .comparison-box h4 { font-size: 11px; margin-bottom: 8px; }
          .comparison-box .amount { font-size: 24px; font-weight: bold; }
          .comparison-box.utility .amount { color: #c62828; }
          .comparison-box.solar .amount { color: #2e7d32; }
          .table-section { margin-bottom: 16px; }
          .table-section h3 { font-size: 12px; margin-bottom: 8px; color: #333; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          th { background: #f5f5f5; padding: 6px 4px; text-align: left; border-bottom: 1px solid #ddd; }
          td { padding: 5px 4px; border-bottom: 1px solid #eee; }
          tr:nth-child(even) { background: #fafafa; }
          .positive { color: #2e7d32; }
          .footer { 
            margin-top: 16px; 
            padding-top: 12px; 
            border-top: 1px solid #ddd; 
            font-size: 9px; 
            color: #888;
            text-align: center;
          }
          .disclaimer { 
            background: #fff8e1; 
            padding: 8px 12px; 
            border-radius: 4px; 
            font-size: 8px; 
            color: #666;
            margin-top: 12px;
          }
          .inputs-summary { font-size: 9px; margin-bottom: 12px; }
          .inputs-summary td { padding: 3px 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>☀️ Solar Savings Analysis</h1>
            <div class="subtitle">${inputs.termYears}-Year Cost Comparison Report</div>
          </div>
          <div class="date">
            Generated: ${new Date().toLocaleDateString()}<br/>
            Report ID: ${Math.random().toString(36).substring(7).toUpperCase()}
          </div>
        </div>
        
        <div class="customer-info">
          <h3>${inputs.customerName || 'Customer'}</h3>
          <p>${inputs.address || 'Address not specified'}</p>
        </div>

        <table class="inputs-summary">
          <tr>
            <td><strong>Utility Rate:</strong> ${formatCurrencyDecimal(effectiveUtilityRate)}/kWh</td>
            <td><strong>Annual Increase:</strong> ${formatPercent(effectiveUtilityIncrease)}</td>
            <td><strong>Avg Monthly Usage:</strong> ${avgMonthlyKwh} kWh</td>
          </tr>
          <tr>
            <td><strong>Solar Payment:</strong> ${formatCurrency(inputs.solarMonthlyPayment)}/mo</td>
            <td><strong>Solar Escalator:</strong> ${inputs.solarEscalator}%</td>
            <td><strong>Solar Offset:</strong> ${inputs.solarOffset}%</td>
          </tr>
        </table>
        
        <div class="comparison">
          <div class="comparison-box utility">
            <h4>Option A: Stay with Utility (Variable)</h4>
            <div class="amount">${formatCurrency(year1?.utilityMonthly || 0)}/mo</div>
            <div style="font-size: 10px; margin-top: 4px;">${inputs.termYears}-Year Total: ${formatCurrency(yearlyData.reduce((s, y) => s + y.utilityMonthly * 12, 0))}</div>
          </div>
          <div class="comparison-box solar">
            <h4>Option B: Switch to Solar (Predictable)</h4>
            <div class="amount">${formatCurrency(year1?.solarMonthly || 0)}/mo</div>
            <div style="font-size: 10px; margin-top: 4px;">${inputs.termYears}-Year Total: ${formatCurrency(yearlyData.reduce((s, y) => s + y.solarMonthly * 12, 0))}</div>
          </div>
        </div>
        
        <div class="grid">
          <div class="card highlight">
            <h4>Monthly Advantage</h4>
            <div class="value green">+${formatCurrency(year1?.savingsMonthly || 0)}</div>
            <div class="subtext">Starting from Day 1</div>
          </div>
          <div class="card highlight">
            <h4>Avg Yearly Savings (10 yr)</h4>
            <div class="value green">${formatCurrency(avgYearlySavingsFirst10)}</div>
            <div class="subtext">Per year, first decade</div>
          </div>
          <div class="card highlight">
            <h4>${inputs.termYears}-Year Total Savings</h4>
            <div class="value green">${formatCurrency(yearFinal?.cumulativeSavings || 0)}</div>
            <div class="subtext">Lifetime benefit</div>
          </div>
        </div>
        
        <div class="table-section">
          <h3>📊 Year-by-Year Projection</h3>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Utility $/mo</th>
                <th>Solar $/mo</th>
                <th>Monthly Savings</th>
                <th>Yearly Savings</th>
                <th>% Saved</th>
                <th>Cumulative</th>
              </tr>
            </thead>
            <tbody>
              ${[0, 4, 9, 14, 19, 24].filter(i => i < yearlyData.length).map(i => {
                const y = yearlyData[i];
                return `
                  <tr>
                    <td><strong>${y.year}</strong></td>
                    <td>${formatCurrency(y.utilityMonthly)}</td>
                    <td>${formatCurrency(y.solarMonthly)}</td>
                    <td class="positive">+${formatCurrency(y.savingsMonthly)}</td>
                    <td class="positive">+${formatCurrency(y.savingsYearly)}</td>
                    <td>${formatPercent(y.percentSaved)}</td>
                    <td class="positive">${formatCurrency(y.cumulativeSavings)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="disclaimer">
          <strong>Disclaimer:</strong> This analysis is for illustrative purposes only. Actual savings may vary based on actual utility rate changes, 
          solar system performance, weather conditions, and other factors. Consult with a solar professional for a detailed assessment.
        </div>
        
        <div class="footer">
          SackFinder Solar Analysis Tool • Generated ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };
  
  return (
    <AppShell subtitle="Solar savings calculator matching ComparisonCalc model">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Calculator className="h-6 w-6" />
              Solar Savings Calculator
            </h1>
            <p className="text-muted-foreground mt-1">
              Compare utility costs vs solar over {inputs.termYears} years
            </p>
          </div>
          <Button onClick={handlePrint} className="gap-2" data-testid="button-print-pdf">
            <Download className="h-4 w-4" />
            Print Report
          </Button>
        </div>
        
        <Tabs defaultValue="inputs" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inputs" data-testid="tab-inputs">
              <FileText className="h-4 w-4 mr-2" />
              Inputs
            </TabsTrigger>
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">
              <TrendingUp className="h-4 w-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="model" data-testid="tab-model">
              <DollarSign className="h-4 w-4 mr-2" />
              {inputs.termYears}-Year Model
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="inputs" className="space-y-6 mt-4">
            {/* Customer Info & Address Search */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Home className="h-5 w-5" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Customer Name</Label>
                    <Input
                      id="customerName"
                      placeholder="Enter customer name"
                      value={inputs.customerName}
                      onChange={(e) => setInputs(prev => ({ ...prev, customerName: e.target.value }))}
                      data-testid="input-customer-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Property Address</Label>
                    <div className="flex gap-2">
                      <Input
                        id="address"
                        placeholder="Enter address (e.g., 123 Main St, Boston)"
                        value={inputs.address}
                        onChange={(e) => setInputs(prev => ({ ...prev, address: e.target.value }))}
                        data-testid="input-address"
                        className="flex-1"
                      />
                      <Button 
                        variant="secondary" 
                        onClick={() => fetchHistoricalData(inputs.address)}
                        disabled={historicalLoading || !inputs.address.trim()}
                        data-testid="button-search-address"
                      >
                        {historicalLoading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Historical Data Display */}
                  {searchedAddress && (
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        Historical Outage Data
                      </h4>
                      {historicalLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Spinner className="h-4 w-4" /> Loading...
                        </div>
                      ) : historicalData && historicalData.totalOutages > 0 ? (
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center p-2 bg-background rounded">
                            <div className="font-bold text-lg" data-testid="text-hist-outages">{historicalData.totalOutages}</div>
                            <div className="text-muted-foreground">Outages</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <div className="font-bold text-lg" data-testid="text-hist-customers">{historicalData.totalCustomersAffected.toLocaleString()}</div>
                            <div className="text-muted-foreground">Affected</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded">
                            <div className="font-bold text-lg" data-testid="text-hist-duration">{formatDuration(historicalData.avgDurationMinutes)}</div>
                            <div className="text-muted-foreground">Avg Duration</div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No historical data found for this area.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Current Bill Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Current Utility Bill
                  </CardTitle>
                  <CardDescription>Enter your most recent bill to calculate rate</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentMonthKwh">Current Month kWh</Label>
                      <Input
                        id="currentMonthKwh"
                        type="number"
                        value={currentMonthKwh}
                        onChange={(e) => setCurrentMonthKwh(parseInt(e.target.value) || 0)}
                        data-testid="input-current-kwh"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currentBill">Amount Due ($)</Label>
                      <Input
                        id="currentBill"
                        type="number"
                        step="0.01"
                        value={currentBill}
                        onChange={(e) => setCurrentBill(parseFloat(e.target.value) || 0)}
                        data-testid="input-current-bill"
                      />
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Effective $/kWh:</span>
                      <Badge variant="secondary" data-testid="badge-calculated-rate">
                        ${calculatedRateFromBill.toFixed(4)}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Yearly kWh:</span>
                      <Badge variant="outline">{yearlyKwh.toLocaleString()}</Badge>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Monthly kWh:</span>
                    <Badge variant="outline">{avgMonthlyKwh}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Rate Presets */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Utility Rate Preset</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={inputs.utilityRatePreset}
                    onValueChange={(v) => setInputs(prev => ({ ...prev, utilityRatePreset: v }))}
                  >
                    <SelectTrigger data-testid="select-utility-rate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UTILITY_RATE_PRESETS.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label} {p.value !== "customer" && `(${formatCurrencyDecimal(p.rate)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-center p-2 bg-muted rounded">
                    Effective: <strong>{formatCurrencyDecimal(effectiveUtilityRate)}/kWh</strong>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Utility Annual Increase</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={inputs.utilityIncreasePreset}
                    onValueChange={(v) => setInputs(prev => ({ ...prev, utilityIncreasePreset: v }))}
                  >
                    <SelectTrigger data-testid="select-utility-increase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UTILITY_INCREASE_PRESETS.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {inputs.utilityIncreasePreset === "customer" && (
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Custom %"
                      value={inputs.utilityIncreaseCustom}
                      onChange={(e) => setInputs(prev => ({ ...prev, utilityIncreaseCustom: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-utility-increase-custom"
                    />
                  )}
                  <div className="text-sm text-center p-2 bg-muted rounded">
                    Effective: <strong>{formatPercent(effectiveUtilityIncrease)}/yr</strong>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">CPI Inflation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={inputs.cpiPreset}
                    onValueChange={(v) => setInputs(prev => ({ ...prev, cpiPreset: v }))}
                  >
                    <SelectTrigger data-testid="select-cpi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CPI_INFLATION_PRESETS.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {inputs.cpiPreset === "custom" && (
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Custom %"
                      value={inputs.cpiCustom}
                      onChange={(e) => setInputs(prev => ({ ...prev, cpiCustom: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-cpi-custom"
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Solar Terms */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5" />
                  Solar Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="solarPayment">Monthly Payment ($)</Label>
                    <Input
                      id="solarPayment"
                      type="number"
                      value={inputs.solarMonthlyPayment}
                      onChange={(e) => setInputs(prev => ({ ...prev, solarMonthlyPayment: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-solar-payment"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="solarEscalator">Escalator (%/yr)</Label>
                    <Input
                      id="solarEscalator"
                      type="number"
                      step="0.1"
                      value={inputs.solarEscalator}
                      onChange={(e) => setInputs(prev => ({ ...prev, solarEscalator: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-solar-escalator"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="solarOffset">% Offset</Label>
                    <Input
                      id="solarOffset"
                      type="number"
                      step="1"
                      value={inputs.solarOffset}
                      onChange={(e) => setInputs(prev => ({ ...prev, solarOffset: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-solar-offset"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termYears">Term (years)</Label>
                    <Input
                      id="termYears"
                      type="number"
                      value={inputs.termYears}
                      onChange={(e) => setInputs(prev => ({ ...prev, termYears: parseInt(e.target.value) || 25 }))}
                      data-testid="input-term-years"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rebates">Rebates ($/yr)</Label>
                    <Input
                      id="rebates"
                      type="number"
                      value={inputs.rebatesYearly}
                      onChange={(e) => setInputs(prev => ({ ...prev, rebatesYearly: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-rebates"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Usage Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly Usage (kWh)
                </CardTitle>
                <CardDescription>Enter 12 months of usage for accurate yearly estimates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Month</th>
                        <th className="text-center py-2 px-2">Usage (kWh)</th>
                        <th className="text-right py-2 px-2">Est. Bill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTHS.map((month, i) => (
                        <tr key={month} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 font-medium">{month}</td>
                          <td className="py-1 px-2">
                            <Input
                              type="number"
                              className="w-24 mx-auto text-center h-8"
                              value={monthlyUsage[i]}
                              onChange={(e) => {
                                const newUsage = [...monthlyUsage];
                                newUsage[i] = parseInt(e.target.value) || 0;
                                setMonthlyUsage(newUsage);
                              }}
                              data-testid={`input-usage-${month.toLowerCase()}`}
                            />
                          </td>
                          <td className="text-right py-2 px-2 text-muted-foreground">
                            {formatCurrency(estimatedMonthlyBills[i])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50 font-medium">
                        <td className="py-2 px-2">Total / Average</td>
                        <td className="text-center py-2 px-2">{yearlyKwh.toLocaleString()} / {avgMonthlyKwh}</td>
                        <td className="text-right py-2 px-2">{formatCurrency(estimatedMonthlyBills.reduce((a, b) => a + b, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="dashboard" className="space-y-4 mt-4" ref={printRef}>
            <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
              <CardHeader>
                <CardTitle className="text-xl">Energy Savings Dashboard</CardTitle>
                <CardDescription>
                  Two options: keep riding utility rate hikes, or lock in predictability.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div className="p-6 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                    <div className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Option A: Utility (variable)</div>
                    <div className="text-3xl font-bold text-red-700 dark:text-red-500" data-testid="text-utility-cost">
                      {formatCurrency(yearlyData.reduce((s, y) => s + y.utilityMonthly * 12, 0))}
                    </div>
                    <div className="text-sm text-muted-foreground">{inputs.termYears}-year total at current trajectory</div>
                  </div>
                  
                  <div className="p-6 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Option B: Solar (predictable)</div>
                    <div className="text-3xl font-bold text-green-700 dark:text-green-500" data-testid="text-solar-cost">
                      {formatCurrency(yearlyData.reduce((s, y) => s + y.solarMonthly * 12, 0))}
                    </div>
                    <div className="text-sm text-muted-foreground">{inputs.termYears}-year total with solar</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-card rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Monthly Advantage</div>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-monthly-advantage">
                      +{formatCurrency(year1?.savingsMonthly || 0)}
                    </div>
                  </div>
                  <div className="text-center p-4 bg-card rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Total {inputs.termYears}-Year Savings</div>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-total-savings">
                      {formatCurrency(yearFinal?.cumulativeSavings || 0)}
                    </div>
                  </div>
                  <div className="text-center p-4 bg-card rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Avg Yearly (10 yr)</div>
                    <div className="text-2xl font-bold" data-testid="text-avg-yearly">
                      {formatCurrency(avgYearlySavingsFirst10)}
                    </div>
                  </div>
                  <div className="text-center p-4 bg-card rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Year 1 Savings</div>
                    <div className="text-2xl font-bold" data-testid="text-year1-savings">
                      {formatPercent(year1?.percentSaved || 0)}
                    </div>
                  </div>
                </div>
                
                <Separator className="my-6" />
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Quick Compare</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current Utility Rate</span>
                        <span className="font-medium">{formatCurrencyDecimal(effectiveUtilityRate)} per kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Solar Monthly Payment</span>
                        <span className="font-medium">{formatCurrency(inputs.solarMonthlyPayment)}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Annual Rebates</span>
                        <span className="font-medium text-green-600">+{formatCurrency(inputs.rebatesYearly)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                    <h4 className="font-medium mb-2 text-amber-800 dark:text-amber-400">Simple Rule</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-500">
                      If Monthly Advantage is positive, you are already ahead. Savings can only compound 
                      unless utilities stop raising rates.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="model" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{inputs.termYears}-Year Pricing Model</CardTitle>
                <CardDescription>Year-by-year comparison of utility vs solar costs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-yearly-model">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Year</th>
                        <th className="text-right py-2 px-2">Utility $/mo</th>
                        <th className="text-right py-2 px-2">Solar $/mo</th>
                        <th className="text-right py-2 px-2">Savings $/mo</th>
                        <th className="text-right py-2 px-2">Savings $/Year</th>
                        <th className="text-right py-2 px-2">% Saved</th>
                        <th className="text-right py-2 px-2">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyData.map((row) => (
                        <tr key={row.year} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 font-medium">{row.year}</td>
                          <td className="text-right py-2 px-2">{formatCurrency(row.utilityMonthly)}</td>
                          <td className="text-right py-2 px-2">{formatCurrency(row.solarMonthly)}</td>
                          <td className="text-right py-2 px-2 text-green-600">+{formatCurrency(row.savingsMonthly)}</td>
                          <td className="text-right py-2 px-2 text-green-600">+{formatCurrency(row.savingsYearly)}</td>
                          <td className="text-right py-2 px-2">{formatPercent(row.percentSaved)}</td>
                          <td className="text-right py-2 px-2 font-medium text-green-600">{formatCurrency(row.cumulativeSavings)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
