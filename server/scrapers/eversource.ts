import { BaseProvider, type ScraperResult } from "./base";
import type { InsertOutage } from "@shared/schema";

interface KubraCurrentState {
  stormcenterDeploymentId: string;
  data: {
    interval_generation_data: string;
    cluster_interval_generation_data: string;
  };
  datastatic?: Record<string, string>;
  updatedAt: number;
}

interface KubraSummaryResponse {
  summaryFileData: {
    totals: Array<{
      total_cust_a?: { val: number };
      total_outages?: number;
    }>;
    date_generated?: string;
  };
}

interface KubraClusterFile {
  file_data?: Array<{
    desc?: {
      n_out?: number;
      cust_a?: { val: number };
      etr?: string;
      cause?: string;
      cluster?: boolean;
    };
    geom?: {
      p?: string[];
      a?: string[];
    };
    source?: string;
  }>;
}

export class EversourceProvider extends BaseProvider {
  // Eversource MA uses Kubra StormCenter
  // Instance/View IDs from: https://outagemap.eversource.com/
  private static readonly KUBRA_INSTANCE_ID = "877fd1e9-4162-473f-b782-d8a53a85326b";
  private static readonly KUBRA_VIEW_ID = "a6cee9e4-312b-4b77-9913-2ae371eb860d";
  private static readonly KUBRA_BASE_URL = "https://kubra.io";

  private dataPath: string = "";
  private clusterPathPattern: string = "";
  private deploymentId: string = "";

