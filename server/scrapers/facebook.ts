import { storage } from "../storage";
import type { InsertSocialSignal } from "@shared/schema";

const FACEBOOK_TARGETS = [
  { url: "https://www.facebook.com/groups/clintonmaresidents", town: "CLINTON" },
  { url: "https://www.facebook.com/groups/westboroughma", town: "WESTBOROUGH" },
  { url: "https://www.facebook.com/groups/worcestermacommunity", town: "WORCESTER" },
  { url: "https://www.facebook.com/groups/leominster.ma.residents", town: "LEOMINSTER" },
  { url: "https://www.facebook.com/groups/gardnerma", town: "GARDNER" },
];

const OUTAGE_KEYWORDS = ["power out", "no power", "outage", "lights out", "electricity out", "blackout", "lost power", "without power"];
const BILLING_KEYWORDS = ["electric bill", "delivery charge", "rate increase", "bill doubled", "high bill", "electricity cost"];
const SOLAR_KEYWORDS = ["solar", "solar panel", "solar quote", "renewable energy", "rooftop solar", "battery backup", "powerwall"];

export class FacebookScraper {
  
  async scrapePublicPage(pageUrl: string, town: string): Promise<{ text: string; timestamp: Date; url: string }[]> {
    const posts: { text: string; timestamp: Date; url: string }[] = [];
    
    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      if (!response.ok) {
        console.log(`Facebook: ${town} page returned ${response.status}`);
        return posts;
      }
      
      const html = await response.text();
      
      const textBlocks = html.match(/(?:userContent|message)[^>]*>([^<]{30,500})</g) || [];
      
      for (const block of textBlocks.slice(0, 10)) {
        const textMatch = block.match(/>([^<]+)$/);
        if (textMatch && textMatch[1]) {
          const text = textMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
          if (text.length > 20) {
            posts.push({
              text: text.substring(0, 500),
              timestamp: new Date(),
              url: pageUrl,
            });
          }
        }
      }
      
      if (posts.length === 0) {
        const jsonBlocks = html.match(/"message":\{"text":"([^"]{20,500})"/g) || [];
        for (const block of jsonBlocks.slice(0, 10)) {
          const textMatch = block.match(/"text":"([^"]+)"/);
          if (textMatch && textMatch[1]) {
            const text = textMatch[1].replace(/\\n/g, ' ').replace(/\\u[\dA-F]{4}/gi, '');
            if (text.length > 20) {
              posts.push({ text: text.substring(0, 500), timestamp: new Date(), url: pageUrl });
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`Facebook scrape error for ${town}:`, error);
    }
    
    return posts;
  }
  
  classifyPost(text: string): { category: string; urgency: number; keywords: string[] } {
    const lower = text.toLowerCase();
    const found: string[] = [];
    let category = "general";
    let urgency = 0.1;
    
    for (const kw of OUTAGE_KEYWORDS) {
      if (lower.includes(kw)) { found.push(kw); category = "outage"; urgency = Math.max(urgency, 0.8); }
    }
    for (const kw of BILLING_KEYWORDS) {
      if (lower.includes(kw)) { found.push(kw); if (category === "general") category = "billing"; urgency = Math.max(urgency, 0.4); }
    }
    for (const kw of SOLAR_KEYWORDS) {
      if (lower.includes(kw)) { found.push(kw); if (category === "general") category = "solar"; urgency = Math.max(urgency, 0.5); }
    }
    
    if (lower.includes("urgent") || lower.includes("emergency")) urgency = 1.0;
    
    return { 
      category: category === "solar" ? "intent" : category, 
      urgency, 
      keywords: found 
    };
  }
  
  async scrapeAndStore(): Promise<{ processed: number; stored: number; source: string }> {
    let processed = 0;
    let stored = 0;
    
    console.log("Starting Facebook public page scrape...");
    
    for (const target of FACEBOOK_TARGETS) {
      const posts = await this.scrapePublicPage(target.url, target.town);
      
      for (const post of posts) {
        processed++;
        const analysis = this.classifyPost(post.text);
        
        if (analysis.category !== "general" && analysis.urgency > 0.1) {
          try {
            const signal: InsertSocialSignal = {
              source: `Facebook/${target.url.split('/').pop()}`,
              town: target.town,
              text: post.text,
              category: analysis.category as any,
              urgency: analysis.urgency,
              keywords: analysis.keywords,
              timestamp: post.timestamp,
            };
            
            await storage.createSocialSignal(signal);
            stored++;
          } catch (error) {
            console.error("Error storing Facebook signal:", error);
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`Facebook scrape complete: ${stored}/${processed} signals stored`);
    return { processed, stored, source: "facebook_public" };
  }
}

export const facebookScraper = new FacebookScraper();
