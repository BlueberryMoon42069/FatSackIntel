import { storage } from "../storage";
import type { InsertLocationScore } from "@shared/schema";

export interface ScoringComponents {
  outageScore: number; // 0-1
  socialScore: number; // 0-1
  solarScore: number; // 0-1
}

export interface ScoringWeights {
  outage: number;
  social: number;
  solar: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  outage: 0.5,  // 50% - outage risk is most important
  social: 0.3,  // 30% - social signals indicate pain points
  solar: 0.2,   // 20% - solar potential is secondary
};

export class ScoringEngine {
  private weights: ScoringWeights;

  constructor(weights?: Partial<ScoringWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  // Calculate outage risk score from historical reliability data
  async calculateOutageScore(
    provider: string,
    recentOutages24h: number
  ): Promise<number> {
    try {
      // Get last 3 years of reliability data
      const metrics = await storage.getReliabilityMetrics(provider);
      const recentMetrics = metrics.filter(m => m.year >= 2021);

      if (recentMetrics.length === 0) {
        return 0.5; // Default medium risk
      }

      // Average SAIDI (System Average Interruption Duration Index)
      const avgSAIDI = recentMetrics.reduce((sum, m) => sum + (m.saidi || 0), 0) / recentMetrics.length;
      
      // MA average is ~150 minutes. Above 200 is high risk.
      let score = Math.min(1.0, avgSAIDI / 250);

      // Boost score if there are recent outages
      if (recentOutages24h > 0) {
        score = Math.min(1.0, score + 0.2 * recentOutages24h);
      }

      return score;
    } catch (error) {
      console.error("Error calculating outage score:", error);
      return 0.5;
    }
  }

  // Calculate social signal score from recent activity
  async calculateSocialScore(town: string, hours: number = 24): Promise<number> {
    try {
      const signals = await storage.getSocialSignalsByTown(town, hours);

      if (signals.length === 0) {
        return 0.1; // Low score if no activity
      }

      // Weight by category and urgency
      const outageSignals = signals.filter(s => s.category === "outage");
      const intentSignals = signals.filter(s => s.category === "intent");
      const billingSignals = signals.filter(s => s.category === "billing");

      const avgUrgency = signals.reduce((sum, s) => sum + s.urgency, 0) / signals.length;

      // Composite score
      let score = (
        outageSignals.length * 0.1 +    // Each outage mention adds 0.1
        intentSignals.length * 0.05 +   // Each intent signal adds 0.05
        billingSignals.length * 0.02 +  // Each billing complaint adds 0.02
        avgUrgency * 0.3                // Average urgency contributes 0-0.3
      );

      return Math.min(1.0, score);
    } catch (error) {
      console.error("Error calculating social score:", error);
      return 0.1;
    }
  }

  // Calculate solar potential score
  async calculateSolarScoreForLocation(lat: number, lon: number, h3Cell?: string): Promise<number> {
    try {
      // Try to get existing solar data
      let solarData;
      
      if (h3Cell) {
        solarData = await storage.getSolarDataByH3(h3Cell);
      }
      
      if (!solarData) {
        const nearby = await storage.getSolarData(lat, lon, 0.01);
        solarData = nearby[0];
      }

      if (!solarData) {
        return 0.6; // Default good potential for MA
      }

      // Solar score is already 0-100, normalize to 0-1
      return (solarData.solarScore || 60) / 100;
    } catch (error) {
      console.error("Error calculating solar score:", error);
      return 0.6;
    }
  }

  // Calculate composite location score
  calculateFinalScore(components: ScoringComponents): number {
    return (
      components.outageScore * this.weights.outage +
      components.socialScore * this.weights.social +
      components.solarScore * this.weights.solar
    );
  }

  // Score a location and store in database
  async scoreLocation(
    h3Cell: string,
    lat: number,
    lon: number,
    town: string,
    provider: string
  ): Promise<InsertLocationScore> {
    // Get active outages in last 24h (simplified - in production, use H3 spatial queries)
    const activeOutages = await storage.getActiveOutages();
    const outageEvents24h = activeOutages.filter(o => 
      o.provider === provider &&
      o.reportedAt && 
      Date.now() - new Date(o.reportedAt).getTime() < 24 * 60 * 60 * 1000
    ).length;

    // Calculate component scores
    const outageScore = await this.calculateOutageScore(provider, outageEvents24h);
    const socialScore = await this.calculateSocialScore(town);
    const solarScore = await this.calculateSolarScoreForLocation(lat, lon, h3Cell);

    // Get social mentions in last 24h
    const socialSignals = await storage.getSocialSignalsByTown(town, 24);
    const socialMentions24h = socialSignals.length;

    // Calculate final score
    const finalScore = this.calculateFinalScore({
      outageScore,
      socialScore,
      solarScore,
    });

    const locationScore: InsertLocationScore = {
      h3Cell,
      lat,
      lon,
      outageScore,
      socialScore,
      solarScore,
      finalScore,
      outageEvents24h,
      socialMentions24h,
    };

    // Store in database
    await storage.createOrUpdateLocationScore(locationScore);

    return locationScore;
  }

  // Batch score multiple locations
  async batchScoreLocations(
    locations: Array<{
      h3Cell: string;
      lat: number;
      lon: number;
      town: string;
      provider: string;
    }>
  ): Promise<void> {
    console.log(`Scoring ${locations.length} locations...`);
    
    for (const loc of locations) {
      try {
        await this.scoreLocation(loc.h3Cell, loc.lat, loc.lon, loc.town, loc.provider);
      } catch (error) {
        console.error(`Error scoring ${loc.h3Cell}:`, error);
      }
    }
    
    console.log("Batch scoring complete");
  }

  // Get top ranked locations
  async getTopRankedLocations(limit: number = 100): Promise<any[]> {
    return await storage.getTopLocations(limit);
  }
}

export const scoringEngine = new ScoringEngine();
