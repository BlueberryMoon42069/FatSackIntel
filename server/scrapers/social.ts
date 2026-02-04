import type { InsertSocialSignal } from "@shared/schema";
import { storage } from "../storage";

const TARGET_TOWNS = [
  "Clinton", "Westborough", "Lancaster", "Berlin",
  "Northborough", "Southborough", "Hopkinton", "Worcester",
  "Shrewsbury", "Grafton", "Millbury", "Auburn",
  "Holden", "Sterling", "Boylston", "West Boylston",
  "Leominster", "Fitchburg", "Gardner", "Spencer"
];

const LOCATIONS = [
  "the high school", "Main Street", "downtown", "the center",
  "near Route 9", "by the town common", "the industrial park",
  "the residential area", "near the hospital", "by the library"
];

const KEYWORD_CATEGORIES = {
  outage: {
    keywords: [
      "power out", "no power", "outage", "electricity out",
      "lights out", "lost power", "power's out", "power is out",
      "blackout", "power down", "without power", "dark"
    ],
    baseUrgency: 4,
  },
  billing: {
    keywords: [
      "electric bill", "electricity bill", "delivery charge",
      "rate increase", "bill doubled", "expensive bill",
      "high bill", "electric cost", "utility bill", "billing"
    ],
    baseUrgency: 2,
  },
  solar: {
    keywords: [
      "solar", "solar panel", "solar quote", "solar installer",
      "renewable energy", "photovoltaic", "pv system", "rooftop solar"
    ],
    baseUrgency: 3,
  },
  battery: {
    keywords: [
      "battery backup", "powerwall", "home battery", "power storage",
      "backup power", "energy storage", "generator", "backup system",
      "enphase", "pwrcell", "lg resu"
    ],
    baseUrgency: 3,
  },
};

export interface SocialPost {
  text: string;
  source: string;
  timestamp: Date;
  url?: string;
  platform: "facebook" | "twitter";
}

export interface TwitterApiConfig {
  bearerToken: string;
  searchQuery?: string;
  maxResults?: number;
}

export class SocialScraper {
  private twitterConfig: TwitterApiConfig | null = null;

  constructor() {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (bearerToken) {
      this.twitterConfig = {
        bearerToken,
        searchQuery: 'power outage OR electric bill OR solar panels (Worcester OR Clinton OR Westborough) -is:retweet lang:en',
        maxResults: 100,
      };
      console.log("Twitter API configured - will fetch real tweets");
    } else {
      console.log("Twitter API not configured - no social data will be collected");
    }
  }

