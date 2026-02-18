import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { providerManager } from "./scrapers/index";
import { socialScraper } from "./scrapers/social";
import { solarCalculator } from "./utils/solar";
import { scoringEngine } from "./utils/scoring";
import { parseOutageReport } from "./utils/excel-parser";
import { townCentroids, getTownCoords, findNearestTown as findNearestTownUtil, getAllTownNames } from "./utils/towns";
import { getCache, setCache, TTL } from "./utils/cache";

import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

// Configure multer for file uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'application/csv',
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
});

const territoryCentroids: Record<string, [number, number]> = {
  "Worcester County": [-71.8, 42.26],
  "Central MA": [-71.9, 42.25],
  "North Worcester County": [-71.7, 42.45],
  "Boston Metro": [-71.05, 42.36],
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // ===== OUTAGES API =====
  
  // Main outages endpoint for live map - returns GeoJSON FeatureCollection
  // findNearestTown imported from ./utils/towns
  const findNearestTown = findNearestTownUtil;

  // Helper: calculate severity score
  function calculateSeverityScore(customers: number, hoursOut: number, reportedAt: Date): number {
    // Time factor: longer outages are more severe (log scale)
    const timeFactor = Math.min(1.0, Math.log2(1 + hoursOut) / 6); // maxes at ~64 hours

    // Customer factor: more customers = more severe (log scale)
    const customerFactor = Math.min(1.0, Math.log10(1 + customers) / 4); // maxes at ~10000

    // Peak hour factor: outages during peak usage are more impactful
    const hour = reportedAt.getHours();
    const isPeakMorning = hour >= 6 && hour <= 9;
    const isPeakEvening = hour >= 16 && hour <= 21;
    const peakFactor = isPeakMorning ? 0.7 : isPeakEvening ? 1.0 : 0.3;

    // Weighted combination
    const score = (
      timeFactor * 0.30 +
      customerFactor * 0.40 +
      peakFactor * 0.20 +
      0.10 // base severity for any active outage
    );

    return Math.min(1.0, Math.max(0, score));
  }

  app.get("/api/outages", async (req, res) => {
    try {
      const outages = await storage.getActiveOutages();
      const locations = await storage.getTopLocations(1000);
      const now = Date.now();
      
      const features = outages.map(outage => {
        const outageGeom = outage.geometry as any;
        const locationMatch = locations.find(l => 
          outageGeom.type === 'Point' && 
          Math.abs(l.lat - outageGeom.coordinates[1]) < 0.1 && 
          Math.abs(l.lon - outageGeom.coordinates[0]) < 0.1
        );

        // Resolve town from coordinates (supports Point and Polygon centroid)
        let town: string | null = null;
        if (outageGeom.type === 'Point' && outageGeom.coordinates) {
          town = findNearestTown(outageGeom.coordinates[0], outageGeom.coordinates[1]);
        } else if (outageGeom.type === 'Polygon' && outageGeom.coordinates?.[0]) {
          const ring = outageGeom.coordinates[0];
          const avgLng = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
          const avgLat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
          town = findNearestTown(avgLng, avgLat);
        }

        // Calculate hours out
        const reportedAt = outage.reportedAt ? new Date(outage.reportedAt) : new Date();
        const hoursOut = Math.max(0, (now - reportedAt.getTime()) / (1000 * 60 * 60));

        // Calculate severity score
        const severity = calculateSeverityScore(
          outage.customersAffected ?? 0,
          hoursOut,
          reportedAt
        );

        // Build display location
        const displayLocation = town || "Unknown Area";

        return {
          type: "Feature" as const,
          properties: {
            id: outage.id,
            provider: outage.provider,
            customers: outage.customersAffected,
            status: outage.status,
            confidence: outage.confidence,
            reportedAt: outage.reportedAt,
            location: displayLocation,
            town: town,
            hoursOut: Math.round(hoursOut * 10) / 10,
            severity,
            knockScore: locationMatch?.finalScore ?? 0.6,
            outageScore: locationMatch?.outageScore ?? 0.7,
            socialScore: locationMatch?.socialScore ?? 0.3,
            solarScore: locationMatch?.solarScore ?? 0.65,
          },
          geometry: outage.geometry,
        };
      });

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
      // Get reliability metrics and summarize
      const metrics = await storage.getReliabilityMetrics();
      const providers = Array.from(new Set(metrics.map(m => m.provider)));
      const years = Array.from(new Set(metrics.map(m => m.year))).sort((a, b) => (b || 0) - (a || 0));
      
      res.json({
        totalRecords: metrics.length,
        providers,
        years,
        averages: {
          saidi: metrics.reduce((sum, m) => sum + (m.saidi || 0), 0) / (metrics.length || 1),
          saifi: metrics.reduce((sum, m) => sum + (m.saifi || 0), 0) / (metrics.length || 1),
          caidi: metrics.reduce((sum, m) => sum + (m.caidi || 0), 0) / (metrics.length || 1),
        },
      });
    } catch (error) {
      console.error("Error fetching reliability summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // ===== SOCIAL SIGNALS API =====

  app.get("/api/social", async (req, res) => {
    try {
      const { hours = "24" } = req.query;
      const hoursNum = parseInt(hours as string);
      
      const currentSignals = await storage.getRecentSocialSignals(hoursNum);
      const priorSignals = await storage.getRecentSocialSignals(hoursNum * 2);
      const olderSignals = priorSignals.filter(s => {
        const age = Date.now() - new Date(s.timestamp).getTime();
        return age > hoursNum * 3600 * 1000;
      });
      
      const townMap = new Map<string, {
        signals: typeof currentSignals;
        categories: Record<string, number>;
      }>();
      
      for (const signal of currentSignals) {
        if (!townMap.has(signal.town)) {
          townMap.set(signal.town, { signals: [], categories: {} });
        }
        const entry = townMap.get(signal.town)!;
        entry.signals.push(signal);
        entry.categories[signal.category] = (entry.categories[signal.category] || 0) + 1;
      }
      
      const priorTownCounts = new Map<string, number>();
      for (const signal of olderSignals) {
        priorTownCounts.set(signal.town, (priorTownCounts.get(signal.town) || 0) + 1);
      }
      
      const globalCategories: Record<string, number> = {};
      for (const signal of currentSignals) {
        globalCategories[signal.category] = (globalCategories[signal.category] || 0) + 1;
      }
      const dominantTopic = Object.entries(globalCategories).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
      
      const towns = Array.from(townMap.entries()).map(([town, data]) => {
        const volume_24h = data.signals.length;
        const priorCount = priorTownCounts.get(town) || 0;
        const trend = volume_24h > priorCount * 1.1 ? "up" : volume_24h < priorCount * 0.9 ? "down" : "flat";
        
        const avgUrgency = data.signals.length > 0
          ? data.signals.reduce((sum, s) => sum + s.urgency, 0) / data.signals.length
          : 0;
        
        const score = Math.min(1.0,
          (data.categories["outage"] || 0) * 0.10 +
          (data.categories["intent"] || 0) * 0.05 +
          (data.categories["billing"] || 0) * 0.02 +
          avgUrgency * 0.30
        );
        
        const topKeywords = data.signals
          .flatMap(s => (s.keywords as string[]) || [])
          .reduce((acc, k) => {
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        
        return {
          town,
          score,
          volume_24h,
          trend,
          top_keywords: Object.entries(topKeywords).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
          posts: data.signals.slice(0, 5).map(s => ({
            id: s.id,
            source: s.source,
            town: s.town,
            text: s.text,
            timestamp: s.timestamp,
            category: s.category as "outage" | "billing" | "intent" | "general",
            urgency: s.urgency,
          })),
        };
      }).sort((a, b) => b.score - a.score);
      
      res.json({
        updatedAt: new Date().toISOString(),
        dominantTopic,
        towns,
      });
    } catch (error) {
      console.error("Error fetching social overview:", error);
      res.status(500).json({ error: "Failed to fetch social overview" });
    }
  });

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
  // Uses real DPU historical outage data for outage risk scoring
  app.get("/api/rankings", async (req, res) => {
    try {
      const { town, minScore, sortBy = "finalScore", limit = "100" } = req.query;
      
      // Get all data sources including historical outages
      const [reliability, socialSignals, locations, historicalOutages] = await Promise.all([
        storage.getReliabilityMetrics(),
        storage.getRecentSocialSignals(24),
        storage.getTopLocations(parseInt(limit as string)),
        storage.getHistoricalOutages({ limit: 50000 }), // Get all historical records
      ]);

      // Build town-level historical outage aggregates (REAL DPU DATA)
      const townHistorical = new Map<string, {
        town: string;
        totalIncidents: number;
        totalCustomers: number;
        totalDuration: number;
        avgDuration: number;
        utilities: Set<string>;
        years: Set<number>;
      }>();
      
      for (const outage of historicalOutages) {
        const townKey = outage.town?.toUpperCase();
        if (!townKey) continue;
        
        if (!townHistorical.has(townKey)) {
          townHistorical.set(townKey, {
            town: townKey,
            totalIncidents: 0,
            totalCustomers: 0,
            totalDuration: 0,
            avgDuration: 0,
            utilities: new Set(),
            years: new Set(),
          });
        }
        const agg = townHistorical.get(townKey)!;
        agg.totalIncidents++;
        agg.totalCustomers += outage.customersOut || 0;
        agg.totalDuration += outage.durationHours || 0;
        if (outage.utility) agg.utilities.add(outage.utility);
        if (outage.year) agg.years.add(outage.year);
      }
      
      // Calculate averages for historical data
      for (const [, agg] of Array.from(townHistorical)) {
        if (agg.totalIncidents > 0) {
          agg.avgDuration = agg.totalDuration / agg.totalIncidents;
        }
      }

      // Build territory-level aggregates from SAIDI/SAIFI data
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

      // Calculate averages for reliability metrics
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
      const rankings: any[] = [];
      const addedNames = new Set<string>();

      // Add scored locations
      for (const loc of locations) {
        const name = loc.h3Cell;
        addedNames.add(name.toUpperCase());
        rankings.push({
          id: loc.id,
          type: "h3_cell",
          name,
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

      // Add towns with historical outage data (PRIMARY DATA SOURCE - real DPU filings)
      // This is the most important data source for "Knock Now" scoring
      const townIncidentCounts = Array.from(townHistorical.values()).map(t => t.totalIncidents);
      const maxIncidents = townIncidentCounts.length > 0 ? Math.max(...townIncidentCounts) : 1;
      
      for (const [townKey, historical] of Array.from(townHistorical)) {
        if (addedNames.has(townKey)) continue;
        
        // Calculate outage score based on incident frequency and severity
        // Higher incidents = higher score (more sales opportunity)
        const incidentRatio = historical.totalIncidents / maxIncidents;
        const durationFactor = Math.min(1.0, historical.avgDuration / 10); // Normalize by 10 hour avg
        const outageScore = Math.min(1.0, (incidentRatio * 0.7 + durationFactor * 0.3));
        
        // Check for social signals for this town
        const social = townSocial.get(townKey) || townSocial.get(historical.town);
        const socialScore = social ? Math.min(1.0, (
          social.outageCount * 0.1 +
          social.intentCount * 0.05 +
          social.billingCount * 0.02 +
          social.avgUrgency * 0.3
        )) : 0;
        
        // Final knock score: outage risk (50%) + social signals (30%) + solar potential (20%)
        const solarScore = 0.65; // MA average solar potential
        const knockScore = outageScore * 0.5 + socialScore * 0.3 + solarScore * 0.2;
        
        const townCoords = townCentroids[townKey];
        addedNames.add(townKey);
        rankings.push({
          id: `town-${townKey}`,
          type: "town",
          name: townKey,
          lat: townCoords ? townCoords[1] : null,
          lon: townCoords ? townCoords[0] : null,
          knockScore,
          outageScore,
          socialScore,
          solarScore,
          historicalData: {
            totalIncidents: historical.totalIncidents,
            totalCustomers: historical.totalCustomers,
            avgDuration: historical.avgDuration,
            utilities: Array.from(historical.utilities),
            years: Array.from(historical.years),
            dataSource: "DPU Outage Accident Reports",
          },
          socialData: social ? {
            outageCount: social.outageCount,
            billingCount: social.billingCount,
            intentCount: social.intentCount,
            avgUrgency: social.avgUrgency,
          } : null,
        });
      }

      // Add towns with social signals only (not in historical data)
      for (const [townName, social] of Array.from(townSocial)) {
        if (!addedNames.has(townName.toUpperCase())) {
          // Calculate knock score from social signals only
          const socialScore = Math.min(1.0, (
            social.outageCount * 0.1 +
            social.intentCount * 0.05 +
            social.billingCount * 0.02 +
            social.avgUrgency * 0.3
          ));
          
          const townCoords = townCentroids[townName] || townCentroids[townName.toUpperCase()];
          addedNames.add(townName.toUpperCase());
          rankings.push({
            id: `town-${townName}`,
            type: "town",
            name: townName,
            lat: townCoords ? townCoords[1] : null,
            lon: townCoords ? townCoords[0] : null,
            knockScore: socialScore * 0.3 + 0.65 * 0.2, // Social + default solar only
            outageScore: 0, // No historical data
            socialScore,
            solarScore: 0.65,
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
        if (addedNames.has(territory.toUpperCase())) continue;

        const outageScore = Math.min(1.0, data.avgSAIDI / 250);
        const territoryCoords = territoryCentroids[territory];
        addedNames.add(territory.toUpperCase());
        rankings.push({
          id: `territory-${territory}`,
          type: "territory",
          name: territory,
          provider: data.provider,
          lat: territoryCoords ? territoryCoords[1] : null,
          lon: territoryCoords ? territoryCoords[0] : null,
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

  app.post("/api/admin/scrape/nextdoor", async (req, res) => {
    try {
      const { nextdoorScraper } = await import("./scrapers/nextdoor");
      const result = await nextdoorScraper.scrapeAndStore();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Nextdoor scrape error:", error);
      res.status(500).json({ error: "Failed to scrape Nextdoor" });
    }
  });

  app.post("/api/admin/scrape/facebook", async (req, res) => {
    try {
      const { facebookScraper } = await import("./scrapers/facebook");
      const result = await facebookScraper.scrapeAndStore();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Facebook scrape error:", error);
      res.status(500).json({ error: "Failed to scrape Facebook" });
    }
  });

  app.post("/api/admin/scrape/all-social", async (req, res) => {
    try {
      const { nextdoorScraper } = await import("./scrapers/nextdoor");
      const { facebookScraper } = await import("./scrapers/facebook");
      
      const [twitterResult, nextdoorResult, facebookResult] = await Promise.allSettled([
        socialScraper.scrapeAndStore(),
        nextdoorScraper.scrapeAndStore(),
        facebookScraper.scrapeAndStore(),
      ]);
      
      res.json({
        success: true,
        twitter: twitterResult.status === "fulfilled" ? twitterResult.value : { error: (twitterResult as any).reason?.message },
        nextdoor: nextdoorResult.status === "fulfilled" ? nextdoorResult.value : { error: (nextdoorResult as any).reason?.message },
        facebook: facebookResult.status === "fulfilled" ? facebookResult.value : { error: (facebookResult as any).reason?.message },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to run social scrapes" });
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
      const [outages, reliability, social, solar, scores, historicalStats] = await Promise.all([
        storage.getActiveOutages(),
        storage.getReliabilityMetrics(),
        storage.getRecentSocialSignals(24),
        storage.getSolarData(42.3, -71.8, 1.0),
        storage.getTopLocations(10),
        storage.getHistoricalOutageStats(),
      ]);

      res.json({
        counts: {
          activeOutages: outages.length,
          reliabilityRecords: reliability.length,
          recentSocialSignals: social.length,
          solarDataPoints: solar.length,
          scoredLocations: scores.length,
          historicalOutages: historicalStats.totalRecords,
        },
        historical: {
          utilities: historicalStats.utilities,
          years: historicalStats.years,
          topTowns: historicalStats.topTowns,
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching status:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  // ===== HISTORICAL OUTAGES API =====

  // Upload DPU Outage_Accident_Report Excel/CSV file
  app.post("/api/admin/upload/historical", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`[upload] Processing file: ${req.file.originalname} (${req.file.size} bytes)`);
      
      const parseResult = parseOutageReport(req.file.buffer, req.file.originalname);
      
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          errors: parseResult.errors,
          warnings: parseResult.warnings,
          stats: parseResult.stats,
        });
      }

      // Insert records into database
      const inserted = await storage.createHistoricalOutagesBatch(parseResult.records);
      
      console.log(`[upload] Inserted ${inserted} historical outage records`);

      res.json({
        success: true,
        message: `Successfully imported ${inserted} historical outage records`,
        stats: parseResult.stats,
        warnings: parseResult.warnings,
      });
    } catch (error) {
      console.error("Error uploading historical data:", error);
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  });

  // Get historical summary for a specific location (town or street)
  app.get("/api/historical/summary", async (req, res) => {
    try {
      const { town, street } = req.query;
      
      if (!town && !street) {
        return res.status(400).json({ error: "Town or street is required" });
      }
      
      const outages = await storage.getHistoricalOutages({
        town: town as string,
        street: street as string,
        limit: 10000,
      });
      
      if (outages.length === 0) {
        return res.json({
          totalOutages: 0,
          totalCustomersAffected: 0,
          avgDurationMinutes: 0,
          avgCustomersAffected: 0,
          mostCommonCauses: [],
          recentOutages: [],
          yearlyBreakdown: {},
        });
      }
      
      // Aggregate statistics
      let totalCustomers = 0;
      let totalDuration = 0;
      const causeCounts: Record<string, number> = {};
      const yearlyData: Record<number, { count: number; customers: number }> = {};
      
      for (const outage of outages) {
        totalCustomers += outage.customersOut || 0;
        // Convert hours to minutes for duration
        totalDuration += (outage.durationHours || 0) * 60;
        
        const cause = outage.cause || "Unknown";
        causeCounts[cause] = (causeCounts[cause] || 0) + 1;
        
        const incidentDate = outage.incidentStart || outage.reportDate;
        const year = incidentDate ? new Date(incidentDate).getFullYear() : outage.year;
        if (!yearlyData[year]) {
          yearlyData[year] = { count: 0, customers: 0 };
        }
        yearlyData[year].count++;
        yearlyData[year].customers += outage.customersOut || 0;
      }
      
      // Sort causes by count
      const mostCommonCauses = Object.entries(causeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cause, count]) => ({ cause, count }));
      
      // Get most recent outages
      const recentOutages = outages
        .sort((a, b) => {
          const dateA = a.incidentStart || a.reportDate || new Date(a.year, 0, 1);
          const dateB = b.incidentStart || b.reportDate || new Date(b.year, 0, 1);
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        })
        .slice(0, 10)
        .map(o => ({
          id: o.id,
          date: o.incidentStart || o.reportDate,
          customersAffected: o.customersOut,
          durationMinutes: Math.round((o.durationHours || 0) * 60),
          cause: o.cause,
          street: o.street,
          utility: o.utility,
        }));
      
      res.json({
        town: town || null,
        street: street || null,
        totalOutages: outages.length,
        totalCustomersAffected: totalCustomers,
        avgDurationMinutes: outages.length > 0 ? Math.round(totalDuration / outages.length) : 0,
        avgCustomersAffected: outages.length > 0 ? Math.round(totalCustomers / outages.length) : 0,
        mostCommonCauses,
        recentOutages,
        yearlyBreakdown: yearlyData,
      });
    } catch (error) {
      console.error("Error fetching historical summary:", error);
      res.status(500).json({ error: "Failed to fetch historical summary" });
    }
  });

  // Get historical outages with search/filter
  app.get("/api/historical", async (req, res) => {
    try {
      const { town, street, utility, year, startDate, endDate, limit, offset } = req.query;

      const filters = {
        town: town as string,
        street: street as string,
        utility: utility as string,
        year: year ? parseInt(year as string) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      const [outages, total] = await Promise.all([
        storage.getHistoricalOutages({
          ...filters,
          limit: limit ? parseInt(limit as string) : 100,
          offset: offset ? parseInt(offset as string) : 0,
        }),
        storage.getHistoricalOutageCount(filters),
      ]);

      res.json({
        updatedAt: new Date().toISOString(),
        total,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
        outages,
      });
    } catch (error) {
      console.error("Error fetching historical outages:", error);
      res.status(500).json({ error: "Failed to fetch historical data" });
    }
  });

  // Get historical outage statistics
  app.get("/api/historical/stats", async (req, res) => {
    try {
      const stats = await storage.getHistoricalOutageStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching historical stats:", error);
      res.status(500).json({ error: "Failed to fetch historical stats" });
    }
  });

  // Get town-level aggregations for heatmap
  app.get("/api/historical/heatmap", async (req, res) => {
    try {
      const { year, utility } = req.query;
      
      // Get all historical outages with filters
      const outages = await storage.getHistoricalOutages({
        utility: utility as string,
        year: year ? parseInt(year as string) : undefined,
        limit: 50000,
      });

      // Aggregate by town
      const townAggregations: Record<string, {
        town: string;
        totalOutages: number;
        totalCustomersAffected: number;
        totalDuration: number;
        avgDuration: number;
      }> = {};

      for (const outage of outages) {
        const town = outage.town;
        if (!townAggregations[town]) {
          townAggregations[town] = {
            town,
            totalOutages: 0,
            totalCustomersAffected: 0,
            totalDuration: 0,
            avgDuration: 0,
          };
        }
        townAggregations[town].totalOutages++;
        townAggregations[town].totalCustomersAffected += outage.customersOut || 0;
        townAggregations[town].totalDuration += outage.durationHours || 0;
      }

      // Calculate averages and add coordinates
      const heatmapData = Object.values(townAggregations).map(agg => {
        const coords = townCentroids[agg.town] || null;
        return {
          ...agg,
          avgDuration: agg.totalOutages > 0 ? agg.totalDuration / agg.totalOutages : 0,
          lat: coords ? coords[1] : null,
          lon: coords ? coords[0] : null,
        };
      }).filter(d => d.lat && d.lon); // Only include towns with coordinates

      res.json({
        updatedAt: new Date().toISOString(),
        total: heatmapData.length,
        data: heatmapData.sort((a, b) => b.totalOutages - a.totalOutages),
      });
    } catch (error) {
      console.error("Error fetching historical heatmap:", error);
      res.status(500).json({ error: "Failed to fetch heatmap data" });
    }
  });

  // ===== LAYER API =====

  // Gas coverage layer - returns empty until real municipal gas boundary data is available
  app.get("/api/layers/gas", async (_req, res) => {
    try {
      res.json({
        updatedAt: new Date().toISOString(),
        dataUnavailable: true,
        message: "Gas coverage boundary data not yet integrated. Real municipal boundary GeoJSON required.",
        features: { type: "FeatureCollection", features: [] },
      });
    } catch (error) {
      console.error("Error fetching gas layer:", error);
      res.status(500).json({ error: "Failed to fetch gas layer" });
    }
  });

  // Electric heating share layer - returns empty until real ACS/census data is integrated
  app.get("/api/layers/heating", async (_req, res) => {
    try {
      res.json({
        updatedAt: new Date().toISOString(),
        dataUnavailable: true,
        message: "Electric heat share data not yet integrated. Real ACS heating fuel data required.",
        features: { type: "FeatureCollection", features: [] },
      });
    } catch (error) {
      console.error("Error fetching heating layer:", error);
      res.status(500).json({ error: "Failed to fetch heating layer" });
    }
  });

  // Delete historical data by utility/year
  app.delete("/api/admin/historical/:utility/:year", async (req, res) => {
    try {
      const { utility, year } = req.params;
      const deleted = await storage.deleteHistoricalOutagesByUtilityYear(utility, parseInt(year));
      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Error deleting historical data:", error);
      res.status(500).json({ error: "Failed to delete historical data" });
    }
  });

  // ===== NEW ENDPOINTS =====

  // GET /api/towns — All MA towns with coordinates from DPU data
  app.get("/api/towns", async (_req, res) => {
    try {
      const cacheKey = "towns:all";
      const cached = getCache<any>(cacheKey);
      if (cached) return res.json(cached);

      const distinctTowns = await storage.getDistinctTowns();
      const allKnownTowns = getAllTownNames();

      // Merge DPU towns with centroid towns
      const allTownNames = Array.from(new Set([...distinctTowns.map(t => t.toUpperCase()), ...allKnownTowns])).sort();

      const towns = allTownNames
        .map(town => {
          const coords = getTownCoords(town);
          return coords ? { town, lat: coords[1], lon: coords[0], inDPUData: distinctTowns.some(t => t.toUpperCase() === town) } : null;
        })
        .filter(Boolean);

      const result = { updatedAt: new Date().toISOString(), total: towns.length, towns };
      setCache(cacheKey, result, TTL.TOWN_SUMMARY);
      res.json(result);
    } catch (error) {
      console.error("Error fetching towns:", error);
      res.status(500).json({ error: "Failed to fetch towns" });
    }
  });

  // GET /api/towns/:town/summary — Knock Score + historical stats + social for one town
  app.get("/api/towns/:town/summary", async (req, res) => {
    try {
      const { town } = req.params;
      const townKey = town.toUpperCase();
      const cacheKey = `town:${townKey}:summary`;
      const cached = getCache<any>(cacheKey);
      if (cached) return res.json(cached);

      const [historicalOutages, socialSignals, locationScores] = await Promise.all([
        storage.getHistoricalOutages({ town: townKey, limit: 10000 }),
        storage.getSocialSignalsByTown(townKey, 168), // 7 days
        storage.getTopLocations(1000),
      ]);

      const locationScore = locationScores.find(l =>
        l.h3Cell === `town-${townKey}` || l.h3Cell === townKey
      );

      const totalCustomers = historicalOutages.reduce((s, o) => s + (o.customersOut || 0), 0);
      const totalDuration = historicalOutages.reduce((s, o) => s + (o.durationHours || 0), 0);

      const causeCounts: Record<string, number> = {};
      for (const o of historicalOutages) {
        const c = o.cause || "Unknown";
        causeCounts[c] = (causeCounts[c] || 0) + 1;
      }

      const coords = getTownCoords(townKey);

      const result = {
        town: townKey,
        lat: coords ? coords[1] : null,
        lon: coords ? coords[0] : null,
        knockScore: locationScore?.finalScore ?? null,
        outageScore: locationScore?.outageScore ?? null,
        socialScore: locationScore?.socialScore ?? null,
        solarScore: locationScore?.solarScore ?? null,
        historical: {
          totalIncidents: historicalOutages.length,
          totalCustomersAffected: totalCustomers,
          avgDurationHours: historicalOutages.length > 0 ? totalDuration / historicalOutages.length : 0,
          topCauses: Object.entries(causeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cause, count]) => ({ cause, count })),
        },
        social: {
          signalCount7d: socialSignals.length,
          avgUrgency: socialSignals.length > 0 ? socialSignals.reduce((s, sig) => s + sig.urgency, 0) / socialSignals.length : 0,
        },
        updatedAt: new Date().toISOString(),
      };

      setCache(cacheKey, result, TTL.TOWN_SUMMARY);
      res.json(result);
    } catch (error) {
      console.error("Error fetching town summary:", error);
      res.status(500).json({ error: "Failed to fetch town summary" });
    }
  });

  // GET /api/towns/:town/timeline — Monthly outage counts over N years
  app.get("/api/towns/:town/timeline", async (req, res) => {
    try {
      const { town } = req.params;
      const townKey = town.toUpperCase();

      const outages = await storage.getHistoricalOutages({ town: townKey, limit: 50000 });

      const monthlyMap = new Map<string, { count: number; customers: number }>();
      for (const o of outages) {
        const date = o.incidentStart || o.reportDate;
        if (!date) continue;
        const d = new Date(date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthlyMap.has(key)) monthlyMap.set(key, { count: 0, customers: 0 });
        const entry = monthlyMap.get(key)!;
        entry.count++;
        entry.customers += o.customersOut || 0;
      }

      const timeline = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month));

      res.json({ town: townKey, total: timeline.length, timeline });
    } catch (error) {
      console.error("Error fetching town timeline:", error);
      res.status(500).json({ error: "Failed to fetch town timeline" });
    }
  });

  // GET /api/reliability/:provider — SAIDI/SAIFI/CAIDI by year with YoY trends
  app.get("/api/reliability/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const cacheKey = `reliability:${provider}`;
      const cached = getCache<any>(cacheKey);
      if (cached) return res.json(cached);

      const metrics = await storage.getReliabilityMetrics(provider);

      // Calculate YoY trends
      const sorted = [...metrics].sort((a, b) => (a.year || 0) - (b.year || 0));
      const withTrends = sorted.map((m, i) => {
        const prev = sorted[i - 1];
        return {
          ...m,
          saidiTrend: prev && prev.saidi && m.saidi ? ((m.saidi - prev.saidi) / prev.saidi) * 100 : null,
          saifiTrend: prev && prev.saifi && m.saifi ? ((m.saifi - prev.saifi) / prev.saifi) * 100 : null,
        };
      });

      const result = {
        provider,
        updatedAt: new Date().toISOString(),
        metrics: withTrends,
        summary: metrics.length > 0 ? {
          avgSAIDI: metrics.reduce((s, m) => s + (m.saidi || 0), 0) / metrics.length,
          avgSAIFI: metrics.reduce((s, m) => s + (m.saifi || 0), 0) / metrics.length,
          avgCAIDI: metrics.reduce((s, m) => s + (m.caidi || 0), 0) / metrics.length,
          yearsOfData: metrics.length,
        } : null,
      };

      setCache(cacheKey, result, TTL.RELIABILITY);
      res.json(result);
    } catch (error) {
      console.error("Error fetching provider reliability:", error);
      res.status(500).json({ error: "Failed to fetch reliability data" });
    }
  });

  // GET /api/outages/heatmap — Live outage count + customers per town
  app.get("/api/outages/heatmap", async (_req, res) => {
    try {
      const activeOutages = await storage.getActiveOutages();

      const townMap = new Map<string, { count: number; customers: number }>();
      for (const outage of activeOutages) {
        const geom = outage.geometry as any;
        if (geom?.type !== "Point" || !geom?.coordinates) continue;
        const town = findNearestTown(geom.coordinates[0], geom.coordinates[1]);
        if (!town) continue;
        if (!townMap.has(town)) townMap.set(town, { count: 0, customers: 0 });
        const entry = townMap.get(town)!;
        entry.count++;
        entry.customers += outage.customersAffected || 0;
      }

      const heatmap = Array.from(townMap.entries()).map(([town, data]) => {
        const coords = getTownCoords(town);
        return { town, ...data, lat: coords ? coords[1] : null, lon: coords ? coords[0] : null };
      }).filter(d => d.lat && d.lon);

      res.json({ updatedAt: new Date().toISOString(), total: heatmap.length, heatmap });
    } catch (error) {
      console.error("Error fetching outage heatmap:", error);
      res.status(500).json({ error: "Failed to fetch outage heatmap" });
    }
  });

  // GET /api/solar/estimate — Annual kWh + savings for lat/lon (NREL PVWatts)
  app.get("/api/solar/estimate", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      if (!lat || !lon) {
        return res.status(400).json({ error: "lat and lon required" });
      }

      const latNum = parseFloat(lat as string);
      const lonNum = parseFloat(lon as string);

      // Check cache first
      const cacheKey = `solar:${latNum.toFixed(3)},${lonNum.toFixed(3)}`;
      const cached = getCache<any>(cacheKey);
      if (cached) return res.json(cached);

      // Check DB for existing solar data near this location
      const nearby = await storage.getSolarData(latNum, lonNum, 0.05);
      if (nearby.length > 0) {
        const s = nearby[0];
        const result = {
          lat: latNum, lon: lonNum,
          annualKwh: s.kwhPerKw ? s.kwhPerKw * 7 : null, // Assume 7kW system
          kwhPerKw: s.kwhPerKw,
          solarScore: s.solarScore,
          source: "db_cache",
          updatedAt: s.updatedAt,
        };
        setCache(cacheKey, result, TTL.TOWN_SUMMARY);
        return res.json(result);
      }

      // Call NREL PVWatts API
      const apiKey = process.env.NREL_API_KEY || "DEMO_KEY";
      const nrelUrl = `https://developer.nrel.gov/api/pvwatts/v8.json?api_key=${apiKey}&lat=${latNum}&lon=${lonNum}&system_capacity=7&azimuth=180&tilt=20&array_type=1&module_type=1&losses=14`;

      const nrelRes = await fetch(nrelUrl, { signal: AbortSignal.timeout(10000) });
      if (!nrelRes.ok) {
        return res.json({ lat: latNum, lon: lonNum, annualKwh: null, source: "nrel_unavailable" });
      }

      const nrelData = await nrelRes.json();
      const annualKwh = nrelData?.outputs?.ac_annual ?? null;
      const kwhPerKw = annualKwh ? annualKwh / 7 : null;

      const result = {
        lat: latNum, lon: lonNum,
        annualKwh,
        kwhPerKw,
        solarScore: kwhPerKw ? Math.min(100, (kwhPerKw / 1600) * 100) : null,
        source: "nrel_pvwatts",
        updatedAt: new Date().toISOString(),
      };

      setCache(cacheKey, result, TTL.TOWN_SUMMARY);
      res.json(result);
    } catch (error) {
      console.error("Error fetching solar estimate:", error);
      res.status(500).json({ error: "Failed to fetch solar estimate" });
    }
  });

  // GET /api/health — Scraper status, DB counts, last run times
  app.get("/api/health", async (_req, res) => {
    try {
      const cacheKey = "health:status";
      const cached = getCache<any>(cacheKey);
      if (cached) return res.json(cached);

      const [outageCount, historicalStats, scraperLogs, socialCount, reliabilityCount] = await Promise.all([
        storage.getActiveOutages().then(o => o.length),
        storage.getHistoricalOutageStats(),
        storage.getScraperLogs(),
        storage.getRecentSocialSignals(24).then(s => s.length),
        storage.getReliabilityMetrics().then(m => m.length),
      ]);

      // Group scraper logs by scraper name (latest per scraper)
      const latestLogs = new Map<string, any>();
      for (const log of scraperLogs) {
        if (!latestLogs.has(log.scraper)) {
          latestLogs.set(log.scraper, log);
        }
      }

      const result = {
        status: "ok",
        updatedAt: new Date().toISOString(),
        database: {
          activeOutages: outageCount,
          historicalOutages: historicalStats.totalRecords,
          socialSignals24h: socialCount,
          reliabilityMetrics: reliabilityCount,
        },
        scrapers: Object.fromEntries(
          Array.from(latestLogs.entries()).map(([name, log]) => [name, {
            status: log.status,
            lastRunAt: log.lastRunAt,
            recordsFetched: log.recordsFetched,
            durationMs: log.durationMs,
            error: log.errorMessage,
          }])
        ),
      };

      setCache(cacheKey, result, TTL.HEALTH);
      res.json(result);
    } catch (error) {
      console.error("Error fetching health:", error);
      res.status(500).json({ error: "Failed to fetch health status" });
    }
  });

  return httpServer;
}
