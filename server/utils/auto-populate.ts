import { db, storage } from "../storage";
import { outages, socialSignals, solarData, historicalOutages, locationScores, reliabilityMetrics } from "@shared/schema";
import { providerManager } from "../scrapers/index";
import { socialScraper } from "../scrapers/social";
import { seedReliabilityMetrics } from "./seed-reliability";
import { getAllTownNames, getTownCoords } from "./towns";
import { sql } from "drizzle-orm";

let hasRunAutoPopulate = false;

async function isTableEmpty(table: any): Promise<boolean> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(table);
  return Number(result[0].count) === 0;
}

async function autoCalculateLocationScores(): Promise<void> {
  const [locationsEmpty, historicalEmpty] = await Promise.all([
    isTableEmpty(locationScores),
    isTableEmpty(historicalOutages),
  ]);

  if (!locationsEmpty) {
    console.log("[auto-populate] locationScores already populated, skipping auto-calc");
    return;
  }

  if (historicalEmpty) {
    console.log("[auto-populate] No historical data available to calculate location scores");
    return;
  }

  console.log("[auto-populate] Auto-calculating location scores from historical outage data...");

  // Load all historical records and aggregate per town
  const allHistorical = await storage.getHistoricalOutages({ limit: 100000 });

  const townAgg = new Map<string, { incidents: number; totalDuration: number }>();
  for (const record of allHistorical) {
    const town = record.town?.toUpperCase();
    if (!town) continue;
    if (!townAgg.has(town)) townAgg.set(town, { incidents: 0, totalDuration: 0 });
    const agg = townAgg.get(town)!;
    agg.incidents++;
    agg.totalDuration += record.durationHours || 0;
  }

  const allIncidents = Array.from(townAgg.values()).map(a => a.incidents);
  const maxIncidents = allIncidents.length > 0 ? Math.max(...allIncidents) : 1;

  let stored = 0;
  for (const [town, agg] of Array.from(townAgg)) {
    const coords = getTownCoords(town);
    if (!coords) continue; // skip towns without coordinates

    const avgDuration = agg.incidents > 0 ? agg.totalDuration / agg.incidents : 0;
    const incidentRatio = agg.incidents / maxIncidents;
    const durationFactor = Math.min(1.0, avgDuration / 10);
    const outageScore = Math.min(1.0, incidentRatio * 0.7 + durationFactor * 0.3);
    const solarScore = 0.65; // MA average
    const finalScore = outageScore * 0.5 + 0 * 0.3 + solarScore * 0.2;

    try {
      await storage.createOrUpdateLocationScore({
        h3Cell: `town-${town}`,
        lat: coords[1],
        lon: coords[0],
        outageScore,
        socialScore: 0,
        solarScore,
        finalScore,
        outageEvents24h: 0,
        socialMentions24h: 0,
      });
      stored++;
    } catch (error) {
      console.error(`[auto-populate] Error storing score for ${town}:`, error);
    }
  }

  console.log(`[auto-populate] Auto-calculated location scores for ${stored} towns`);
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

    // Seed real DPU reliability metrics (skips if already populated)
    await seedReliabilityMetrics();

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

    // Auto-calculate location scores from historical data if not yet populated
    await autoCalculateLocationScores();

    console.log("[auto-populate] Startup check complete");

  } catch (error) {
    console.error("[auto-populate] Error during startup:", error);
  }
}