  async scrapeTwitterApi(): Promise<SocialPost[]> {
    if (!this.twitterConfig) {
      return [];
    }

    try {
      const url = new URL('https://api.twitter.com/2/tweets/search/recent');
      url.searchParams.set('query', this.twitterConfig.searchQuery || 'power outage Worcester');
      url.searchParams.set('max_results', String(this.twitterConfig.maxResults || 100));
      url.searchParams.set('tweet.fields', 'created_at,author_id,text');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.twitterConfig.bearerToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Twitter API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        console.log("No tweets found from Twitter API");
        return [];
      }

      return data.data.map((tweet: any) => ({
        text: tweet.text,
        source: `Twitter/@${tweet.author_id}`,
        timestamp: new Date(tweet.created_at),
        platform: 'twitter' as const,
        url: `https://twitter.com/i/web/status/${tweet.id}`,
      }));
    } catch (error) {
      console.error("Twitter API fetch error:", error);
      return [];
    }
  }

  analyzePost(text: string, source: string): {
    category: string;
    urgency: number;
    keywords: string[];
    town: string | null;
  } {
    const lowerText = text.toLowerCase();
    const foundKeywords: string[] = [];
    let category = "general";
    let urgency = 1;

    for (const keyword of KEYWORD_CATEGORIES.outage.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        category = "outage";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.outage.baseUrgency);
      }
    }

    for (const keyword of KEYWORD_CATEGORIES.billing.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        if (category === "general") category = "billing";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.billing.baseUrgency);
      }
    }

    for (const keyword of KEYWORD_CATEGORIES.solar.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        if (category === "general") category = "solar";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.solar.baseUrgency);
      }
    }

    for (const keyword of KEYWORD_CATEGORIES.battery.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        if (category === "general") category = "battery";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.battery.baseUrgency);
      }
    }

    const town = this.extractTown(text);

    if (town && category === "outage") {
      urgency = Math.min(5, urgency + 1);
    }

    if (lowerText.includes("emergency") || lowerText.includes("urgent") || lowerText.includes("critical")) {
      urgency = 5;
    }

    return { category, urgency, keywords: foundKeywords, town };
  }

  private extractTown(text: string): string | null {
    const lowerText = text.toLowerCase();
    
    for (const town of TARGET_TOWNS) {
      if (lowerText.includes(town.toLowerCase())) {
        return town;
      }
    }

    return null;
  }

  // TODO: Implement real Facebook Graph API integration when API access is available
  async scrapeFacebookGroups(): Promise<SocialPost[]> {
    console.log("Facebook API not configured - returning empty data. Real Facebook Graph API integration needed.");
    return [];
  }

  async scrapeAll(): Promise<SocialPost[]> {
    // Only return real Twitter data - no simulated posts
    const twitterPosts = await this.scrapeTwitterApi();
    return twitterPosts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async scrapeAndStore(): Promise<{
    processed: number;
    stored: number;
    errors: number;
    source: string;
  }> {
    let processed = 0;
    let stored = 0;
    let errors = 0;
    let source = "none";

    try {
      const posts = await this.scrapeAll();
      
      if (this.twitterConfig) {
        source = "twitter_api";
      }

      console.log(`Processing ${posts.length} social posts (source: ${source})...`);

      for (const post of posts) {
        processed++;
        const analysis = this.analyzePost(post.text, post.source);

        if (analysis.town && analysis.category !== "general") {
          try {
            const normalizedCategory = analysis.category === "solar" || analysis.category === "battery" 
              ? "intent" 
              : analysis.category;

            const signal: InsertSocialSignal = {
              source: post.source,
              town: analysis.town,
              text: post.text,
              category: normalizedCategory,
              urgency: analysis.urgency / 5,
              keywords: analysis.keywords,
              timestamp: post.timestamp,
            };

            await storage.createSocialSignal(signal);
            stored++;
          } catch (error) {
            console.error("Error storing social signal:", error);
            errors++;
          }
        }
      }

      console.log(`Social scraper: ${stored} stored, ${processed} processed, ${errors} errors (source: ${source})`);
    } catch (error) {
      console.error("Social scraper error:", error);
      errors++;
    }

    return { processed, stored, errors, source };
  }

  async getTownSentiment(hours: number = 24): Promise<Array<{
    town: string;
    outageCount: number;
    billingCount: number;
    intentCount: number;
    avgUrgency: number;
    score: number;
  }>> {
    const signals = await storage.getRecentSocialSignals(hours);
    const townStats = new Map<string, any>();

    for (const signal of signals) {
      if (!townStats.has(signal.town)) {
        townStats.set(signal.town, {
          town: signal.town,
          outageCount: 0,
          billingCount: 0,
          intentCount: 0,
          urgencies: [],
        });
      }

      const stats = townStats.get(signal.town);
      if (signal.category === "outage") stats.outageCount++;
      if (signal.category === "billing") stats.billingCount++;
      if (signal.category === "intent") stats.intentCount++;
      stats.urgencies.push(signal.urgency);
    }

    const results = Array.from(townStats.values()).map(stats => {
      const avgUrgency = stats.urgencies.length > 0
        ? stats.urgencies.reduce((sum: number, u: number) => sum + u, 0) / stats.urgencies.length
        : 0;
      
      const score = (
        stats.outageCount * 10 +
        stats.intentCount * 3 +
        stats.billingCount * 1 +
        avgUrgency * 25
      );

      return {
        town: stats.town,
        outageCount: stats.outageCount,
        billingCount: stats.billingCount,
        intentCount: stats.intentCount,
        avgUrgency,
        score,
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  isTwitterConfigured(): boolean {
    return this.twitterConfig !== null;
  }
}

export const socialScraper = new SocialScraper();
