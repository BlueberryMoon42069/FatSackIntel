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
  HistoricalOutage,
  InsertHistoricalOutage,
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

  // Historical outages
  private buildHistoricalConditions(filters?: {
    town?: string;
    street?: string;
    utility?: string;
    year?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    const conditions = [];

    if (filters?.town) {
      conditions.push(sql`LOWER(${schema.historicalOutages.town}) LIKE LOWER(${'%' + filters.town + '%'})`);
    }
    if (filters?.street) {
      conditions.push(sql`LOWER(${schema.historicalOutages.street}) LIKE LOWER(${'%' + filters.street + '%'})`);
    }
    if (filters?.utility) {
      conditions.push(eq(schema.historicalOutages.utility, filters.utility));
    }
    if (filters?.year) {
      conditions.push(eq(schema.historicalOutages.year, filters.year));
    }
    if (filters?.startDate) {
      conditions.push(gte(schema.historicalOutages.incidentStart, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(sql`${schema.historicalOutages.incidentStart} <= ${filters.endDate}`);
    }

    return conditions;
  }

  async getHistoricalOutages(filters?: {
    town?: string;
    street?: string;
    utility?: string;
    year?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<HistoricalOutage[]> {
    const conditions = this.buildHistoricalConditions(filters);

    const baseQuery = conditions.length > 0
      ? db.select().from(schema.historicalOutages).where(and(...conditions))
      : db.select().from(schema.historicalOutages);

    return await (baseQuery as any)
      .orderBy(desc(schema.historicalOutages.incidentStart))
      .limit(filters?.limit || 1000)
      .offset(filters?.offset || 0);
  }

  async getHistoricalOutageCount(filters?: {
    town?: string;
    street?: string;
    utility?: string;
    year?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    const conditions = this.buildHistoricalConditions(filters);

    const baseQuery = conditions.length > 0
      ? db.select({ count: sql<number>`count(*)` }).from(schema.historicalOutages).where(and(...conditions))
      : db.select({ count: sql<number>`count(*)` }).from(schema.historicalOutages);

    const result = await baseQuery;
    return Number(result[0]?.count || 0);
  }

  async createHistoricalOutage(outage: InsertHistoricalOutage): Promise<HistoricalOutage> {
    const result = await db.insert(schema.historicalOutages).values(outage).returning();
    return result[0];
  }

  async createHistoricalOutagesBatch(outages: InsertHistoricalOutage[]): Promise<number> {
    if (outages.length === 0) return 0;
    
    // Insert in batches of 100 for performance
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < outages.length; i += batchSize) {
      const batch = outages.slice(i, i + batchSize);
      await db.insert(schema.historicalOutages).values(batch);
      inserted += batch.length;
    }
    
    return inserted;
  }

  async getHistoricalOutageStats(): Promise<{
    totalRecords: number;
    utilities: string[];
    years: number[];
    topTowns: { town: string; count: number }[];
  }> {
    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(schema.historicalOutages);
    
    const utilitiesResult = await db.selectDistinct({ utility: schema.historicalOutages.utility })
      .from(schema.historicalOutages);
    
    const yearsResult = await db.selectDistinct({ year: schema.historicalOutages.year })
      .from(schema.historicalOutages)
      .orderBy(desc(schema.historicalOutages.year));
    
    const topTownsResult = await db.select({
      town: schema.historicalOutages.town,
      count: sql<number>`count(*)`,
    })
      .from(schema.historicalOutages)
      .groupBy(schema.historicalOutages.town)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    
    return {
      totalRecords: totalResult[0]?.count || 0,
      utilities: utilitiesResult.map(r => r.utility).filter(Boolean) as string[],
      years: yearsResult.map(r => r.year).filter(Boolean) as number[],
      topTowns: topTownsResult.map(r => ({ town: r.town, count: Number(r.count) })),
    };
  }

  async deleteHistoricalOutagesByUtilityYear(utility: string, year: number): Promise<number> {
    const result = await db.delete(schema.historicalOutages)
      .where(and(
        eq(schema.historicalOutages.utility, utility),
        eq(schema.historicalOutages.year, year)
      ))
      .returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();
