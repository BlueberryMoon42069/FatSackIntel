import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import { MessageSquare, TrendingUp, AlertTriangle, Battery, Zap, DollarSign, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";

type SocialPost = {
  id: string;
  source: string;
  town: string;
  text: string;
  timestamp: string;
  category: "outage" | "billing" | "intent" | "general";
  urgency: number;
};

type SocialTownMetric = {
  town: string;
  score: number;
  volume_24h: number;
  trend: "up" | "down" | "flat";
  top_keywords: string[];
  posts: SocialPost[];
};

type SocialSignalsResponse = {
  updatedAt: string;
  dominantTopic: string;
  towns: SocialTownMetric[];
};

export default function SocialPage() {
  const [data, setData] = useState<SocialSignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setLoading(true);
    setError(undefined);
    apiFetch<SocialSignalsResponse>("/api/social")
      .then((response) => {
        setData(response);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(e?.message ?? "Failed to load social signals");
        setLoading(false);
      });
  }, []);

  const getUrgencyColor = (score: number) => {
    if (score >= 0.8) return "text-red-600 bg-red-100 border-red-200";
    if (score >= 0.5) return "text-orange-600 bg-orange-100 border-orange-200";
    return "text-blue-600 bg-blue-100 border-blue-200";
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "outage": return <Zap className="h-3 w-3" />;
      case "billing": return <DollarSign className="h-3 w-3" />;
      case "intent": return <Battery className="h-3 w-3" />;
      default: return <MessageSquare className="h-3 w-3" />;
    }
  };

  return (
    <AppShell subtitle="Real-time social sentiment monitoring from public Facebook groups/pages.">
      <div className="grid gap-6">
        
        {/* Dashboard Header */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">High Urgency Towns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.towns.filter(t => t.score > 0.7).length ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.towns && data.towns.length > 0 
                  ? `${data.towns.slice(0, 2).map(t => t.town).join(', ')} spiking`
                  : 'No active signals'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">24h Mention Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.towns.reduce((acc, t) => acc + t.volume_24h, 0) ?? 0}</div>
              <p className={`text-xs text-muted-foreground mt-1 flex items-center gap-1 ${
                data?.towns && data.towns.filter(t => t.trend === "up").length > data.towns.length / 2 
                  ? 'text-red-500' : 'text-green-600'
              }`}>
                <TrendingUp className="h-3 w-3" />
                {data?.towns && data.towns.length > 0
                  ? data.towns.filter(t => t.trend === "up").length > data.towns.length / 2
                    ? 'Trending up overall'
                    : data.towns.filter(t => t.trend === "down").length > data.towns.length / 2
                      ? 'Trending down overall'
                      : 'Stable overall'
                  : 'No trend data'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Dominant Topic</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.dominantTopic ? data.dominantTopic.charAt(0).toUpperCase() + data.dominantTopic.slice(1) : 'None'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.dominantTopic && data.dominantTopic !== 'none' 
                  ? `Most mentioned category` 
                  : 'No signals yet'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
          
          {/* Town Rankings */}
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Regional Sentiment Ranking
              </h2>
              <div className="text-xs text-muted-foreground">
                Live scrape: {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "..."}
              </div>
            </div>

            {loading ? <Spinner /> : error ? (
              <EmptyState title="Error loading social signals" description={error} testId="state-social-error" />
            ) : !data?.towns.length ? (
              <EmptyState title="No social signals" description="No social sentiment data is currently available." testId="state-social-empty" />
            ) : (
              <div className="grid gap-3">
                {data?.towns.map((town) => (
                  <Card key={town.town} className="overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 font-bold text-lg ${getUrgencyColor(town.score)}`}>
                          {(town.score * 100).toFixed(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{town.town}</h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> {town.volume_24h} posts
                            </span>
                            <Separator orientation="vertical" className="h-3" />
                            <span className={town.trend === "up" ? "text-red-500" : "text-green-500"}>
                              Trend: {town.trend.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {town.top_keywords.map(k => (
                          <Badge key={k} variant="secondary" className="text-xs font-normal">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="bg-muted/30 px-4 py-2 border-t text-xs flex items-center justify-between">
                      <span className="text-muted-foreground">Latest signal:</span>
                      <span className="font-medium truncate max-w-[300px]">{town.posts[0]?.text}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Live Feed Sidebar */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Live Feed
              </CardTitle>
              <CardDescription className="text-xs">
                Public posts from tracked pages
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 max-h-[600px] overflow-y-auto pr-2">
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-8 mb-4">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="outage" className="text-xs">Outage</TabsTrigger>
                  <TabsTrigger value="billing" className="text-xs">Bill</TabsTrigger>
                  <TabsTrigger value="intent" className="text-xs">Intent</TabsTrigger>
                </TabsList>
                
                {["all", "outage", "billing", "intent"].map(tab => (
                  <TabsContent key={tab} value={tab} className="mt-0">
                    <div className="grid gap-3">
                      {data?.towns.flatMap(t => t.posts)
                        .filter(p => tab === "all" || p.category === tab)
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .slice(0, 8)
                        .map(post => (
                          <div key={post.id} className="rounded-lg border bg-card p-3 text-sm grid gap-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                                {getCategoryIcon(post.category)}
                                {post.category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(post.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </span>
                            </div>
                            <p className="leading-snug text-xs">{post.text}</p>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] font-semibold text-primary">{post.source}</span>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

        </div>
      </div>
    </AppShell>
  );
}
