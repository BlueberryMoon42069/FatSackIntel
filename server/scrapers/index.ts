import { NationalGridProvider } from "./national-grid";
import { EversourceProvider } from "./eversource";
import { UnitilProvider } from "./unitil";
import { MEMAProvider } from "./mema";
import type { BaseProvider } from "./base";
import { storage } from "../storage";
import { invalidateCache } from "../utils/cache";

const SCRAPER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export class ProviderManager {
  private providers: Map<string, BaseProvider>;
  private intervals: Map<string, NodeJS.Timeout>;
  private lastRunAt: Map<string, number>;

  constructor() {
    this.providers = new Map();
    this.intervals = new Map();
    this.lastRunAt = new Map();

    // Register live outage data providers - real Kubra API scrapers
    this.providers.set("national-grid", new NationalGridProvider());
    this.providers.set("eversource", new EversourceProvider());
    this.providers.set("unitil", new UnitilProvider());
    this.providers.set("mema", new MEMAProvider());
  }

  async scrapeProvider(providerKey: string): Promise<void> {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(`Provider ${providerKey} not found`);
    }

    // Cooldown check
    const lastRun = this.lastRunAt.get(providerKey) ?? 0;
    if (Date.now() - lastRun < SCRAPER_COOLDOWN_MS) {
      const remainingSecs = Math.round((SCRAPER_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
      console.log(`${providerKey}: Skipping (cooldown, ${remainingSecs}s remaining)`);
      return;
    }

    console.log(`Scraping ${providerKey}...`);
    const startTime = Date.now();
    let status: "success" | "error" | "empty" = "empty";
    let errorMessage: string | undefined;
    let recordsFetched = 0;

    try {
      const result = await provider.scrape();
      recordsFetched = result.outages.length;
      status = recordsFetched > 0 ? "success" : "empty";

      console.log(`${providerKey}: Found ${result.outages.length} outages (${result.metadata.totalCustomersAffected} customers affected)`);

      // Store outages in database
      for (const outage of result.outages) {
        try {
          await storage.createOutage(outage);
        } catch (error) {
          console.error(`Error storing outage:`, error);
        }
      }

      this.lastRunAt.set(providerKey, Date.now());

      // Invalidate outage cache after successful scrape
      if (recordsFetched > 0) {
        invalidateCache("outages:");
      }
    } catch (error: any) {
      status = "error";
      errorMessage = error?.message || String(error);
      console.error(`Error scraping ${providerKey}:`, error);
    }

    // Record scraper log (never let this crash the scraper)
    try {
      await storage.createScraperLog({
        scraper: providerKey,
        status,
        recordsFetched,
        errorMessage,
        durationMs: Date.now() - startTime,
      });
    } catch (logError) {
      console.error(`Failed to write scraper log for ${providerKey}:`, logError);
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

  getLastRunAt(providerKey: string): number | undefined {
    return this.lastRunAt.get(providerKey);
  }

  getProviderKeys(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerManager = new ProviderManager();
