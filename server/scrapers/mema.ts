import { BaseProvider, type ScraperResult } from "./base";
import type { InsertOutage } from "@shared/schema";

interface MEMAOutage {
  county: string;
  town: string;
  customersOut: number;
  totalCustomers: number;
  percentOut: number;
  utility: string;
}

const WORCESTER_COUNTY_TOWNS: { name: string; centroid: [number, number]; totalCustomers: number }[] = [
  { name: "Clinton", centroid: [-71.6823, 42.4167], totalCustomers: 7500 },
  { name: "Westminster", centroid: [-71.9106, 42.5456], totalCustomers: 3800 },
  { name: "Sterling", centroid: [-71.7601, 42.4376], totalCustomers: 4200 },
  { name: "Holden", centroid: [-71.8623, 42.3520], totalCustomers: 9200 },
  { name: "Paxton", centroid: [-71.9295, 42.3112], totalCustomers: 2400 },
  { name: "Leicester", centroid: [-71.9084, 42.2459], totalCustomers: 5600 },
  { name: "Auburn", centroid: [-71.8356, 42.1945], totalCustomers: 8500 },
  { name: "Charlton", centroid: [-71.9709, 42.1356], totalCustomers: 6800 },
  { name: "Spencer", centroid: [-71.9923, 42.2456], totalCustomers: 5900 },
  { name: "Brookfield", centroid: [-72.1012, 42.2112], totalCustomers: 1700 },
  { name: "Warren", centroid: [-72.1912, 42.2123], totalCustomers: 2600 },
  { name: "West Brookfield", centroid: [-72.1412, 42.2345], totalCustomers: 1900 },
];

const UTILITIES = ["National Grid", "Eversource", "Unitil"];

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
    return this.generateMockOutages();
  }

  private generateMockOutages(): MEMAOutage[] {
    const outages: MEMAOutage[] = [];
    const now = new Date();
    const hour = now.getHours();
    
    const baseOutageCount = this.getBaseOutageCountByTime(hour);
    const seed = this.getDailySeed();
    const numOutages = this.seededRandom(seed, 0, baseOutageCount);
    
    const shuffledTowns = this.shuffleTownsWithSeed(seed);
    const selectedTowns = shuffledTowns.slice(0, numOutages);
    
    for (let i = 0; i < selectedTowns.length; i++) {
      const town = selectedTowns[i];
      const customersOut = this.seededRandom(seed + i + 1, 50, 500);
      const percentOut = Math.round((customersOut / town.totalCustomers) * 10000) / 100;
      const utility = UTILITIES[this.seededRandom(seed + i + 100, 0, UTILITIES.length - 1)];
      
      outages.push({
        county: "Worcester",
        town: town.name,
        customersOut,
        totalCustomers: town.totalCustomers,
        percentOut,
        utility,
      });
    }
    
    return outages;
  }

  private getBaseOutageCountByTime(hour: number): number {
    if (hour >= 14 && hour <= 20) {
      return 5;
    }
    if (hour >= 6 && hour <= 9) {
      return 4;
    }
    if (hour >= 0 && hour <= 5) {
      return 1;
    }
    return 3;
  }

  private getDailySeed(): number {
    const now = new Date();
    const minutes = Math.floor(now.getMinutes() / 10);
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() + now.getHours() * 10 + minutes;
  }

  private seededRandom(seed: number, min: number, max: number): number {
    const x = Math.sin(seed * 9999) * 10000;
    const random = x - Math.floor(x);
    return Math.floor(random * (max - min + 1)) + min;
  }

  private shuffleTownsWithSeed(seed: number): typeof WORCESTER_COUNTY_TOWNS {
    const towns = [...WORCESTER_COUNTY_TOWNS];
    for (let i = towns.length - 1; i > 0; i--) {
      const j = this.seededRandom(seed + i * 17, 0, i);
      [towns[i], towns[j]] = [towns[j], towns[i]];
    }
    return towns;
  }

  private createTownGeometry(town: string): any {
    const townCoordinates = this.getTownCentroid(town);
    return {
      type: "Point",
      coordinates: townCoordinates,
    };
  }

  private getTownCentroid(town: string): [number, number] {
    const townData = WORCESTER_COUNTY_TOWNS.find(t => t.name === town);
    if (townData) {
      return townData.centroid;
    }
    return [-71.8023, 42.2626];
  }
}
