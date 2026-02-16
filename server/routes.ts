import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { providerManager } from "./scrapers/index";
import { socialScraper } from "./scrapers/social";
import { solarCalculator } from "./utils/solar";
import { scoringEngine } from "./utils/scoring";
import { parseOutageReport } from "./utils/excel-parser";

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

// Massachusetts town centroids [lng, lat]
// Expanded to cover all major towns from DPU filings
const townCentroids: Record<string, [number, number]> = {
  // Worcester County
  "CLINTON": [-71.6823, 42.4167],
  "WESTBOROUGH": [-71.6162, 42.2695],
  "WORCESTER": [-71.8023, 42.2626],
  "AUBURN": [-71.8356, 42.1945],
  "SPENCER": [-71.9923, 42.2456],
  "STERLING": [-71.7612, 42.4356],
  "HOLDEN": [-71.8623, 42.3512],
  "LEICESTER": [-71.9295, 42.3112],
  "CHARLTON": [-72.0512, 42.1323],
  "WARREN": [-72.1912, 42.2123],
  "WESTMINSTER": [-71.9112, 42.5456],
  "PAXTON": [-71.9412, 42.3012],
  "BROOKFIELD": [-72.1012, 42.2112],
  "WEST BROOKFIELD": [-72.1623, 42.2334],
  "WEBSTER": [-71.8801, 42.0501],
  "DUDLEY": [-71.9312, 42.0512],
  "OXFORD": [-71.8645, 42.1168],
  "DOUGLAS": [-71.7412, 42.0512],
  "UXBRIDGE": [-71.6323, 42.0712],
  "NORTHBRIDGE": [-71.6523, 42.1512],
  "SUTTON": [-71.7612, 42.1312],
  "MILLBURY": [-71.7612, 42.1945],
  "GRAFTON": [-71.6856, 42.2068],
  "SHREWSBURY": [-71.7134, 42.2956],
  "LEOMINSTER": [-71.7598, 42.5251],
  "FITCHBURG": [-71.8031, 42.5834],
  "GARDNER": [-71.9981, 42.5751],
  // Boston Metro
  "BOSTON": [-71.0589, 42.3601],
  "BOSTON DOWNTOWN": [-71.0589, 42.3601],
  "CAMBRIDGE": [-71.1097, 42.3736],
  "SOMERVILLE": [-71.0995, 42.3876],
  "BROOKLINE": [-71.1212, 42.3318],
  "NEWTON": [-71.2092, 42.3370],
  "WALTHAM": [-71.2356, 42.3765],
  "LEXINGTON": [-71.2273, 42.4473],
  "ARLINGTON": [-71.1569, 42.4154],
  "BELMONT": [-71.1789, 42.3959],
  "WATERTOWN": [-71.1773, 42.3709],
  "BURLINGTON": [-71.1956, 42.5048],
  "BRIGHTON": [-71.1513, 42.3489],
  "WEST ROXBURY": [-71.1573, 42.2789],
  "DORCHESTER": [-71.0589, 42.3001],
  "SOUTH BOSTON": [-71.0489, 42.3389],
  "DEDHAM": [-71.1656, 42.2423],
  "NORWOOD": [-71.1956, 42.1887],
  // Western MA
  "SPRINGFIELD": [-72.5898, 42.1015],
  "WEST SPRINGFIELD": [-72.6201, 42.1070],
  "HOLYOKE": [-72.6162, 42.2043],
  "CHICOPEE": [-72.6076, 42.1487],
  "NORTHAMPTON": [-72.6401, 42.3251],
  "AMHERST": [-72.5198, 42.3751],
  "PITTSFIELD": [-73.2601, 42.4501],
  "GREENFIELD": [-72.6001, 42.5876],
  // MetroWest
  "FRAMINGHAM": [-71.4162, 42.2793],
  "NATICK": [-71.3489, 42.2834],
  "WELLESLEY": [-71.2923, 42.2959],
  "NEEDHAM": [-71.2323, 42.2834],
  "ASHLAND": [-71.4623, 42.2612],
  "MARLBOROUGH": [-71.5523, 42.3459],
  "SUDBURY": [-71.4156, 42.3834],
  "CONCORD": [-71.3489, 42.4601],
  "ACTON": [-71.4356, 42.4851],
  // Cape Cod / South Shore
  "BARNSTABLE": [-70.2962, 41.7003],
  "FALMOUTH": [-70.6156, 41.5517],
  "YARMOUTH": [-70.2289, 41.7060],
  "PLYMOUTH": [-70.6623, 41.9584],
  "MARSHFIELD": [-70.7056, 42.0917],
  "BROCKTON": [-71.0184, 42.0834],
  "TAUNTON": [-71.0898, 41.9001],
  "NEW BEDFORD": [-70.9342, 41.6362],
  "FALL RIVER": [-71.1551, 41.7015],
  // North Shore
  "SALEM": [-70.8984, 42.5195],
  "BEVERLY": [-70.8801, 42.5584],
  "PEABODY": [-70.9284, 42.5278],
  "LYNN": [-70.9495, 42.4668],
  "GLOUCESTER": [-70.6623, 42.6159],
  "HAVERHILL": [-71.0773, 42.7762],
  "LAWRENCE": [-71.1634, 42.7070],
  "LOWELL": [-71.3162, 42.6334],
  "CHELMSFORD": [-71.3673, 42.5998],
  // Legacy lowercase versions for backwards compat
  "Clinton": [-71.6823, 42.4167],
  "Westborough": [-71.6162, 42.2695],
  "Worcester": [-71.8023, 42.2626],
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // ===== OUTAGES API =====
  
  // Main outages endpoint for live map - returns GeoJSON FeatureCollection
  // Helper: find nearest town from coordinates
  function findNearestTown(lng: number, lat: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [town, [tLng, tLat]] of Object.entries(townCentroids)) {
      if (town !== town.toUpperCase()) continue; // skip lowercase duplicates
      const d = Math.sqrt((lng - tLng) ** 2 + (lat - tLat) ** 2);
      if (d < bestDist) { bestDist = d; best = town; }
    }
    return bestDist < 0.15 ? best : null; // ~10 mile threshold
  }

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

        // Resolve town from coordinates
        let town: string | null = null;
        if (outageGeom.type === 'Point' && outageGeom.coordinates) {
          town = findNearestTown(outageGeom.coordinates[0], outageGeom.coordinates[1]);
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

      // Add towns with historical outage data (PRIMARY DATA SOURCE - real DPU filings)
      // This is the most important data source for "Knock Now" scoring
      const maxIncidents = Math.max(...Array.from(townHistorical.values()).map(t => t.totalIncidents), 1);
      
      for (const [townKey, historical] of Array.from(townHistorical)) {
        // Check if already added via locations
        const existing = rankings.find(r => r.name?.toUpperCase() === townKey);
        if (existing) continue;
        
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
        const existing = rankings.find(r => r.name === townName || r.name === townName.toUpperCase());
        if (!existing) {
          // Calculate knock score from social signals only
          const socialScore = Math.min(1.0, (
            social.outageCount * 0.1 +
            social.intentCount * 0.05 +
            social.billingCount * 0.02 +
            social.avgUrgency * 0.3
          ));
          
          const townCoords = townCentroids[townName] || townCentroids[townName.toUpperCase()];
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

      // Add territories from reliability data (legacy support)
      for (const [territory, data] of Array.from(territoryScores)) {
        const existing = rankings.find(r => r.name === territory);
        if (!existing) {
          // Higher SAIDI = higher outage risk score
          const outageScore = Math.min(1.0, data.avgSAIDI / 250);
          
          const territoryCoords = territoryCentroids[territory];
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

  // Legacy endpoint - now uses file upload instead
  app.post("/api/admin/import/historical", async (req, res) => {
    res.status(400).json({ 
      error: "This endpoint is deprecated. Please use POST /api/admin/upload/historical with file upload instead.",
      instructions: "Upload DPU Outage_Accident_Report Excel files (.xlsx) via the Admin page."
    });
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
        avgDurationMinutes: Math.round(totalDuration / outages.length),
        avgCustomersAffected: Math.round(totalCustomers / outages.length),
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
      
      const outages = await storage.getHistoricalOutages({
        town: town as string,
        street: street as string,
        utility: utility as string,
        year: year ? parseInt(year as string) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json({
        updatedAt: new Date().toISOString(),
        total: outages.length,
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

  // Gas coverage layer - MA municipalities with natural gas service
  app.get("/api/layers/gas", async (_req, res) => {
    try {
      const gasTowns: Record<string, [number, number][]> = {
        "Boston": [[-71.12, 42.40], [-71.12, 42.32], [-71.00, 42.32], [-71.00, 42.40]],
        "Worcester": [[-71.87, 42.30], [-71.87, 42.22], [-71.74, 42.22], [-71.74, 42.30]],
        "Springfield": [[-72.65, 42.14], [-72.65, 42.06], [-72.53, 42.06], [-72.53, 42.14]],
        "Cambridge": [[-71.16, 42.40], [-71.16, 42.35], [-71.07, 42.35], [-71.07, 42.40]],
        "Lowell": [[-71.37, 42.66], [-71.37, 42.61], [-71.27, 42.61], [-71.27, 42.66]],
        "Brockton": [[-71.07, 42.11], [-71.07, 42.06], [-70.97, 42.06], [-70.97, 42.11]],
        "New Bedford": [[-70.98, 41.67], [-70.98, 41.61], [-70.89, 41.61], [-70.89, 41.67]],
        "Fall River": [[-71.20, 41.73], [-71.20, 41.68], [-71.11, 41.68], [-71.11, 41.73]],
        "Newton": [[-71.26, 42.37], [-71.26, 42.31], [-71.16, 42.31], [-71.16, 42.37]],
        "Framingham": [[-71.47, 42.31], [-71.47, 42.25], [-71.37, 42.25], [-71.37, 42.31]],
        "Haverhill": [[-71.13, 42.80], [-71.13, 42.75], [-71.03, 42.75], [-71.03, 42.80]],
        "Lawrence": [[-71.22, 42.73], [-71.22, 42.68], [-71.12, 42.68], [-71.12, 42.73]],
        "Somerville": [[-71.12, 42.40], [-71.12, 42.37], [-71.07, 42.37], [-71.07, 42.40]],
        "Brookline": [[-71.17, 42.35], [-71.17, 42.31], [-71.10, 42.31], [-71.10, 42.35]],
        "Plymouth": [[-70.72, 41.99], [-70.72, 41.93], [-70.62, 41.93], [-70.62, 41.99]],
        "Salem": [[-70.94, 42.54], [-70.94, 42.50], [-70.86, 42.50], [-70.86, 42.54]],
        "Taunton": [[-71.14, 41.93], [-71.14, 41.87], [-71.04, 41.87], [-71.04, 41.93]],
        "Pittsfield": [[-73.31, 42.48], [-73.31, 42.42], [-73.21, 42.42], [-73.21, 42.48]],
        "Holyoke": [[-72.67, 42.23], [-72.67, 42.18], [-72.57, 42.18], [-72.57, 42.23]],
        "Chicopee": [[-72.66, 42.18], [-72.66, 42.12], [-72.56, 42.12], [-72.56, 42.18]],
      };

      const features = Object.entries(gasTowns).map(([name, coords]) => ({
        type: "Feature" as const,
        properties: { name, has_gas: true, provider: "National Grid / Eversource" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[...coords, coords[0]]],
        },
      }));

      res.json({
        updatedAt: new Date().toISOString(),
        source: "sample" as const,
        features: { type: "FeatureCollection", features },
      });
    } catch (error) {
      console.error("Error fetching gas layer:", error);
      res.status(500).json({ error: "Failed to fetch gas layer" });
    }
  });

  // Electric heating share layer - towns with higher electric heat usage
  app.get("/api/layers/heating", async (_req, res) => {
    try {
      const heatingTowns: { name: string; share: number; coords: [number, number][] }[] = [
        { name: "Barnstable", share: 0.35, coords: [[-70.35, 41.73], [-70.35, 41.67], [-70.24, 41.67], [-70.24, 41.73]] },
        { name: "Falmouth", share: 0.32, coords: [[-70.67, 41.58], [-70.67, 41.52], [-70.56, 41.52], [-70.56, 41.58]] },
        { name: "Yarmouth", share: 0.30, coords: [[-70.28, 41.73], [-70.28, 41.68], [-70.18, 41.68], [-70.18, 41.73]] },
        { name: "Nantucket", share: 0.42, coords: [[-70.12, 41.30], [-70.12, 41.24], [-70.02, 41.24], [-70.02, 41.30]] },
        { name: "Martha's Vineyard", share: 0.38, coords: [[-70.65, 41.42], [-70.65, 41.36], [-70.52, 41.36], [-70.52, 41.42]] },
        { name: "Provincetown", share: 0.33, coords: [[-70.20, 42.07], [-70.20, 42.03], [-70.14, 42.03], [-70.14, 42.07]] },
        { name: "Chatham", share: 0.29, coords: [[-69.99, 41.70], [-69.99, 41.65], [-69.90, 41.65], [-69.90, 41.70]] },
        { name: "Wellfleet", share: 0.27, coords: [[-70.00, 41.95], [-70.00, 41.90], [-69.93, 41.90], [-69.93, 41.95]] },
        { name: "Truro", share: 0.28, coords: [[-70.08, 42.02], [-70.08, 41.97], [-70.01, 41.97], [-70.01, 42.02]] },
        { name: "Brewster", share: 0.25, coords: [[-70.10, 41.78], [-70.10, 41.73], [-70.01, 41.73], [-70.01, 41.78]] },
        { name: "Eastham", share: 0.26, coords: [[-69.99, 41.85], [-69.99, 41.80], [-69.93, 41.80], [-69.93, 41.85]] },
        { name: "Orleans", share: 0.24, coords: [[-69.99, 41.81], [-69.99, 41.77], [-69.93, 41.77], [-69.93, 41.81]] },
        { name: "Dennis", share: 0.23, coords: [[-70.18, 41.73], [-70.18, 41.69], [-70.10, 41.69], [-70.10, 41.73]] },
        { name: "Harwich", share: 0.22, coords: [[-70.08, 41.70], [-70.08, 41.66], [-69.99, 41.66], [-69.99, 41.70]] },
        { name: "Sandwich", share: 0.20, coords: [[-70.53, 41.78], [-70.53, 41.73], [-70.45, 41.73], [-70.45, 41.78]] },
        { name: "Bourne", share: 0.19, coords: [[-70.62, 41.75], [-70.62, 41.70], [-70.55, 41.70], [-70.55, 41.75]] },
        { name: "Mashpee", share: 0.21, coords: [[-70.51, 41.66], [-70.51, 41.61], [-70.44, 41.61], [-70.44, 41.66]] },
      ];

      const features = heatingTowns.map(t => ({
        type: "Feature" as const,
        properties: { name: t.name, electric_heat_share: t.share },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[...t.coords, t.coords[0]]],
        },
      }));

      res.json({
        updatedAt: new Date().toISOString(),
        source: "sample" as const,
        features: { type: "FeatureCollection", features },
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

  return httpServer;
}
