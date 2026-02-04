import { db } from "../storage";
import { outages, reliabilityMetrics, socialSignals, solarData } from "@shared/schema";
import { importHistoricalData } from "./historical-import";
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

  console.log("[auto-populate] Checking if database needs initial population...");

  try {
    const [outagesEmpty, reliabilityEmpty, socialEmpty, solarEmpty] = await Promise.all([
      isTableEmpty(outages),
      isTableEmpty(reliabilityMetrics),
      isTableEmpty(socialSignals),
      isTableEmpty(solarData),
    ]);

    console.log(`[auto-populate] Table status - outages: ${outagesEmpty ? 'empty' : 'has data'}, reliability: ${reliabilityEmpty ? 'empty' : 'has data'}, social: ${socialEmpty ? 'empty' : 'has data'}, solar: ${solarEmpty ? 'empty' : 'has data'}`);

    const needsPopulation = outagesEmpty || reliabilityEmpty || socialEmpty;

    if (!needsPopulation) {
      console.log("[auto-populate] Database already has data, skipping auto-population");
      return;
    }

    console.log("[auto-populate] Starting initial data population...");

    if (reliabilityEmpty) {
      console.log("[auto-populate] Importing historical reliability data (2014-2023 MA DPU filings)...");
      const result = await importHistoricalData();
      console.log(`[auto-populate] Historical import complete: ${result.success} imported, ${result.skipped} skipped, ${result.failed} failed`);
    }

    if (outagesEmpty) {
      console.log("[auto-populate] Triggering provider scrapers (National Grid, MEMA)...");
      await providerManager.scrapeAll();
      console.log("[auto-populate] Provider scraping complete");
    }

    if (socialEmpty) {
      console.log("[auto-populate] Triggering social scraper...");
      const socialResult = await socialScraper.scrapeAndStore();
      console.log(`[auto-populate] Social scraping complete: ${socialResult.stored} signals stored from ${socialResult.source}`);
    }

    console.log("[auto-populate] Initial data population complete!");

  } catch (error) {
    console.error("[auto-populate] Error during auto-population:", error);
  }
}
