import type { InsertSocialSignal } from "@shared/schema";
import { storage } from "../storage";

// Target Worcester County towns
const TARGET_TOWNS = [
  "Clinton", "Westborough", "Lancaster", "Berlin",
  "Northborough", "Southborough", "Hopkinton", "Worcester",
  "Shrewsbury", "Grafton", "Millbury", "Auburn"
];

// Keyword categories with priority weights
const KEYWORD_CATEGORIES = {
  outage: {
    keywords: [
      "power out", "no power", "outage", "electricity out",
      "lights out", "lost power", "power's out", "power is out",
      "blackout", "power down"
    ],
    urgency: 0.9,
  },
  billing: {
    keywords: [
      "electric bill", "electricity bill", "delivery charge",
      "rate increase", "bill doubled", "expensive bill",
      "high bill", "electric cost", "utility bill"
    ],
    urgency: 0.4,
  },
  intent: {
    keywords: [
      "generator", "solar", "solar panel", "battery backup",
      "backup power", "power storage", "tesla powerwall",
      "home battery", "renewable energy", "solar quote"
    ],
    urgency: 0.6,
  },
};

export interface SocialPost {
  text: string;
  source: string;
  timestamp: Date;
  url?: string;
}

export class SocialScraper {
  // Parse text to extract category, urgency, and keywords
  analyzePost(text: string, source: string): {
    category: string;
    urgency: number;
    keywords: string[];
    town: string | null;
  } {
    const lowerText = text.toLowerCase();
    const foundKeywords: string[] = [];
    let category = "general";
    let urgency = 0.1;

    // Check outage keywords (highest priority)
    for (const keyword of KEYWORD_CATEGORIES.outage.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        category = "outage";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.outage.urgency);
      }
    }

    // Check billing keywords
    for (const keyword of KEYWORD_CATEGORIES.billing.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        if (category === "general") category = "billing";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.billing.urgency);
      }
    }

    // Check intent keywords
    for (const keyword of KEYWORD_CATEGORIES.intent.keywords) {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
        if (category === "general") category = "intent";
        urgency = Math.max(urgency, KEYWORD_CATEGORIES.intent.urgency);
      }
    }

    // Extract town mentions
    const town = this.extractTown(text);

    // Boost urgency if town is mentioned with outage
    if (town && category === "outage") {
      urgency = Math.min(1.0, urgency + 0.1);
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

  // Scrape Facebook public pages/groups (simulated - actual implementation needs Facebook API or web scraping)
  async scrapeFacebookGroups(): Promise<SocialPost[]> {
    // In production, this would use:
    // 1. Facebook Graph API for public pages
    // 2. Web scraping with puppeteer/playwright for public groups
    // 3. RSS feeds if available
    
    // For now, return mock recent posts for testing
    const mockPosts: SocialPost[] = [
      {
        text: "Power out in Clinton near the high school. Anyone else affected?",
        source: "Clinton MA Community",
        timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      },
      {
        text: "My electric bill doubled this month! These delivery charges are insane.",
        source: "Westborough Neighbors",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        text: "Thinking about getting solar panels. Anyone have recommendations for installers?",
        source: "Worcester County Homeowners",
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      },
      {
        text: "Lights flickering in Northborough. Storm coming through.",
        source: "Northborough Town Group",
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      },
      {
        text: "Lost power again. This is the third time this month. Getting a generator.",
        source: "Berlin MA Residents",
        timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 min ago
      },
    ];

    return mockPosts;
  }

  async scrapeAndStore(): Promise<{
    processed: number;
    stored: number;
    errors: number;
  }> {
    let processed = 0;
    let stored = 0;
    let errors = 0;

    try {
      const posts = await this.scrapeFacebookGroups();
      console.log(`Processing ${posts.length} social posts...`);

      for (const post of posts) {
        processed++;
        const analysis = this.analyzePost(post.text, post.source);

        // Only store if we found relevant keywords and a town
        if (analysis.town && analysis.category !== "general") {
          try {
            const signal: InsertSocialSignal = {
              source: post.source,
              town: analysis.town,
              text: post.text,
              category: analysis.category,
              urgency: analysis.urgency,
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

      console.log(`Social scraper: ${stored} stored, ${processed} processed, ${errors} errors`);
    } catch (error) {
      console.error("Social scraper error:", error);
      errors++;
    }

    return { processed, stored, errors };
  }

  // Get sentiment ranking for towns based on recent social signals
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
      const avgUrgency = stats.urgencies.reduce((sum: number, u: number) => sum + u, 0) / stats.urgencies.length;
      
      // Composite score: weight outages highest, then intent, then billing
      const score = (
        stats.outageCount * 10 +
        stats.intentCount * 3 +
        stats.billingCount * 1 +
        avgUrgency * 5
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
}

export const socialScraper = new SocialScraper();
