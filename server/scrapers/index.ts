import { NationalGridProvider } from "./national-grid";
import { EversourceProvider } from "./eversource";
import { UnitilProvider } from "./unitil";
import { MEMAProvider } from "./mema";
import type { BaseProvider } from "./base";
import { storage } from "../storage";

export class ProviderManager {
  private providers: Map<string, BaseProvider>;
  private intervals: Map<string, NodeJS.Timeout>;

  constructor() {
    this.providers = new Map();
    this.intervals = new Map();
    
    // Register live outage data providers - real Kubra API scrapers
    this.providers.set("national-grid", new NationalGridProvider());
    this.providers.set("eversource", new EversourceProvider());
    this.providers.set("unitil", new UnitilProvider());
    // MEMA returns empty until real API is configured
    this.providers.set("mema", new MEMAProvider());
  }

  async scrapeProvider(providerKey: string): Promise<void> {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(`Provider ${providerKey} not found`);
    }

    console.log(`Scraping ${providerKey}...`);
    const result = await provider.scrape();
    
    console.log(`${providerKey}: Found ${result.outages.length} outages (${result.metadata.totalCustomersAffected} customers affected)`);

    // Store outages in database
    for (const outage of result.outages) {
      try {
        await storage.createOutage(outage);
      } catch (error) {
        console.error(`Error storing outage:`, error);
      }
    }
  }

  async scrapeAll(): Promise<void> {
    const keys = Array.from(this.providers.keys());
    const promises = keys.map(key => 
      this.scrapeProvider(key).catch(error => {
        console.error(`Error scraping ${key}:`, error);
      })
    );
    
    await Promise.all(promises);
  }

  startAutoScraping(): void {
    console.log("Starting auto-scraping for all providers...");
    
    const entries = Array.from(this.providers.entries());
    for (const [key, provider] of entries) {
      // Initial scrape
      this.scrapeProvider(key).catch(error => {
        console.error(`Initial scrape failed for ${key}:`, error);
      });

      // Set up interval
      const config = (provider as any).config;
      if (config.enabled) {
        const interval = setInterval(() => {
          this.scrapeProvider(key).catch(error => {
            console.error(`Scheduled scrape failed for ${key}:`, error);
          });
        }, config.updateInterval);
        
        this.intervals.set(key, interval);
      }
    }
  }

  stopAutoScraping(): void {
    console.log("Stopping auto-scraping...");
    const intervals = Array.from(this.intervals.values());
    for (const interval of intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

export const providerManager = new ProviderManager();
