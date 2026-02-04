import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import type {
  Outage,
  InsertOutage,
  ReliabilityMetric,
  InsertReliabilityMetric,
  SocialSignal,
  InsertSocialSignal,
  SolarData,
  InsertSolarData,
  LocationScore,
  InsertLocationScore,
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export interface IStorage {
  // Outages
  getActiveOutages(): Promise<Outage[]>;
  getOutagesByProvider(provider: string): Promise<Outage[]>;
  createOutage(outage: InsertOutage): Promise<Outage>;
  resolveOutage(id: string): Promise<void>;
  
  // Reliability metrics
  getReliabilityMetrics(provider?: string, year?: number): Promise<ReliabilityMetric[]>;
  createReliabilityMetric(metric: InsertReliabilityMetric): Promise<ReliabilityMetric>;
  
  // Social signals
  getSocialSignalsByTown(town: string, hours?: number): Promise<SocialSignal[]>;
  getRecentSocialSignals(hours?: number): Promise<SocialSignal[]>;
  createSocialSignal(signal: InsertSocialSignal): Promise<SocialSignal>;
  
  // Solar data
  getSolarData(lat: number, lon: number, radius?: number): Promise<SolarData[]>;
  getSolarDataByH3(h3Cell: string): Promise<SolarData | undefined>;
  createOrUpdateSolarData(data: InsertSolarData): Promise<SolarData>;
  
  // Location scores
  getTopLocations(limit?: number): Promise<LocationScore[]>;
  getLocationScore(h3Cell: string): Promise<LocationScore | undefined>;
  createOrUpdateLocationScore(score: InsertLocationScore): Promise<LocationScore>;
}

export class DatabaseStorage implements IStorage {
  // Outages
  async getActiveOutages(): Promise<Outage[]> {
    return await db.select()
      .from(schema.outages)
      .where(eq(schema.outages.status, "active"))
      .orderBy(desc(schema.outages.reportedAt));
  }

  async getOutagesByProvider(provider: string): Promise<Outage[]> {
    return await db.select()
      .from(schema.outages)
      .where(eq(schema.outages.provider, provider))
      .orderBy(desc(schema.outages.reportedAt));
  }

  async createOutage(outage: InsertOutage): Promise<Outage> {
    const result = await db.insert(schema.outages).values(outage).returning();
    return result[0];
  }

  async resolveOutage(id: string): Promise<void> {
    await db.update(schema.outages)
      .set({ 
        status: "resolved",
        resolvedAt: new Date()
      })
      .where(eq(schema.outages.id, id));
  }

  // Reliability metrics
  async getReliabilityMetrics(provider?: string, year?: number): Promise<ReliabilityMetric[]> {
    let query = db.select().from(schema.reliabilityMetrics);
    
    const conditions = [];
    if (provider) conditions.push(eq(schema.reliabilityMetrics.provider, provider));
    if (year) conditions.push(eq(schema.reliabilityMetrics.year, year));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(schema.reliabilityMetrics.year));
  }

  async createReliabilityMetric(metric: InsertReliabilityMetric): Promise<ReliabilityMetric> {
    const result = await db.insert(schema.reliabilityMetrics).values(metric).returning();
    return result[0];
  }

  // Social signals
  async getSocialSignalsByTown(town: string, hours: number = 24): Promise<SocialSignal[]> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db.select()
      .from(schema.socialSignals)
      .where(and(
        eq(schema.socialSignals.town, town),
        gte(schema.socialSignals.timestamp, cutoff)
      ))
      .orderBy(desc(schema.socialSignals.timestamp));
  }

  async getRecentSocialSignals(hours: number = 24): Promise<SocialSignal[]> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db.select()
      .from(schema.socialSignals)
      .where(gte(schema.socialSignals.timestamp, cutoff))
      .orderBy(desc(schema.socialSignals.timestamp));
  }

  async createSocialSignal(signal: InsertSocialSignal): Promise<SocialSignal> {
    const result = await db.insert(schema.socialSignals).values(signal).returning();
    return result[0];
  }

  // Solar data
  async getSolarData(lat: number, lon: number, radius: number = 0.01): Promise<SolarData[]> {
    return await db.select()
      .from(schema.solarData)
      .where(sql`
        (${schema.solarData.lat} - ${lat})^2 + (${schema.solarData.lon} - ${lon})^2 < ${radius * radius}
      `);
  }

  async getSolarDataByH3(h3Cell: string): Promise<SolarData | undefined> {
    const result = await db.select()
      .from(schema.solarData)
      .where(eq(schema.solarData.h3Cell, h3Cell))
      .limit(1);
    return result[0];
  }

  async createOrUpdateSolarData(data: InsertSolarData): Promise<SolarData> {
    const existing = data.h3Cell ? await this.getSolarDataByH3(data.h3Cell) : undefined;
    
    if (existing) {
      const result = await db.update(schema.solarData)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.solarData.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(schema.solarData).values(data).returning();
      return result[0];
    }
  }

  // Location scores
  async getTopLocations(limit: number = 100): Promise<LocationScore[]> {
    return await db.select()
      .from(schema.locationScores)
      .orderBy(desc(schema.locationScores.finalScore))
      .limit(limit);
  }

  async getLocationScore(h3Cell: string): Promise<LocationScore | undefined> {
    const result = await db.select()
      .from(schema.locationScores)
      .where(eq(schema.locationScores.h3Cell, h3Cell))
      .limit(1);
    return result[0];
  }

  async createOrUpdateLocationScore(score: InsertLocationScore): Promise<LocationScore> {
    const existing = await this.getLocationScore(score.h3Cell);
    
    if (existing) {
      const result = await db.update(schema.locationScores)
        .set({ ...score, updatedAt: new Date() })
        .where(eq(schema.locationScores.h3Cell, score.h3Cell))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(schema.locationScores).values(score).returning();
      return result[0];
    }
  }
}

export const storage = new DatabaseStorage();
