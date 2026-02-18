import { BaseProvider, type ScraperResult } from "./base";
import type { InsertOutage } from "@shared/schema";
import { getTownCoords } from "../utils/towns";

interface MEMAOutage {
  county: string;
  town: string;
  customersOut: number;
  totalCustomers: number;
  percentOut: number;
  utility: string;
}

const MEMA_ENDPOINTS = [
  "https://mema.mapsonline.net/api/v1/outages?state=MA&format=json",
  "https://api.mema.mass.gov/api/v1/outages",
  "https://mema.mapsonline.net/api/outages?state=MA",
];

export class MEMAProvider extends BaseProvider {
  constructor() {
    super({
      name: "MA MEMA",
      baseUrl: "https://mema.mapsonline.net",
      updateInterval: 10 * 60 * 1000, // 10 minutes
      enabled: true,
    });
  }

  async scrape(): Promise<ScraperResult> {
    const outages: InsertOutage[] = [];
    let totalCustomersAffected = 0;

    try {
      const data = await this.fetchMEMAData();

      if (data && Array.isArray(data)) {
        for (const item of data) {
          if (item.customersOut > 0) {
            outages.push({
              provider: "MA MEMA",
              geometry: this.createTownGeometry(item.town),
              customersAffected: item.customersOut,
              status: "active",
              confidence: "town_level",
              metadata: {
                county: item.county,
                town: item.town,
                utility: item.utility,
                totalCustomers: item.totalCustomers,
                percentOut: item.percentOut,
              },
            });
            totalCustomersAffected += item.customersOut;
          }
        }
      }
    } catch (error) {
      console.error("MA MEMA scraper error:", error);
    }

    return {
      outages,
      metadata: {
        scrapedAt: new Date(),
        provider: this.config.name,
        totalCustomersAffected,
      },
    };
  }

  private async fetchMEMAData(): Promise<MEMAOutage[]> {
    for (const url of MEMA_ENDPOINTS) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; SackFinder/1.0; MA outage monitor)",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.log(`MEMA endpoint ${url} returned ${response.status}, trying next`);
          continue;
        }

        const raw = await response.json();
        const normalized = this.normalizeResponse(raw);

        if (normalized.length > 0) {
          console.log(`MEMA: Retrieved ${normalized.length} outage records from ${url}`);
          return normalized;
        }

        console.log(`MEMA: Endpoint ${url} returned no outages`);
        return [];
      } catch (error: any) {
        console.log(`MEMA endpoint ${url} failed: ${error?.message || error}`);
      }
    }

    console.log("MEMA: All endpoints unavailable — no live MEMA data");
    return [];
  }

  private normalizeResponse(raw: any): MEMAOutage[] {
    // Handle GeoJSON FeatureCollection format
    if (raw?.type === "FeatureCollection" && Array.isArray(raw?.features)) {
      return raw.features
        .map((f: any) => ({
          county: f.properties?.county || f.properties?.County || "",
          town: f.properties?.town || f.properties?.Town || f.properties?.municipality || "",
          customersOut: Number(f.properties?.customersOut || f.properties?.customers_out || 0),
          totalCustomers: Number(f.properties?.totalCustomers || f.properties?.total_customers || 0),
          percentOut: Number(f.properties?.percentOut || f.properties?.percent_out || 0),
          utility: f.properties?.utility || f.properties?.Utility || "Unknown",
        }))
        .filter((o: MEMAOutage) => o.town);
    }

    // Handle array format
    if (Array.isArray(raw)) {
      return raw
        .map((item: any) => ({
          county: item.county || item.County || "",
          town: item.town || item.Town || item.municipality || item.Municipality || "",
          customersOut: Number(item.customersOut || item.customers_out || item.CustomersOut || 0),
          totalCustomers: Number(item.totalCustomers || item.total_customers || item.TotalCustomers || 0),
          percentOut: Number(item.percentOut || item.percent_out || item.PercentOut || 0),
          utility: item.utility || item.Utility || item.provider || "Unknown",
        }))
        .filter((o: MEMAOutage) => o.town);
    }

    // Handle nested data object
    if (raw?.data && Array.isArray(raw.data)) {
      return this.normalizeResponse(raw.data);
    }

    return [];
  }

  private createTownGeometry(town: string): any {
    const coords = getTownCoords(town);
    if (coords) {
      return { type: "Point", coordinates: coords };
    }
    // Fallback to MA geographic center
    return { type: "Point", coordinates: [-71.8023, 42.2626] };
  }
}
