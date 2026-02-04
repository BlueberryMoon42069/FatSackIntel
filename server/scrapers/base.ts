import type { InsertOutage } from "@shared/schema";

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  updateInterval: number; // milliseconds
  enabled: boolean;
}

export interface ScraperResult {
  outages: InsertOutage[];
  metadata: {
    scrapedAt: Date;
    provider: string;
    totalCustomersAffected: number;
  };
}

export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract scrape(): Promise<ScraperResult>;

  protected async fetch(url: string, options?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "OutageIntelMA/1.0",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  protected createOutageGeometry(coordinates: number[][]): any {
    // Convert coordinates to GeoJSON polygon
    return {
      type: "Polygon",
      coordinates: [coordinates],
    };
  }

  protected createPointGeometry(lat: number, lng: number): any {
    return {
      type: "Point",
      coordinates: [lng, lat],
    };
  }
}
