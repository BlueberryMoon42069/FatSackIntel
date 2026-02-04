// Historical reliability data import
// This module provides functionality to import data FROM DPU filings, not embedded data.
// Reliability metrics should come from uploaded DPU Excel files via the admin panel.

import { storage } from "../storage";
import type { InsertReliabilityMetric } from "@shared/schema";

/**
 * This function is DEPRECATED.
 * Historical reliability data should be imported via:
 * 1. Admin panel file upload (Excel/CSV DPU filings)
 * 2. The historical_outages table which contains street-level data
 * 
 * Do NOT use embedded data - all data must come from real DPU filings.
 */
export async function importHistoricalData(): Promise<{
  success: number;
  failed: number;
  skipped: number;
}> {
  console.log("[historical-import] DEPRECATED: Embedded data import removed.");
  console.log("[historical-import] Upload DPU Outage_Accident_Report Excel files via /admin to import real data.");
  
  return { success: 0, failed: 0, skipped: 0 };
}

/**
 * Calculate reliability summaries from actual historical_outages data
 */
export async function getHistoricalSummary() {
  const stats = await storage.getHistoricalOutageStats();
  
  return {
    message: "Use historical_outages table data from uploaded DPU filings",
    totalRecords: stats.totalRecords,
    utilities: stats.utilities,
    years: stats.years,
    topTowns: stats.topTowns.slice(0, 5),
  };
}
