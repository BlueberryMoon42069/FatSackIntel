import { BaseProvider, type ScraperResult } from "./base";
import type { InsertOutage } from "@shared/schema";

interface KubraCurrentState {
  stormcenterDeploymentId: string;
  data: {
    interval_generation_data: string;
    cluster_interval_generation_data: string;
  };
  updatedAt: number;
}

interface KubraSummaryResponse {
  summaryFileData: {
    totals: Array<{
      total_cust_a?: { val: number };
      total_outages?: number;
    }>;
  };
}

export class UnitilProvider extends BaseProvider {
  // Unitil uses Kubra StormCenter - IDs need to be discovered from:
  // https://outage-map.unitil.com/ via browser DevTools Network tab
  // TODO: Update these with actual Unitil instance/view IDs
  private static readonly KUBRA_INSTANCE_ID = ""; // Needs discovery
  private static readonly KUBRA_VIEW_ID = ""; // Needs discovery
  private static readonly KUBRA_BASE_URL = "https://kubra.io";

  private dataPath: string = "";
  private clusterPathPattern: string = "";

  constructor() {
    super({
      name: "Unitil",
      baseUrl: UnitilProvider.KUBRA_BASE_URL,
      updateInterval: 5 * 60 * 1000,
      enabled: true,
    });
  }

  async scrape(): Promise<ScraperResult> {
    // Check if properly configured
    if (!UnitilProvider.KUBRA_INSTANCE_ID || !UnitilProvider.KUBRA_VIEW_ID) {
      console.log("Unitil: API not configured - instance/view IDs need to be discovered from https://outage-map.unitil.com/");
      return this.emptyResult();
    }

    const outages: InsertOutage[] = [];
    let totalCustomersAffected = 0;

    try {
      const currentState = await this.fetchCurrentState();
      if (!currentState) {
        console.log("Unitil: Failed to get current state");
        return this.emptyResult();
      }

      this.dataPath = currentState.data.interval_generation_data;
      this.clusterPathPattern = currentState.data.cluster_interval_generation_data;

      console.log(`Unitil: Data path = ${this.dataPath}`);

      const summary = await this.fetchSummaryData();
      if (summary?.summaryFileData?.totals?.[0]) {
        const totals = summary.summaryFileData.totals[0];
        totalCustomersAffected = totals.total_cust_a?.val || 0;
        const totalOutages = totals.total_outages || 0;
        console.log(`Unitil: Summary shows ${totalCustomersAffected} customers affected, ${totalOutages} outages`);
      }

      // Similar cluster fetching logic as other Kubra providers
      // Would fetch quadkeys for Unitil's North Worcester County service area

      if (totalCustomersAffected > 0) {
        // Create summary outage centered on Unitil MA service area (Fitchburg/Lunenburg area)
        outages.push({
          provider: this.config.name,
          geometry: this.createPointGeometry(42.5834, -71.8023),
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
      console.error("Unitil scraper error:", error);
    }

    console.log(`Unitil: Returning ${outages.length} outages (${totalCustomersAffected} total customers affected)`);

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
      const url = `${this.config.baseUrl}/stormcenter/api/v1/stormcenters/${UnitilProvider.KUBRA_INSTANCE_ID}/views/${UnitilProvider.KUBRA_VIEW_ID}/currentState?preview=false`;
      const response = await this.fetch(url);
      return await response.json();
    } catch (error) {
      console.error("Unitil: Failed to fetch current state:", error);
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
      console.error("Unitil: Failed to fetch summary data:", error);
      return null;
    }
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
