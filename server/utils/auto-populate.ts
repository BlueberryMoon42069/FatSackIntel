import { db } from "../storage";
import { outages, socialSignals, solarData, historicalOutages } from "@shared/schema";
import { providerManager } from "../scrapers/index";
import { socialScraper } from "../scrapers/social";
import { sql } from "drizzle-orm";

let hasRunAutoPopulate = false;

async function isTableEmpty(table: any): Promise<boolean> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(table);
  return result[0].count === 0;
}

export async function autoPopulateOnStartup(): Promise<void> {
  if (hasRunAutoPopulate) {
    console.log("[auto-populate] Already ran, skipping");
    return;
  }

  hasRunAutoPopulate = true;

  console.log("[auto-populate] Checking database status...");

  try {
    const [outagesEmpty, socialEmpty, solarEmpty, historicalEmpty] = await Promise.all([
      isTableEmpty(outages),
      isTableEmpty(socialSignals),
      isTableEmpty(solarData),
      isTableEmpty(historicalOutages),
    ]);

    console.log(`[auto-populate] Table status - live_outages: ${outagesEmpty ? 'empty' : 'has data'}, historical: ${historicalEmpty ? 'empty' : 'has data'}, social: ${socialEmpty ? 'empty' : 'has data'}, solar: ${solarEmpty ? 'empty' : 'has data'}`);

    // No auto-population with fake data - all data must come from real sources:
    // - Historical outages: Upload DPU Excel files via /admin
    // - Live outages: Real-time scrapers (National Grid, Eversource)
    // - Social signals: Real Twitter API (requires TWITTER_BEARER_TOKEN)
    
    if (historicalEmpty) {
      console.log("[auto-populate] No historical data - upload DPU Outage_Accident_Report Excel files via /admin");
    }

    if (outagesEmpty) {
      console.log("[auto-populate] Triggering live outage scrapers...");
      await providerManager.scrapeAll();
      console.log("[auto-populate] Provider scraping complete");
    }

    if (socialEmpty) {
      console.log("[auto-populate] Triggering social scraper (requires TWITTER_BEARER_TOKEN for real data)...");
      const socialResult = await socialScraper.scrapeAndStore();
      console.log(`[auto-populate] Social scraping: ${socialResult.stored} signals stored from ${socialResult.source}`);
    }

    console.log("[auto-populate] Startup check complete");

  } catch (error) {
    console.error("[auto-populate] Error during startup:", error);
  }
}
