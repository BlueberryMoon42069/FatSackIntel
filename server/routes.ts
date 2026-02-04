import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { providerManager } from "./scrapers/index";
import { socialScraper } from "./scrapers/social";
import { solarCalculator } from "./utils/solar";
import { scoringEngine } from "./utils/scoring";
import { importHistoricalData, getHistoricalSummary } from "./utils/historical-import";

import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // ===== OUTAGES API =====
  
  // Main outages endpoint for live map - returns GeoJSON FeatureCollection
  app.get("/api/outages", async (req, res) => {
    try {
      const outages = await storage.getActiveOutages();
      
      // Convert database outages to GeoJSON FeatureCollection
      const features = outages.map(outage => ({
        type: "Feature" as const,
        properties: {
          id: outage.id,
          provider: outage.provider,
          customers: outage.customersAffected,
          status: outage.status,
          confidence: outage.confidence,
          reportedAt: outage.reportedAt,
        },
        geometry: outage.geometry,
      }));

      res.json({
        updatedAt: new Date().toISOString(),
        providers: Array.from(new Set(outages.map(o => o.provider))),
        features: {
          type: "FeatureCollection",
          features,
        },
      });
    } catch (error) {
      console.error("Error fetching outages:", error);
      res.status(500).json({ error: "Failed to fetch outages" });
    }
  });

  app.get("/api/outages/active", async (req, res) => {
    try {
      const outages = await storage.getActiveOutages();
      res.json(outages);
    } catch (error) {
      console.error("Error fetching active outages:", error);
      res.status(500).json({ error: "Failed to fetch outages" });
    }
  });

  app.get("/api/outages/provider/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const outages = await storage.getOutagesByProvider(provider);
      res.json(outages);
    } catch (error) {
      console.error("Error fetching provider outages:", error);
      res.status(500).json({ error: "Failed to fetch outages" });
    }
  });

  // ===== RELIABILITY METRICS API =====

  app.get("/api/reliability", async (req, res) => {
    try {
      const { provider, year } = req.query;
      const metrics = await storage.getReliabilityMetrics(
        provider as string | undefined,
        year ? parseInt(year as string) : undefined
      );
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching reliability metrics:", error);
      res.status(500).json({ error: "Failed to fetch reliability metrics" });
    }
  });

  app.get("/api/reliability/summary", async (req, res) => {
    try {
      const summary = getHistoricalSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching reliability summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // ===== SOCIAL SIGNALS API =====

  app.get("/api/social/town/:town", async (req, res) => {
    try {
      const { town } = req.params;
      const { hours = "24" } = req.query;
      const signals = await storage.getSocialSignalsByTown(town, parseInt(hours as string));
      res.json(signals);
    } catch (error) {
      console.error("Error fetching social signals:", error);
      res.status(500).json({ error: "Failed to fetch social signals" });
    }
  });

  app.get("/api/social/recent", async (req, res) => {
    try {
      const { hours = "24" } = req.query;
      const signals = await storage.getRecentSocialSignals(parseInt(hours as string));
      res.json(signals);
    } catch (error) {
      console.error("Error fetching recent social signals:", error);
      res.status(500).json({ error: "Failed to fetch social signals" });
    }
  });

  app.get("/api/social/sentiment", async (req, res) => {
    try {
      const { hours = "24" } = req.query;
      const sentiment = await socialScraper.getTownSentiment(parseInt(hours as string));
      res.json(sentiment);
    } catch (error) {
      console.error("Error fetching sentiment:", error);
      res.status(500).json({ error: "Failed to fetch sentiment" });
    }
  });

  // ===== SOLAR DATA API =====

  app.get("/api/solar/location", async (req, res) => {
    try {
      const { lat, lon, radius = "0.01" } = req.query;
      if (!lat || !lon) {
        return res.status(400).json({ error: "lat and lon required" });
      }
      
      const data = await storage.getSolarData(
        parseFloat(lat as string),
        parseFloat(lon as string),
        parseFloat(radius as string)
      );
      res.json(data);
    } catch (error) {
      console.error("Error fetching solar data:", error);
      res.status(500).json({ error: "Failed to fetch solar data" });
    }
  });

  app.get("/api/solar/h3/:h3Cell", async (req, res) => {
    try {
      const { h3Cell } = req.params;
      const data = await storage.getSolarDataByH3(h3Cell);
      if (!data) {
        return res.status(404).json({ error: "Solar data not found" });
      }
      res.json(data);
    } catch (error) {
      console.error("Error fetching solar data:", error);
      res.status(500).json({ error: "Failed to fetch solar data" });
    }
  });

  app.post("/api/solar/analyze", async (req, res) => {
    try {
      const { lat, lon, ...options } = req.body;
      if (!lat || !lon) {
        return res.status(400).json({ error: "lat and lon required" });
      }
      
      await solarCalculator.analyzeAndStore(lat, lon, options);
      res.json({ success: true });
    } catch (error) {
      console.error("Error analyzing solar data:", error);
      res.status(500).json({ error: "Failed to analyze solar data" });
    }
  });

  // ===== LOCATION SCORES API =====

  app.get("/api/scores/top", async (req, res) => {
    try {
      const { limit = "100" } = req.query;
      const scores = await storage.getTopLocations(parseInt(limit as string));
      res.json(scores);
    } catch (error) {
      console.error("Error fetching top locations:", error);
      res.status(500).json({ error: "Failed to fetch top locations" });
    }
  });

  app.get("/api/scores/h3/:h3Cell", async (req, res) => {
    try {
      const { h3Cell } = req.params;
      const score = await storage.getLocationScore(h3Cell);
      if (!score) {
        return res.status(404).json({ error: "Location score not found" });
      }
      res.json(score);
    } catch (error) {
      console.error("Error fetching location score:", error);
      res.status(500).json({ error: "Failed to fetch location score" });
    }
  });

  // ===== UNIFIED RANKINGS API =====
  
  // Returns all data aggregated into a unified ranking system
  app.get("/api/rankings", async (req, res) => {
    try {
      const { town, minScore, sortBy = "finalScore", limit = "100" } = req.query;
      
      // Get all data sources
      const [reliability, socialSignals, locations] = await Promise.all([
        storage.getReliabilityMetrics(),
        storage.getRecentSocialSignals(24),
        storage.getTopLocations(parseInt(limit as string)),
      ]);

      // Build town-level aggregates from reliability data
      const territoryScores = new Map<string, any>();
      for (const metric of reliability) {
        const key = metric.territory || metric.provider;
        if (!territoryScores.has(key)) {
          territoryScores.set(key, {
            territory: key,
            provider: metric.provider,
            avgSAIDI: 0,
            avgSAIFI: 0,
            avgCAIDI: 0,
            count: 0,
            years: [],
          });
        }
        const agg = territoryScores.get(key);
        agg.avgSAIDI += metric.saidi || 0;
        agg.avgSAIFI += metric.saifi || 0;
        agg.avgCAIDI += metric.caidi || 0;
        agg.count++;
        agg.years.push(metric.year);
      }

      // Calculate averages
      for (const [, agg] of Array.from(territoryScores)) {
        if (agg.count > 0) {
          agg.avgSAIDI /= agg.count;
          agg.avgSAIFI /= agg.count;
          agg.avgCAIDI /= agg.count;
        }
      }

      // Build social signal aggregates by town
      const townSocial = new Map<string, any>();
      for (const signal of socialSignals) {
        if (!townSocial.has(signal.town)) {
          townSocial.set(signal.town, {
            town: signal.town,
            outageCount: 0,
            billingCount: 0,
            intentCount: 0,
            avgUrgency: 0,
            signals: [],
          });
        }
        const agg = townSocial.get(signal.town);
        if (signal.category === "outage") agg.outageCount++;
        if (signal.category === "billing") agg.billingCount++;
        if (signal.category === "intent") agg.intentCount++;
        agg.signals.push(signal);
      }

      // Calculate urgency averages
      for (const [, agg] of Array.from(townSocial)) {
        if (agg.signals.length > 0) {
          agg.avgUrgency = agg.signals.reduce((sum: number, s: any) => sum + s.urgency, 0) / agg.signals.length;
        }
      }

      // Build unified rankings
      const rankings = [];

      // Add scored locations
      for (const loc of locations) {
        rankings.push({
          id: loc.id,
          type: "h3_cell",
          name: loc.h3Cell,
          lat: loc.lat,
          lon: loc.lon,
          knockScore: loc.finalScore,
          outageScore: loc.outageScore,
          socialScore: loc.socialScore,
          solarScore: loc.solarScore,
          outageEvents24h: loc.outageEvents24h,
          socialMentions24h: loc.socialMentions24h,
          updatedAt: loc.updatedAt,
        });
      }

      // Add towns with social signals not already in locations
      for (const [townName, social] of Array.from(townSocial)) {
        const existing = rankings.find(r => r.name === townName);
        if (!existing) {
          // Calculate knock score from social signals
          const socialScore = Math.min(1.0, (
            social.outageCount * 0.1 +
            social.intentCount * 0.05 +
            social.billingCount * 0.02 +
            social.avgUrgency * 0.3
          ));
          
          rankings.push({
            id: `town-${townName}`,
            type: "town",
            name: townName,
            lat: null,
            lon: null,
            knockScore: socialScore,
            outageScore: social.outageCount > 0 ? 0.7 : 0.3,
            socialScore,
            solarScore: 0.6, // Default for towns
            outageEvents24h: social.outageCount,
            socialMentions24h: social.signals.length,
            socialData: {
              outageCount: social.outageCount,
              billingCount: social.billingCount,
              intentCount: social.intentCount,
              avgUrgency: social.avgUrgency,
            },
          });
        }
      }

      // Add territories from reliability data
      for (const [territory, data] of Array.from(territoryScores)) {
        const existing = rankings.find(r => r.name === territory);
        if (!existing) {
          // Higher SAIDI = higher outage risk score
          const outageScore = Math.min(1.0, data.avgSAIDI / 250);
          
          rankings.push({
            id: `territory-${territory}`,
            type: "territory",
            name: territory,
            provider: data.provider,
            lat: null,
            lon: null,
            knockScore: outageScore,
            outageScore,
            socialScore: 0,
            solarScore: 0.6,
            reliabilityData: {
              avgSAIDI: data.avgSAIDI,
              avgSAIFI: data.avgSAIFI,
              avgCAIDI: data.avgCAIDI,
              yearsAnalyzed: data.count,
            },
          });
        }
      }

      // Apply filters
      let filtered = rankings;
      
      if (town) {
        filtered = filtered.filter(r => 
          r.name?.toLowerCase().includes((town as string).toLowerCase())
        );
      }
      
      if (minScore) {
        const min = parseFloat(minScore as string);
        filtered = filtered.filter(r => r.knockScore >= min);
      }

      // Sort
      const sortKey = sortBy as string;
      filtered.sort((a, b) => {
        const aVal = (a as any)[sortKey] ?? 0;
        const bVal = (b as any)[sortKey] ?? 0;
        return bVal - aVal;
      });

      res.json({
        updatedAt: new Date().toISOString(),
        total: filtered.length,
        rankings: filtered.slice(0, parseInt(limit as string)),
      });
    } catch (error) {
      console.error("Error fetching rankings:", error);
      res.status(500).json({ error: "Failed to fetch rankings" });
    }
  });

  // ===== ADMIN / SCRAPER CONTROL API =====

  app.post("/api/admin/scrape/providers", async (req, res) => {
    try {
      await providerManager.scrapeAll();
      res.json({ success: true, message: "Provider scraping triggered" });
    } catch (error) {
      console.error("Error triggering provider scrape:", error);
      res.status(500).json({ error: "Failed to trigger scrape" });
    }
  });

  app.post("/api/admin/scrape/social", async (req, res) => {
    try {
      const result = await socialScraper.scrapeAndStore();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error triggering social scrape:", error);
      res.status(500).json({ error: "Failed to trigger social scrape" });
    }
  });

  app.post("/api/admin/import/historical", async (req, res) => {
    try {
      const result = await importHistoricalData();
      res.json(result);
    } catch (error) {
      console.error("Error importing historical data:", error);
      res.status(500).json({ error: "Failed to import historical data" });
    }
  });

  app.post("/api/admin/score/batch", async (req, res) => {
    try {
      const { locations } = req.body;
      if (!Array.isArray(locations)) {
        return res.status(400).json({ error: "locations array required" });
      }
      
      await scoringEngine.batchScoreLocations(locations);
      res.json({ success: true, processed: locations.length });
    } catch (error) {
      console.error("Error batch scoring:", error);
      res.status(500).json({ error: "Failed to batch score" });
    }
  });

  app.get("/api/admin/status", async (req, res) => {
    try {
      const [outages, reliability, social, solar, scores] = await Promise.all([
        storage.getActiveOutages(),
        storage.getReliabilityMetrics(),
        storage.getRecentSocialSignals(24),
        storage.getSolarData(42.3, -71.8, 1.0),
        storage.getTopLocations(10),
      ]);

      res.json({
        counts: {
          activeOutages: outages.length,
          reliabilityRecords: reliability.length,
          recentSocialSignals: social.length,
          solarDataPoints: solar.length,
          scoredLocations: scores.length,
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching status:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  return httpServer;
}
