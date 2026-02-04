import { BaseProvider, type ScraperResult, type ProviderConfig } from "./base";
import type { InsertOutage } from "@shared/schema";
import { getMassachusettsQuadKeys, quadKeyToLatLng } from "../utils/quadkey";

interface KubraCurrentState {
  data: {
    interval_generation_data: string;
    cluster_interval_generation_data: string;
  };
  updatedAt: number;
}

interface KubraSummaryResponse {
  fileTitle: string;
  summaryFileData: {
    totals: Array<{
      total_cust_a: { val: number };
      total_percent_cust_a: { val: number };
      total_cust_s: number;
      total_outages: number;
    }>;
    date_generated: string;
  };
}

interface KubraClusterData {
  file_data?: {
    curr_custs_aff?: number;
    areas?: Array<{
      clusters?: Array<{
        id: string;
        geom?: {
          p?: string;
          a?: [number, number][];
        };
        n_out: number;
        start_time?: string;
        desc?: {
          n_out?: number;
          cust_a?: { val: number };
          etr?: string;
          cause?: string;
        };
      }>;
    }>;
  };
}

export class NationalGridProvider extends BaseProvider {
  private static readonly KUBRA_INSTANCE_ID = "9cb2e5b7-d321-4575-a552-4ae7078cbc31";
  private static readonly KUBRA_VIEW_ID = "ec79df5b-2c54-4fb9-a86a-b20775678236";
  private static readonly KUBRA_BASE_URL = "https://kubra.io";

  private dataPath: string = "";
  private clusterPathPattern: string = "";

  constructor() {
    super({
      name: "National Grid",
      baseUrl: NationalGridProvider.KUBRA_BASE_URL,
      updateInterval: 5 * 60 * 1000,
      enabled: true,
    });
  }

  async scrape(): Promise<ScraperResult> {
    const outages: InsertOutage[] = [];
    let totalCustomersAffected = 0;

    try {
      const currentState = await this.fetchCurrentState();
      if (!currentState) {
        console.error("National Grid: Failed to get current state");
        return this.emptyResult();
      }

      this.dataPath = currentState.data.interval_generation_data;
      this.clusterPathPattern = currentState.data.cluster_interval_generation_data;

      console.log(`National Grid: Data path = ${this.dataPath}`);
      console.log(`National Grid: Cluster pattern = ${this.clusterPathPattern}`);

      const summary = await this.fetchSummaryData();
      if (summary) {
        const totals = summary.summaryFileData?.totals?.[0];
        if (totals) {
          totalCustomersAffected = totals.total_cust_a?.val || 0;
          console.log(`National Grid: Summary shows ${totalCustomersAffected} customers affected, ${totals.total_outages || 0} outages`);
        }
      }

      const quadKeys = getMassachusettsQuadKeys(8);
      console.log(`National Grid: Scanning ${quadKeys.length} quadkeys at zoom 8...`);

      const batchSize = 5;
      for (let i = 0; i < quadKeys.length; i += batchSize) {
        const batch = quadKeys.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(qk => this.fetchClusterData(qk).catch(() => null))
        );

        for (let j = 0; j < results.length; j++) {
          const clusterData = results[j];
          if (clusterData?.file_data?.areas) {
            const parsedOutages = this.parseClusterData(clusterData, batch[j]);
            outages.push(...parsedOutages);
          }
        }
      }

      if (outages.length === 0 && totalCustomersAffected > 0) {
        console.log(`National Grid: No cluster geometries found, creating summary-based outage`);
        const centerLat = (41.2369 + 42.8867) / 2;
        const centerLng = (-73.5081 + -69.9286) / 2;

        outages.push({
          provider: this.config.name,
          geometry: this.createPointGeometry(centerLat, centerLng),
          customersAffected: totalCustomersAffected,
          status: "active",
          confidence: "summary_aggregate",
          metadata: {
            source: "kubra_summary",
            dataPath: this.dataPath,
            generatedAt: summary?.summaryFileData?.date_generated,
          },
        });
      }

    } catch (error) {
      console.error("National Grid scraper error:", error);
    }

    console.log(`National Grid: Returning ${outages.length} outages (${totalCustomersAffected} customers affected)`);

    return {
      outages,
      metadata: {
        scrapedAt: new Date(),
        provider: this.config.name,
        totalCustomersAffected,
      },
    };
  }

  private async fetchCurrentState(): Promise<KubraCurrentState | null> {
    try {
      const url = `${this.config.baseUrl}/stormcenter/api/v1/stormcenters/${NationalGridProvider.KUBRA_INSTANCE_ID}/views/${NationalGridProvider.KUBRA_VIEW_ID}/currentState?preview=false`;
      const response = await this.fetch(url);
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch current state:", error);
      return null;
    }
  }

  private async fetchSummaryData(): Promise<KubraSummaryResponse | null> {
    if (!this.dataPath) return null;

    try {
      const url = `${this.config.baseUrl}/${this.dataPath}/public/summary-1/data.json`;
      const response = await this.fetch(url);
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch summary data:", error);
      return null;
    }
  }

  private async fetchClusterData(quadKey: string): Promise<KubraClusterData | null> {
    if (!this.clusterPathPattern) return null;

    try {
      const clusterPath = this.clusterPathPattern.replace("{qkh}", quadKey);
      const url = `${this.config.baseUrl}/${clusterPath}/public/cluster-1-1.json`;
      const response = await fetch(url, {
        headers: { "User-Agent": "OutageIntelMA/1.0" },
      });

      if (!response.ok) return null;

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  private parseClusterData(data: KubraClusterData, quadKey: string): InsertOutage[] {
    const outages: InsertOutage[] = [];

    if (!data.file_data?.areas) return outages;

    for (const area of data.file_data.areas) {
      if (!area.clusters) continue;

      for (const cluster of area.clusters) {
        try {
          let geometry: any;

          if (cluster.geom?.p) {
            geometry = this.parseKubraPolygon(cluster.geom.p);
          } else if (cluster.geom?.a && cluster.geom.a.length > 0) {
            geometry = this.parseKubraCoordArray(cluster.geom.a);
          } else {
            const center = quadKeyToLatLng(quadKey);
            geometry = this.createPointGeometry(center.lat, center.lng);
          }

          const customersAffected = cluster.n_out || cluster.desc?.cust_a?.val || 0;

          outages.push({
            provider: this.config.name,
            geometry,
            customersAffected,
            status: "active",
            confidence: "kubra_cluster",
            metadata: {
              clusterId: cluster.id,
              quadKey,
              startTime: cluster.start_time,
              cause: cluster.desc?.cause,
              etr: cluster.desc?.etr,
            },
          });
        } catch (error) {
          console.error("Error parsing cluster:", error);
        }
      }
    }

    return outages;
  }

  private parseKubraPolygon(polyString: string): any {
    const points = polyString.split(";").map(point => {
      const [lat, lng] = point.split(",").map(Number);
      return [lng, lat];
    });

    if (points.length > 0 && (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1])) {
      points.push(points[0]);
    }

    return {
      type: "Polygon",
      coordinates: [points],
    };
  }

  private parseKubraCoordArray(coords: [number, number][]): any {
    const points = coords.map(([lat, lng]) => [lng, lat]);

    if (points.length > 0 && (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1])) {
      points.push(points[0]);
    }

    return {
      type: "Polygon",
      coordinates: [points],
    };
  }

  private emptyResult(): ScraperResult {
    return {
      outages: [],
      metadata: {
        scrapedAt: new Date(),
        provider: this.config.name,
        totalCustomersAffected: 0,
      },
    };
  }
}
