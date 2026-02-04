import { BaseProvider, type ScraperResult, type ProviderConfig } from "./base";
import type { InsertOutage } from "@shared/schema";
import { getMassachusettsQuadKeys, quadKeyToLatLng } from "../utils/quadkey";

interface KubraCluster {
  id: string;
  geom: {
    p: string; // polygon coordinates as string
  };
  n_out: number; // customers affected
  start_time?: string;
  desc?: string;
}

interface KubraResponse {
  file_data: {
    curr_custs_aff: number;
    areas?: {
      clusters?: KubraCluster[];
    }[];
  };
}

export class NationalGridProvider extends BaseProvider {
  private instanceId: string = "";

  constructor() {
    super({
      name: "National Grid",
      baseUrl: "https://outagemap.ngrid.com",
      updateInterval: 5 * 60 * 1000, // 5 minutes
      enabled: true,
    });
  }

  async scrape(): Promise<ScraperResult> {
    const outages: InsertOutage[] = [];
    let totalCustomersAffected = 0;

    try {
      // Step 1: Get instance ID
      await this.getInstanceId();

      // Step 2: Get Massachusetts quadkeys (zoom level 12)
      const quadKeys = getMassachusettsQuadKeys(12);

      // Step 3: Fetch data for each quadkey
      for (const quadKey of quadKeys.slice(0, 10)) { // Limit for testing
        try {
          const clusterData = await this.fetchQuadKeyData(quadKey);
          
          if (clusterData) {
            const parsedOutages = this.parseKubraData(clusterData);
            outages.push(...parsedOutages);
            totalCustomersAffected += parsedOutages.reduce((sum, o) => sum + (o.customersAffected || 0), 0);
          }
        } catch (error) {
          console.error(`Error fetching quadkey ${quadKey}:`, error);
        }
      }
    } catch (error) {
      console.error("National Grid scraper error:", error);
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

  private async getInstanceId(): Promise<void> {
    try {
      const response = await this.fetch(`${this.config.baseUrl}/api/state/getState`);
      const data = await response.json();
      this.instanceId = data.data?.directory?.data_dir || "";
    } catch (error) {
      console.error("Failed to get instance ID:", error);
      this.instanceId = "";
    }
  }

  private async fetchQuadKeyData(quadKey: string): Promise<KubraResponse | null> {
    if (!this.instanceId) {
      return null;
    }

    try {
      const url = `${this.config.baseUrl}/data/${this.instanceId}/public/summary-1/data.json?quadkey=${quadKey}`;
      const response = await this.fetch(url);
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  private parseKubraData(data: KubraResponse): InsertOutage[] {
    const outages: InsertOutage[] = [];

    if (!data.file_data?.areas) {
      return outages;
    }

    for (const area of data.file_data.areas) {
      if (!area.clusters) continue;

      for (const cluster of area.clusters) {
        try {
          const geometry = this.parseKubraGeometry(cluster.geom.p);
          
          outages.push({
            provider: this.config.name,
            geometry,
            customersAffected: cluster.n_out,
            status: "active",
            confidence: "kubra_cluster",
            metadata: {
              clusterId: cluster.id,
              startTime: cluster.start_time,
              description: cluster.desc,
            },
          });
        } catch (error) {
          console.error("Error parsing cluster:", error);
        }
      }
    }

    return outages;
  }

  private parseKubraGeometry(polyString: string): any {
    // Kubra format: "lat1,lng1;lat2,lng2;lat3,lng3"
    const points = polyString.split(";").map(point => {
      const [lat, lng] = point.split(",").map(Number);
      return [lng, lat]; // GeoJSON uses [lng, lat]
    });

    // Close the polygon
    if (points.length > 0) {
      points.push(points[0]);
    }

    return {
      type: "Polygon",
      coordinates: [points],
    };
  }
}