  constructor() {
    super({
      name: "Eversource",
      baseUrl: EversourceProvider.KUBRA_BASE_URL,
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
        console.log("Eversource: Failed to get current state - API may be unavailable");
        return this.emptyResult();
      }

      this.dataPath = currentState.data.interval_generation_data;
      this.clusterPathPattern = currentState.data.cluster_interval_generation_data;
      this.deploymentId = currentState.stormcenterDeploymentId;

      console.log(`Eversource: Data path = ${this.dataPath}`);

      const summary = await this.fetchSummaryData();
      if (summary?.summaryFileData?.totals?.[0]) {
        const totals = summary.summaryFileData.totals[0];
        totalCustomersAffected = totals.total_cust_a?.val || 0;
        const totalOutages = totals.total_outages || 0;
        console.log(`Eversource: Summary shows ${totalCustomersAffected} customers affected, ${totalOutages} outages`);
      }

      // Get service area quadkeys from the state
      const quadkeys = await this.getServiceAreaQuadkeys(currentState);
      console.log(`Eversource: Scanning ${quadkeys.length} quadkeys...`);

      // Recursively fetch cluster data
      const clusterResults = await this.fetchAllClusters(quadkeys);
      
      for (const result of clusterResults) {
        if (result?.file_data) {
          const parsedOutages = this.parseClusterData(result);
          outages.push(...parsedOutages);
        }
      }

      if (outages.length === 0 && totalCustomersAffected > 0) {
        console.log(`Eversource: No cluster geometries, creating summary aggregate`);
        // Create a single summary outage centered on MA
        outages.push({
          provider: this.config.name,
          geometry: this.createPointGeometry(42.4072, -71.3824), // Boston area center
          customersAffected: totalCustomersAffected,
          status: "active",
          confidence: "summary_aggregate",
          metadata: {
            source: "kubra_summary",
            dataPath: this.dataPath,
          },
        });
      }

    } catch (error) {
      console.error("Eversource scraper error:", error);
    }

    console.log(`Eversource: Returning ${outages.length} outages (${totalCustomersAffected} total customers affected)`);

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
      const url = `${this.config.baseUrl}/stormcenter/api/v1/stormcenters/${EversourceProvider.KUBRA_INSTANCE_ID}/views/${EversourceProvider.KUBRA_VIEW_ID}/currentState?preview=false`;
      const response = await this.fetch(url);
      return await response.json();
    } catch (error) {
      console.error("Eversource: Failed to fetch current state:", error);
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
      console.error("Eversource: Failed to fetch summary data:", error);
      return null;
    }
  }

  private async getServiceAreaQuadkeys(state: KubraCurrentState): Promise<string[]> {
    // Generate Massachusetts quadkeys at zoom level 7
    // MA bounding box: 41.2 to 42.9 lat, -73.5 to -69.9 lng
    const quadkeys: string[] = [];
    const zoom = 7;

    // Calculate tile range for MA bounding box
    const minTileX = this.lngToTileX(-73.5, zoom);
    const maxTileX = this.lngToTileX(-69.9, zoom);
    const minTileY = this.latToTileY(42.9, zoom);
    const maxTileY = this.latToTileY(41.2, zoom);

    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        quadkeys.push(this.tileToQuadkey(x, y, zoom));
      }
    }

    return quadkeys;
  }

  private async fetchAllClusters(quadkeys: string[]): Promise<KubraClusterFile[]> {
    const results: KubraClusterFile[] = [];
    
    const batchSize = 10;
    for (let i = 0; i < quadkeys.length; i += batchSize) {
      const batch = quadkeys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(qk => this.fetchClusterData(qk).catch(() => null))
      );
      
      for (const result of batchResults) {
        if (result) results.push(result);
      }
    }
    
    return results;
  }

  private async fetchClusterData(quadkey: string): Promise<KubraClusterFile | null> {
    if (!this.clusterPathPattern) return null;

    try {
      // Kubra uses reversed last 3 digits for directory structure
      const qkh = quadkey.slice(-3).split('').reverse().join('');
      const clusterPath = this.clusterPathPattern
        .replace("{qkh}", qkh)
        .replace("{quadkey}", quadkey);
      
      const url = `${this.config.baseUrl}/${clusterPath}/public/cluster-1-1/${quadkey}.json`;
      const response = await fetch(url, {
        headers: { "User-Agent": "SackFinder/1.0" },
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  private parseClusterData(data: KubraClusterFile): InsertOutage[] {
    const outages: InsertOutage[] = [];

    if (!data.file_data) return outages;

    for (const item of data.file_data) {
      try {
        // Skip if this is a cluster indicator (need to recurse deeper)
        if (item.desc?.cluster) continue;

        const customersAffected = item.desc?.n_out || item.desc?.cust_a?.val || 0;
        if (customersAffected === 0) continue;

        let geometry: any;

        if (item.geom?.a && item.geom.a.length > 0) {
          // Polygon encoded as polyline
          geometry = this.parsePolylinePolygon(item.geom.a[0]);
        } else if (item.geom?.p && item.geom.p.length > 0) {
          // Point encoded as polyline
          geometry = this.parsePolylinePoint(item.geom.p[0]);
        } else {
          // Default to MA center
          geometry = this.createPointGeometry(42.4072, -71.3824);
        }

        outages.push({
          provider: this.config.name,
          geometry,
          customersAffected,
          status: "active",
          confidence: "kubra_cluster",
          metadata: {
            cause: item.desc?.cause,
            etr: item.desc?.etr,
            source: item.source,
          },
        });
      } catch (error) {
        console.error("Eversource: Error parsing outage item:", error);
      }
    }

    return outages;
  }

  private parsePolylinePolygon(encoded: string): any {
    const points = this.decodePolyline(encoded);
    const coords = points.map(([lat, lng]) => [lng, lat]);
    
    // Close the polygon if needed
    if (coords.length > 0 && 
        (coords[0][0] !== coords[coords.length - 1][0] || 
         coords[0][1] !== coords[coords.length - 1][1])) {
      coords.push(coords[0]);
    }

    return {
      type: "Polygon",
      coordinates: [coords],
    };
  }

  private parsePolylinePoint(encoded: string): any {
    const points = this.decodePolyline(encoded);
    if (points.length > 0) {
      const [lat, lng] = points[0];
      return this.createPointGeometry(lat, lng);
    }
    return this.createPointGeometry(42.4072, -71.3824);
  }

  private decodePolyline(encoded: string): [number, number][] {
    // Google's polyline decoding algorithm
    const points: [number, number][] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lat += (result & 1) ? ~(result >> 1) : (result >> 1);

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lng += (result & 1) ? ~(result >> 1) : (result >> 1);

      points.push([lat / 1e5, lng / 1e5]);
    }

    return points;
  }

  private lngToTileX(lng: number, zoom: number): number {
    return Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
  }

  private latToTileY(lat: number, zoom: number): number {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  }

  private tileToQuadkey(x: number, y: number, zoom: number): string {
    let quadkey = "";
    for (let i = zoom; i > 0; i--) {
      let digit = 0;
      const mask = 1 << (i - 1);
      if ((x & mask) !== 0) digit += 1;
      if ((y & mask) !== 0) digit += 2;
      quadkey += digit;
    }
    return quadkey;
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
