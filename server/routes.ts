import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { providerManager } from "./scrapers/index";
import { socialScraper } from "./scrapers/social";
import { solarCalculator } from "./utils/solar";
import { scoringEngine } from "./utils/scoring";
import { importHistoricalData, getHistoricalSummary } from "./utils/historical-import";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ===== OUTAGES API =====
  
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
      res.json({ success: true, ...result });
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
