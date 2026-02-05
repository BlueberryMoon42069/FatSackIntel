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
import { 
  Calculator, 
  Download, 
  Sun, 
  Zap, 
  TrendingUp, 
  DollarSign,
  Home,
  FileText
} from "lucide-react";

type YearlyData = {
  year: number;
  utilityMonthly: number;
  solarMonthly: number;
  savingsMonthly: number;
  savingsYearly: number;
  percentSaved: number;
  cumulativeSavings: number;
};

function calculateSavingsModel(inputs: {
  currentUtilityRate: number;
  monthlyUsage: number;
  utilityRateIncrease: number;
  solarRate: number;
  solarEscalator: number;
  years: number;
}): YearlyData[] {
  const data: YearlyData[] = [];
  let cumulativeSavings = 0;
  
  for (let year = 1; year <= inputs.years; year++) {
    const utilityRate = inputs.currentUtilityRate * Math.pow(1 + inputs.utilityRateIncrease, year - 1);
    const solarRate = inputs.solarRate * Math.pow(1 + inputs.solarEscalator, year - 1);
    
    const utilityMonthly = utilityRate * inputs.monthlyUsage;
    const solarMonthly = solarRate * inputs.monthlyUsage;
    const savingsMonthly = utilityMonthly - solarMonthly;
    const savingsYearly = savingsMonthly * 12;
    cumulativeSavings += savingsYearly;
    
    data.push({
      year,
      utilityMonthly,
      solarMonthly,
      savingsMonthly,
      savingsYearly,
      percentSaved: savingsMonthly / utilityMonthly,
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

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'percent', 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export default function CalculatorPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  
  const [inputs, setInputs] = useState({
    customerName: "",
    address: "",
    currentBill: 160.20,
    currentKwh: 418,
    utilityRateIncrease: 4.84,
    solarRate: 0.332,
    solarEscalator: 3.5,
  });
  
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
    }
  }, []);
  
  const calculatedUtilityRate = inputs.currentKwh > 0 ? inputs.currentBill / inputs.currentKwh : 0.35;
  const monthlyUsage = inputs.currentKwh || 374;
  
  const yearlyData = useMemo(() => calculateSavingsModel({
    currentUtilityRate: calculatedUtilityRate,
    monthlyUsage,
    utilityRateIncrease: inputs.utilityRateIncrease / 100,
    solarRate: inputs.solarRate,
    solarEscalator: inputs.solarEscalator / 100,
    years: 25,
  }), [calculatedUtilityRate, monthlyUsage, inputs.utilityRateIncrease, inputs.solarRate, inputs.solarEscalator]);
  
  const year1 = yearlyData[0];
  const year10 = yearlyData[9];
  const year25 = yearlyData[24];
  
  const first10YearsSavings = yearlyData.slice(0, 10).reduce((sum, y) => sum + y.savingsYearly, 0);
  const avgYearlySavingsFirst10 = first10YearsSavings / 10;
  
  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
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
          .card.warning { background: #fff3e0; border-color: #ff9800; }
          .card h4 { font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
          .card .value { font-size: 20px; font-weight: bold; color: #1a1a1a; }
          .card .value.green { color: #2e7d32; }
          .card .value.orange { color: #e65100; }
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
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>☀️ Solar Savings Analysis</h1>
            <div class="subtitle">25-Year Cost Comparison Report</div>
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
        
        <div class="comparison">
          <div class="comparison-box utility">
            <h4>Option A: Stay with Utility (Variable)</h4>
            <div class="amount">${formatCurrency(year1.utilityMonthly)}/mo</div>
            <div style="font-size: 10px; margin-top: 4px;">25-Year Total: ${formatCurrency(yearlyData.reduce((s, y) => s + y.utilityMonthly * 12, 0))}</div>
          </div>
          <div class="comparison-box solar">
            <h4>Option B: Switch to Solar (Predictable)</h4>
            <div class="amount">${formatCurrency(year1.solarMonthly)}/mo</div>
            <div style="font-size: 10px; margin-top: 4px;">25-Year Total: ${formatCurrency(yearlyData.reduce((s, y) => s + y.solarMonthly * 12, 0))}</div>
          </div>
        </div>
        
        <div class="grid">
          <div class="card highlight">
            <h4>Monthly Advantage</h4>
            <div class="value green">+${formatCurrency(year1.savingsMonthly)}</div>
            <div class="subtext">Starting from Day 1</div>
          </div>
          <div class="card highlight">
            <h4>Avg Yearly Savings (10 yr)</h4>
            <div class="value green">${formatCurrency(avgYearlySavingsFirst10)}</div>
            <div class="subtext">Per year, first decade</div>
          </div>
          <div class="card highlight">
            <h4>25-Year Total Savings</h4>
            <div class="value green">${formatCurrency(year25.cumulativeSavings)}</div>
            <div class="subtext">Lifetime benefit</div>
          </div>
        </div>
        
        <div class="grid">
          <div class="card">
            <h4>Current Utility Rate</h4>
            <div class="value">$${calculatedUtilityRate.toFixed(3)}/kWh</div>
            <div class="subtext">+${inputs.utilityRateIncrease}% annual increase</div>
          </div>
          <div class="card">
            <h4>Solar Rate</h4>
            <div class="value">$${inputs.solarRate.toFixed(3)}/kWh</div>
            <div class="subtext">+${inputs.solarEscalator}% annual escalator</div>
          </div>
          <div class="card">
            <h4>Monthly Usage</h4>
            <div class="value">${monthlyUsage} kWh</div>
            <div class="subtext">Based on current bill</div>
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
              ${[0, 4, 9, 14, 19, 24].map(i => {
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
          solar system performance, weather conditions, and other factors. Past utility rate increases do not guarantee future increases. 
          Consult with a solar professional for a detailed assessment.
        </div>
        
        <div class="footer">
          SackFinder Solar Analysis Tool • Generated ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };
  
  return (
    <AppShell subtitle="Solar savings calculator and comparison tool">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Calculator className="h-6 w-6" />
              Solar Savings Calculator
            </h1>
            <p className="text-muted-foreground mt-1">
              Compare utility costs vs solar and generate customer reports
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
              25-Year Model
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="inputs" className="space-y-4 mt-4">
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
                    <Input
                      id="address"
                      placeholder="Enter address"
                      value={inputs.address}
                      onChange={(e) => setInputs(prev => ({ ...prev, address: e.target.value }))}
                      data-testid="input-address"
                    />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Current Utility Bill
                  </CardTitle>
                  <CardDescription>Enter the customer's most recent bill</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentBill">Amount Due ($)</Label>
                    <Input
                      id="currentBill"
                      type="number"
                      step="0.01"
                      value={inputs.currentBill}
                      onChange={(e) => setInputs(prev => ({ ...prev, currentBill: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-current-bill"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentKwh">kWh Used</Label>
                    <Input
                      id="currentKwh"
                      type="number"
                      value={inputs.currentKwh}
                      onChange={(e) => setInputs(prev => ({ ...prev, currentKwh: parseInt(e.target.value) || 0 }))}
                      data-testid="input-current-kwh"
                    />
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Calculated Rate:</span>
                    <Badge variant="secondary" className="text-base" data-testid="badge-calculated-rate">
                      ${calculatedUtilityRate.toFixed(3)}/kWh
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Rate Assumptions
                  </CardTitle>
                  <CardDescription>Customize projection parameters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="utilityIncrease">Utility Annual Increase (%)</Label>
                    <Input
                      id="utilityIncrease"
                      type="number"
                      step="0.1"
                      value={inputs.utilityRateIncrease}
                      onChange={(e) => setInputs(prev => ({ ...prev, utilityRateIncrease: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-utility-increase"
                    />
                    <p className="text-xs text-muted-foreground">National 5-year average: 4.84%</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sun className="h-5 w-5" />
                    Solar Terms
                  </CardTitle>
                  <CardDescription>Solar rate and escalator</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="solarRate">Solar Rate ($/kWh)</Label>
                    <Input
                      id="solarRate"
                      type="number"
                      step="0.001"
                      value={inputs.solarRate}
                      onChange={(e) => setInputs(prev => ({ ...prev, solarRate: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-solar-rate"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="solarEscalator">Annual Escalator (%)</Label>
                    <Input
                      id="solarEscalator"
                      type="number"
                      step="0.1"
                      value={inputs.solarEscalator}
                      onChange={(e) => setInputs(prev => ({ ...prev, solarEscalator: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-solar-escalator"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
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
                    <div className="text-sm text-muted-foreground">25-year total at current trajectory</div>
                  </div>
                  
                  <div className="p-6 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Option B: Solar (predictable)</div>
                    <div className="text-3xl font-bold text-green-700 dark:text-green-500" data-testid="text-solar-cost">
                      {formatCurrency(yearlyData.reduce((s, y) => s + y.solarMonthly * 12, 0))}
                    </div>
                    <div className="text-sm text-muted-foreground">25-year total with solar</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-card rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Monthly Advantage</div>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-monthly-advantage">
                      +{formatCurrency(year1.savingsMonthly)}
                    </div>
                  </div>
                  <div className="text-center p-4 bg-card rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Total 25-Year Savings</div>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-total-savings">
                      {formatCurrency(year25.cumulativeSavings)}
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
                      {formatPercent(year1.percentSaved)}
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
                        <span className="font-medium">${calculatedUtilityRate.toFixed(3)} per kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Effective Solar Rate</span>
                        <span className="font-medium">${inputs.solarRate.toFixed(3)} per kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate Difference</span>
                        <span className="font-medium text-green-600">
                          -{formatPercent((calculatedUtilityRate - inputs.solarRate) / calculatedUtilityRate)}
                        </span>
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
                <CardTitle>25-Year Pricing Model</CardTitle>
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
