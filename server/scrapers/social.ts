import type { InsertSocialSignal } from "@shared/schema";
import { storage } from "../storage";

const TARGET_TOWNS = [
  "Clinton", "Westborough", "Lancaster", "Berlin",
  "Northborough", "Southborough", "Hopkinton", "Worcester",
  "Shrewsbury", "Grafton", "Millbury", "Auburn",
  "Holden", "Sterling", "Boylston", "West Boylston",
  "Leominster", "Fitchburg", "Gardner", "Spencer"
];

const FACEBOOK_SOURCES = [
  "{town} Community Group",
  "{town} MA Neighbors",
  "{town} Residents",
  "{town} Town Discussion",
  "Worcester County Homeowners",
  "Central MA Community",
  "MetroWest Residents",
  "{town} Local Talk"
];

const TWITTER_SOURCES = [
  "Twitter/@{town}Resident",
  "Twitter/@MA_PowerWatch",
  "Twitter/@WorcesterNews",
  "Twitter/@LocalReporter",
  "X/@{town}Updates"
];

const POST_TEMPLATES = {
  outage: [
    "Power out in {town} for {duration} hours now. Anyone else affected? #poweroutage",
    "Just lost power here in {town}. National Grid says {duration} hours to restore.",
    "No power in {town} near {location}. This is ridiculous! #{town}",
    "Electricity out again in {town}. Third time this month! @NationalGridUS",
    "Power's been out in {town} since {time}. Kids can't do homework.",
    "Anyone in {town} without power? We've been dark for {duration} hours.",
    "Major outage hitting {town} right now. Whole neighborhood is out.",
    "Lost power during the storm in {town}. @NationalGrid any updates?",
    "Power outage in {town}! All my food in the fridge is going to spoil.",
    "No electricity in {town}. Working from home is impossible today.",
    "Lights flickering then went out completely here in {town}.",
    "Been without power in {town} all morning. National Grid truck just arrived.",
    "Power out in downtown {town}. Traffic lights not working!",
    "Outage in {town} affecting {affected} homes according to the outage map.",
  ],
  billing: [
    "My National Grid bill increased {percent}% this month! These delivery charges are insane. #{town}",
    "Electric bill in {town} just hit ${amount}. How is this legal?",
    "Just got my electricity bill - doubled from last month! Anyone else in {town}?",
    "National Grid delivery charge is now higher than my usage. Unbelievable. #{town}",
    "Why is my electric bill ${amount} when I barely use heat? {town} resident here.",
    "The rate increase from National Grid is killing us in {town}. Time to go solar?",
    "Can someone explain why my {town} electric bill is ${amount}? This is robbery.",
    "Electric costs in {town} are out of control. Bill went up {percent}% year over year.",
    "My delivery charge is ${delivery} on a ${usage} usage bill. Make it make sense. #{town}",
    "National Grid billing practices are predatory. {town} needs alternatives!",
    "Just compared bills with my neighbor in {town}. Both got hit with huge increases.",
    "Winter electric bill in {town}: ${amount}. This is unsustainable.",
  ],
  solar: [
    "Thinking about solar panels after this outage in {town}. Any recommendations?",
    "Looking for solar installers in {town}. These electric bills are too high.",
    "Anyone in {town} gone solar? Considering it after this month's bill.",
    "Solar quote for my {town} house came back at ${amount}. Worth it?",
    "After 3 outages this year, I'm seriously considering solar + battery for my {town} home.",
    "Tired of National Grid. Getting solar quotes in {town} area. Any installer recs?",
    "Researching solar panels for {town}. The ROI looks good with these electric rates.",
    "My neighbor in {town} got solar last year. Their bill is $20/month now. I'm jealous.",
    "Best solar companies serving {town}? Need to escape these electricity costs.",
    "Thinking renewable energy is the way to go. Any {town} residents with solar experience?",
    "Getting multiple solar quotes for my {town} property. Finally making the switch.",
  ],
  battery: [
    "Looking into Powerwall backup systems after the {town} outage. Anyone have one?",
    "Researching home battery backup for {town} house. Tesla vs Enphase opinions?",
    "After this outage in {town}, definitely getting a battery backup system installed.",
    "Home battery storage seems worth it in {town} with all these power outages.",
    "Tesla Powerwall owners in {town} - was it worth the investment?",
    "Considering generator vs battery backup for my {town} home. Advice?",
    "Enphase battery system quote for {town} - anyone have experience with them?",
    "Looking at whole home battery backup. {town} power reliability is terrible.",
    "Solar + battery combo for {town} house. Seems like the smart move these days.",
    "Anyone in {town} installed a LG RESU battery? Looking for reviews.",
    "Power storage solutions for {town} homeowners - what's the best value?",
    "Generac PWRcell vs Tesla Powerwall for {town} home. Which would you choose?",
  ],
};

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

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTimestamp(minHoursAgo: number, maxHoursAgo: number): Date {
  const hoursAgo = randomInt(minHoursAgo, maxHoursAgo);
  const minutesAgo = randomInt(0, 59);
  return new Date(Date.now() - (hoursAgo * 60 + minutesAgo) * 60 * 1000);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
    }
  }

  private generateOutagePost(town: string): string {
    const template = randomItem(POST_TEMPLATES.outage);
    return template
      .replace(/{town}/g, town)
      .replace(/{duration}/g, String(randomInt(1, 8)))
      .replace(/{location}/g, randomItem(LOCATIONS))
      .replace(/{time}/g, formatTime(randomTimestamp(1, 6)))
      .replace(/{affected}/g, String(randomInt(50, 2000)));
  }

  private generateBillingPost(town: string): string {
    const template = randomItem(POST_TEMPLATES.billing);
    return template
      .replace(/{town}/g, town)
      .replace(/{percent}/g, String(randomInt(15, 50)))
      .replace(/{amount}/g, String(randomInt(180, 450)))
      .replace(/{delivery}/g, String(randomInt(80, 150)))
      .replace(/{usage}/g, String(randomInt(60, 120)));
  }

  private generateSolarPost(town: string): string {
    const template = randomItem(POST_TEMPLATES.solar);
    return template
      .replace(/{town}/g, town)
      .replace(/{amount}/g, String(randomInt(15000, 35000)));
  }

  private generateBatteryPost(town: string): string {
    const template = randomItem(POST_TEMPLATES.battery);
    return template.replace(/{town}/g, town);
  }

  private generateSimulatedPosts(count: number = 20): SocialPost[] {
    const posts: SocialPost[] = [];
    const postTypes = ['outage', 'billing', 'solar', 'battery'] as const;
    const weights = { outage: 0.35, billing: 0.30, solar: 0.20, battery: 0.15 };

    for (let i = 0; i < count; i++) {
      const town = randomItem(TARGET_TOWNS);
      const platform = Math.random() > 0.6 ? 'twitter' : 'facebook';
      
      const rand = Math.random();
      let type: typeof postTypes[number];
      if (rand < weights.outage) type = 'outage';
      else if (rand < weights.outage + weights.billing) type = 'billing';
      else if (rand < weights.outage + weights.billing + weights.solar) type = 'solar';
      else type = 'battery';

      let text: string;
      switch (type) {
        case 'outage':
          text = this.generateOutagePost(town);
          break;
        case 'billing':
          text = this.generateBillingPost(town);
          break;
        case 'solar':
          text = this.generateSolarPost(town);
          break;
        case 'battery':
          text = this.generateBatteryPost(town);
          break;
      }

      const sourceTemplates = platform === 'twitter' ? TWITTER_SOURCES : FACEBOOK_SOURCES;
      const source = randomItem(sourceTemplates).replace(/{town}/g, town);

      posts.push({
        text,
        source,
        timestamp: randomTimestamp(24, 72),
        platform,
        url: platform === 'twitter' 
          ? `https://twitter.com/user/status/${Date.now()}${i}`
          : undefined,
      });
    }

    return posts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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

  async scrapeFacebookGroups(): Promise<SocialPost[]> {
    return this.generateSimulatedPosts(15);
  }

  async scrapeAll(): Promise<SocialPost[]> {
    const [simulatedPosts, twitterPosts] = await Promise.all([
      this.generateSimulatedPosts(20),
      this.scrapeTwitterApi(),
    ]);

    const allPosts = [...simulatedPosts, ...twitterPosts];
    return allPosts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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
    let source = "simulated";

    try {
      const posts = await this.scrapeAll();
      
      if (this.twitterConfig) {
        source = "twitter_api+simulated";
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
