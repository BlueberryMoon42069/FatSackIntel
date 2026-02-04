import { useState, useEffect, useRef, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { apiFetch } from "@/lib/api";
import { Activity, Database, TrendingUp, MessageSquare, Sun, BarChart, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, History } from "lucide-react";

type AdminStatus = {
  counts: {
    activeOutages: number;
    reliabilityRecords: number;
    recentSocialSignals: number;
    solarDataPoints: number;
    scoredLocations: number;
    historicalOutages?: number;
  };
  historical?: {
    utilities: string[];
    years: number[];
    topTowns: { town: string; count: number }[];
  };
  lastUpdated: string;
};

type UploadResult = {
  success: boolean;
  message: string;
  stats?: { totalRows: number; validRows: number; skippedRows: number };
  warnings?: string[];
  errors?: string[];
};

export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminStatus>("/api/admin/status");
      setStatus(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const triggerAction = async (endpoint: string, name: string) => {
    setActionLoading(name);
    try {
      await apiFetch(endpoint, { method: "POST", timeoutMs: 60000 });
      await loadStatus();
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${name}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFileSelect = useCallback((file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(ext)) {
      setUploadResult({
        success: false,
        message: 'Invalid file type. Please upload .xlsx, .xls, or .csv files.',
      });
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percent);
        }
      });

      const result = await new Promise<UploadResult>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error('Failed to parse response'));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', '/api/admin/upload/historical');
        xhr.send(formData);
      });

      setUploadResult(result);
      if (result.success) {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadStatus();
      }
    } catch (e: any) {
      setUploadResult({
        success: false,
        message: e?.message ?? 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  const statusCards = [
    {
      title: "Active Outages",
      value: status?.counts.activeOutages ?? 0,
      icon: Activity,
      description: "Live outage events",
      color: "text-red-600",
    },
    {
      title: "Historical Outages",
      value: status?.counts.historicalOutages ?? 0,
      icon: History,
      description: "Imported records",
      color: "text-orange-600",
    },
    {
      title: "Reliability Data",
      value: status?.counts.reliabilityRecords ?? 0,
      icon: Database,
      description: "Historical metrics",
      color: "text-blue-600",
    },
    {
      title: "Social Signals",
      value: status?.counts.recentSocialSignals ?? 0,
      icon: MessageSquare,
      description: "Last 24h",
      color: "text-purple-600",
    },
    {
      title: "Solar Data Points",
      value: status?.counts.solarDataPoints ?? 0,
      icon: Sun,
      description: "Analyzed locations",
      color: "text-yellow-600",
    },
    {
      title: "Scored Locations",
      value: status?.counts.scoredLocations ?? 0,
      icon: BarChart,
      description: "Composite rankings",
      color: "text-green-600",
    },
  ];

  return (
    <AppShell subtitle="Test and manage data sources for OutageIntel MA">
      <div className="grid gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Data Pipeline Control</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import, scrape, and test all data sources before publishing
            </p>
          </div>
          <Button onClick={loadStatus} disabled={loading} data-testid="button-refresh-status">
            {loading ? "Loading..." : "Refresh Status"}
          </Button>
        </div>

        {/* Status Overview */}
        {error && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
            <CardContent className="pt-6">
              <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-admin-error">
                Unable to load data. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {loading && !status ? (
          <EmptyState 
            title="Loading system status..." 
            description="Fetching current data pipeline status." 
            testId="state-loading" 
          />
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {statusCards.map((card) => (
                <Card key={card.title}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-stat-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          {card.title}
                        </p>
                        <p className={`text-2xl font-bold mt-1 ${card.color}`} data-testid={`text-value-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          {card.value.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                      </div>
                      <card.icon className={`h-8 w-8 ${card.color} opacity-50`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Data Import Actions */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base" data-testid="text-import-title">Data Import</CardTitle>
                  <CardDescription>Import historical and baseline data</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button
                    variant="outline"
                    onClick={() => triggerAction("/api/admin/import/historical", "Import Historical")}
                    disabled={actionLoading === "Import Historical"}
                    data-testid="button-import-historical"
                    className="justify-start"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {actionLoading === "Import Historical" ? "Importing..." : "Import Historical Reliability Data"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Loads 10 years (2014-2023) of SAIDI/SAIFI/CAIDI metrics from MA DPU filings for National Grid, Eversource, and Unitil
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base" data-testid="text-scrape-title">Live Scrapers</CardTitle>
                  <CardDescription>Trigger data collection from external sources</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button
                    variant="outline"
                    onClick={() => triggerAction("/api/admin/scrape/providers", "Scrape Providers")}
                    disabled={actionLoading === "Scrape Providers"}
                    data-testid="button-scrape-providers"
                    className="justify-start"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    {actionLoading === "Scrape Providers" ? "Scraping..." : "Scrape Outage Providers"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Fetches live outage data from MEMA and National Grid using QuadKey tiling
                  </p>

                  <Button
                    variant="outline"
                    onClick={() => triggerAction("/api/admin/scrape/social", "Scrape Social")}
                    disabled={actionLoading === "Scrape Social"}
                    data-testid="button-scrape-social"
                    className="justify-start"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {actionLoading === "Scrape Social" ? "Scraping..." : "Scrape Social Signals"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Monitors public Facebook groups for outage mentions, billing complaints, and solar interest in Worcester County
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Upload Historical Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" data-testid="text-upload-title">
                  <FileSpreadsheet className="h-5 w-5" />
                  Upload Historical Data
                </CardTitle>
                <CardDescription>
                  Upload DPU Outage_Accident_Report Excel files (format: DPU YY-ERP-XX)
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-upload"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileInputChange}
                    className="hidden"
                    data-testid="input-file-upload"
                  />
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">
                    {selectedFile ? selectedFile.name : 'Drag and drop or click to select'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Accepts .xlsx, .xls, .csv files (max 50MB)
                  </p>
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground mt-2">
                      File size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </div>

                {selectedFile && (
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    data-testid="button-upload-file"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </Button>
                )}

                {uploading && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" data-testid="progress-upload" />
                    <p className="text-xs text-muted-foreground text-center">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}

                {uploadResult && (
                  <Alert variant={uploadResult.success ? 'default' : 'destructive'} data-testid="alert-upload-result">
                    {uploadResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{uploadResult.success ? 'Success' : 'Error'}</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{uploadResult.message}</p>
                      {uploadResult.stats && (
                        <div className="flex gap-4 text-xs mt-2">
                          <span data-testid="text-stat-total">Total rows: <strong>{uploadResult.stats.totalRows}</strong></span>
                          <span data-testid="text-stat-valid">Valid: <strong>{uploadResult.stats.validRows}</strong></span>
                          <span data-testid="text-stat-skipped">Skipped: <strong>{uploadResult.stats.skippedRows}</strong></span>
                        </div>
                      )}
                      {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Warnings ({uploadResult.warnings.length})
                          </p>
                          <ul className="text-xs list-disc list-inside max-h-32 overflow-y-auto" data-testid="list-warnings">
                            {uploadResult.warnings.slice(0, 10).map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                            {uploadResult.warnings.length > 10 && (
                              <li>...and {uploadResult.warnings.length - 10} more warnings</li>
                            )}
                          </ul>
                        </div>
                      )}
                      {uploadResult.errors && uploadResult.errors.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium">Errors:</p>
                          <ul className="text-xs list-disc list-inside" data-testid="list-errors">
                            {uploadResult.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="text-xs text-muted-foreground border-t pt-3 mt-2">
                  <p className="font-medium mb-1">Expected file format:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>DPU Outage_Accident_Report Excel files</li>
                    <li>Columns: Town, Street, Customers Out, Duration, Cause, etc.</li>
                    <li>Multiple years and utilities can be imported</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Historical Data Status */}
            {status?.historical && (status.counts.historicalOutages ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2" data-testid="text-historical-status-title">
                    <History className="h-5 w-5" />
                    Historical Data Status
                  </CardTitle>
                  <CardDescription>
                    Overview of imported historical outage data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm font-medium mb-2">Utilities</p>
                      <div className="flex flex-wrap gap-1" data-testid="list-utilities">
                        {status.historical.utilities.length > 0 ? (
                          status.historical.utilities.map((utility) => (
                            <Badge key={utility} variant="secondary">{utility}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No data</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Years</p>
                      <div className="flex flex-wrap gap-1" data-testid="list-years">
                        {status.historical.years.length > 0 ? (
                          status.historical.years.slice(0, 10).map((year) => (
                            <Badge key={year} variant="outline">{year}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No data</span>
                        )}
                        {status.historical.years.length > 10 && (
                          <Badge variant="outline">+{status.historical.years.length - 10} more</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Top Towns by Outage Count</p>
                      <div className="space-y-1" data-testid="list-top-towns">
                        {status.historical.topTowns.length > 0 ? (
                          status.historical.topTowns.slice(0, 5).map((item) => (
                            <div key={item.town} className="flex justify-between text-xs">
                              <span>{item.town}</span>
                              <span className="font-medium">{item.count.toLocaleString()}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No data</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* API Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base" data-testid="text-api-title">API Endpoints</CardTitle>
                <CardDescription>Test backend REST endpoints</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="font-mono text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/outages/active</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Active outages</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/reliability?provider=National+Grid</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Historical metrics</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/social/sentiment</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Town sentiment</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">GET</Badge>
                      <span className="text-muted-foreground">/api/scores/top?limit=100</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Top locations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-12">POST</Badge>
                      <span className="text-muted-foreground">/api/solar/analyze</span>
                      <span className="text-xs text-muted-foreground ml-auto">→ Calculate solar potential</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-medium" data-testid="text-last-updated">
                      {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : "—"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Database</span>
                    <Badge variant="secondary" data-testid="badge-db-status">PostgreSQL + PostGIS</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Scoring Engine</span>
                    <Badge variant="secondary" data-testid="badge-scoring-status">Ready</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">NREL PVWatts</span>
                    <Badge variant="secondary" data-testid="badge-solar-status">Integrated</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
