import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, json, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Outage geometry from providers (MEMA, utilities)
export const outages = pgTable("outages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 50 }).notNull(),
  geometry: json("geometry").notNull(), // GeoJSON geometry
  customersAffected: integer("customers_affected"),
  status: varchar("status", { length: 20 }).default("active"),
  confidence: varchar("confidence", { length: 50 }),
  reportedAt: timestamp("reported_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  metadata: json("metadata"), // Additional provider-specific data
}, (table) => ({
  providerIdx: index("outages_provider_idx").on(table.provider),
  reportedAtIdx: index("outages_reported_at_idx").on(table.reportedAt),
}));

export const insertOutageSchema = createInsertSchema(outages).omit({
  id: true,
  reportedAt: true,
});

export type InsertOutage = z.infer<typeof insertOutageSchema>;
export type Outage = typeof outages.$inferSelect;

// Historical reliability metrics (SAIDI/SAIFI/CAIDI)
export const reliabilityMetrics = pgTable("reliability_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 50 }).notNull(),
  year: integer("year").notNull(),
  territory: varchar("territory", { length: 50 }),
  saidi: real("saidi"), // System Average Interruption Duration Index (minutes)
  saifi: real("saifi"), // System Average Interruption Frequency Index
  caidi: real("caidi"), // Customer Average Interruption Duration Index (minutes)
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  providerYearIdx: index("reliability_provider_year_idx").on(table.provider, table.year),
}));

export const insertReliabilityMetricSchema = createInsertSchema(reliabilityMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertReliabilityMetric = z.infer<typeof insertReliabilityMetricSchema>;
export type ReliabilityMetric = typeof reliabilityMetrics.$inferSelect;

// Social signals from public Facebook pages/groups
export const socialSignals = pgTable("social_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // Page/group name
  town: varchar("town", { length: 100 }).notNull(),
  text: text("text").notNull(),
  category: varchar("category", { length: 20 }).notNull(), // outage | billing | intent | general
  urgency: real("urgency").notNull(), // 0-1 score
  keywords: json("keywords").$type<string[]>(),
  timestamp: timestamp("timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  townIdx: index("social_town_idx").on(table.town),
  timestampIdx: index("social_timestamp_idx").on(table.timestamp),
  categoryIdx: index("social_category_idx").on(table.category),
}));

export const insertSocialSignalSchema = createInsertSchema(socialSignals).omit({
  id: true,
  createdAt: true,
});

export type InsertSocialSignal = z.infer<typeof insertSocialSignalSchema>;
export type SocialSignal = typeof socialSignals.$inferSelect;

// Solar potential data (roof geometry + NREL)
export const solarData = pgTable("solar_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  address: text("address"),
  h3Cell: varchar("h3_cell", { length: 20 }),
  roofTilt: real("roof_tilt"), // degrees
  roofAzimuth: real("roof_azimuth"), // degrees (0=north, 180=south)
  shadingFactor: real("shading_factor"), // 0-1
  roofArea: real("roof_area"), // sq meters
  annualGHI: real("annual_ghi"), // kWh/m²/day
  kwhPerKw: real("kwh_per_kw"), // Annual production per kW installed
  solarScore: real("solar_score"), // 0-100 composite score
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  h3CellIdx: index("solar_h3_idx").on(table.h3Cell),
  coordsIdx: index("solar_coords_idx").on(table.lat, table.lon),
}));

export const insertSolarDataSchema = createInsertSchema(solarData).omit({
  id: true,
  updatedAt: true,
});

export type InsertSolarData = z.infer<typeof insertSolarDataSchema>;
export type SolarData = typeof solarData.$inferSelect;

// Composite location scores (combines all signals)
export const locationScores = pgTable("location_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  h3Cell: varchar("h3_cell", { length: 20 }).notNull().unique(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  
  // Component scores
  outageScore: real("outage_score").notNull(), // 0-1
  socialScore: real("social_score").notNull(), // 0-1
  solarScore: real("solar_score").notNull(), // 0-1
  
  // Composite final score
  finalScore: real("final_score").notNull(), // 0-1 weighted average
  
  // Supporting data
  outageEvents24h: integer("outage_events_24h").default(0),
  socialMentions24h: integer("social_mentions_24h").default(0),
  electricHeatShare: real("electric_heat_share"),
  noGasShare: real("no_gas_share"),
  
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  scoreIdx: index("location_score_idx").on(table.finalScore),
}));

export const insertLocationScoreSchema = createInsertSchema(locationScores).omit({
  id: true,
  updatedAt: true,
});

export type InsertLocationScore = z.infer<typeof insertLocationScoreSchema>;
export type LocationScore = typeof locationScores.$inferSelect;
