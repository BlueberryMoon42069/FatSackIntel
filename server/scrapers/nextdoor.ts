import { storage } from "../storage";
import type { InsertSocialSignal } from "@shared/schema";

const MA_TARGETS = [
  { town: "CLINTON", lat: 42.4167, lng: -71.6823 },
  { town: "WESTBOROUGH", lat: 42.2695, lng: -71.6162 },
  { town: "WORCESTER", lat: 42.2626, lng: -71.8023 },
  { town: "LEOMINSTER", lat: 42.5251, lng: -71.7598 },
  { town: "FITCHBURG", lat: 42.5834, lng: -71.8031 },
  { town: "GARDNER", lat: 42.5751, lng: -71.9981 },
  { town: "AUBURN", lat: 42.1945, lng: -71.8356 },
  { town: "FRAMINGHAM", lat: 42.2793, lng: -71.4162 },
  { town: "MARLBOROUGH", lat: 42.3459, lng: -71.5523 },
  { town: "SHREWSBURY", lat: 42.2956, lng: -71.7151 },
];

interface NextdoorOutageArea {
  id: string;
  title: string;
  description?: string;
  location?: { lat: number; lng: number };
  created_at?: string;
  utility?: string;
  type?: string;
}

export class NextdoorOutageScraper {
  
  async scrapeOutageMap(): Promise<number> {
    let stored = 0;
    
    for (const target of MA_TARGETS) {
      try {
        const url = `https://nextdoor.com/api/v1/outages/?lat=${target.lat}&lng=${target.lng}&radius=10`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; OutageMonitor/1.0)',
            'Accept': 'application/json',
            'Referer': 'https://nextdoor.com/',
          },
        });
        
        if (!response.ok) {
          const altUrl = `https://nextdoor.com/public_agency_outages/api/v1/list/?lat=${target.lat}&lng=${target.lng}`;
          const altResponse = await fetch(altUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
          });
          
          if (!altResponse.ok) {
            console.log(`Nextdoor outage map: no data for ${target.town} (${altResponse.status})`);
            continue;
          }
          
          const altData = await altResponse.json();
          stored += await this.processOutageData(altData, target.town);
          continue;
        }
        
        const data = await response.json();
        stored += await this.processOutageData(data, target.town);
        
        await new Promise(r => setTimeout(r, 500));
        
      } catch (error) {
        console.error(`Nextdoor scraper error for ${target.town}:`, error);
      }
    }
    
    return stored;
  }
  
  private async processOutageData(data: any, town: string): Promise<number> {
    let stored = 0;
    const outages: NextdoorOutageArea[] = Array.isArray(data) ? data : (data?.results || data?.outages || []);
    
    for (const outage of outages) {
      try {
        const signal: InsertSocialSignal = {
          source: "Nextdoor Outage Map",
          town,
          text: `${outage.title || 'Power outage reported'}${outage.description ? ': ' + outage.description : ''} (via Nextdoor)`,
          category: "outage",
          urgency: 0.8,
          keywords: ["power out", "outage", "nextdoor"],
          timestamp: outage.created_at ? new Date(outage.created_at) : new Date(),
        };
        
        await storage.createSocialSignal(signal);
        stored++;
      } catch (error) {
        console.error("Error storing Nextdoor signal:", error);
      }
    }
    
    if (stored > 0) {
      console.log(`Nextdoor: Stored ${stored} outage signals for ${town}`);
    }
    
    return stored;
  }
  
  async scrapeAndStore(): Promise<{ stored: number; source: string }> {
    console.log("Starting Nextdoor outage map scrape...");
    const stored = await this.scrapeOutageMap();
    console.log(`Nextdoor scrape complete: ${stored} signals stored`);
    return { stored, source: "nextdoor_outage_map" };
  }
}

export const nextdoorScraper = new NextdoorOutageScraper();
