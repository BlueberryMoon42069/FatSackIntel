import type { FeatureCollection, Geometry } from "geojson";

const PROVIDERS: ProviderKey[] = ["mema", "mock", "eversource", "national_grid", "unitil"];

export type ProviderKey = "mema" | "mock" | "eversource" | "national_grid" | "unitil";

export type OutageApiResponse = {
  updatedAt: string;
  providers: ProviderKey[];
  features: FeatureCollection<Geometry, any>;
};

export type ScoreWindow = "24h" | "7d" | "30d";

export type ScoreCell = {
  h3: string;
  window: ScoreWindow;
  centroid: { lat: number; lng: number };

  score: number;
  score_outage: number;

  boosts: {
    heat?: number;
    noGas?: number;
    repeatDay?: number;
    large?: number;
    social?: number;
  };

  features: {
    events: number;
    minutes_out: number;
    customers_affected_est?: number;
    electric_heat_share?: number;
    no_gas_share?: number;
    social_signal?: number;
  };

  top_reasons: string[];
};

export type ScoresApiResponse = {
  updatedAt: string;
  window: ScoreWindow;
  cells: ScoreCell[];
};

export type GasLayerResponse = {
  updatedAt: string;
  source: "sample" | "massgis" | "csv";
  features: FeatureCollection<Geometry, any>;
};

export type HeatingLayerResponse = {
  updatedAt: string;
  source: "sample" | "acs" | "csv";
  features: FeatureCollection<Geometry, any>;
};

export type DocumentMetric = {
  type: "SAIDI" | "SAIFI" | "CAIDI";
  value: number;
  unit?: string;
  year?: number;
  territory?: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  provider?: string;
  year?: number;
  url?: string;
  tags: string[];
  snippet: string;
  metrics: DocumentMetric[];
};

export type DocumentsResponse = {
  updatedAt: string;
  total: number;
  items: DocumentRow[];
};

export function mockOutages(providers: ProviderKey[]): OutageApiResponse {
  const p: ProviderKey[] = providers.length ? providers : ["mema", "mock"];
  const features: FeatureCollection<Geometry, any> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          provider: "mema",
          customers: 620,
          status: "outage",
          confidence: "public-feed",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-71.2102, 42.354],
              [-71.175, 42.354],
              [-71.175, 42.332],
              [-71.2102, 42.332],
              [-71.2102, 42.354],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          provider: "national_grid",
          customers: 1250,
          status: "outage",
          confidence: "quadkey-tile",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-71.0589, 42.3601],
              [-71.0489, 42.3601],
              [-71.0489, 42.3501],
              [-71.0589, 42.3501],
              [-71.0589, 42.3601],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          provider: "eversource",
          customers: 840,
          status: "outage",
          confidence: "quadkey-tile",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-71.1097, 42.3736],
              [-71.0997, 42.3736],
              [-71.0997, 42.3636],
              [-71.1097, 42.3636],
              [-71.1097, 42.3736],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          provider: "mock",
          customers: 140,
          status: "outage",
          confidence: "mock",
        },
        geometry: {
          type: "Point",
          coordinates: [-72.5898, 42.1015],
        },
      },
      {
        type: "Feature",
        properties: {
          provider: "mock",
          customers: 80,
          status: "outage",
          confidence: "mock",
        },
        geometry: {
          type: "Point",
          coordinates: [-70.958, 42.47],
        },
      },
    ],
  };

  return {
    updatedAt: new Date().toISOString(),
    providers: p,
    features,
  };
}

export function mockScores(window: ScoreWindow): ScoresApiResponse {
  const base = window === "24h" ? 1 : window === "7d" ? 0.82 : 0.68;
  const mk = (i: number, lat: number, lng: number): ScoreCell => {
    const outage = Math.max(0.12, base * (0.65 - i * 0.04));
    const boosts = {
      heat: i % 3 === 0 ? 0.1 : 0,
      noGas: i % 4 === 0 ? 0.08 : 0,
      repeatDay: i % 5 === 0 ? 0.08 : 0,
      large: i % 2 === 0 ? 0.05 : 0,
      social: i % 6 === 0 ? 0.03 : 0,
    };
    const score = Math.min(
      1,
      outage + boosts.heat + boosts.noGas + boosts.repeatDay + boosts.large + boosts.social,
    );

    const reasons: string[] = [];
    if (boosts.heat) reasons.push("High electric heat share (+0.10)");
    if (boosts.noGas) reasons.push("Limited gas coverage (+0.08)");
    if (boosts.repeatDay) reasons.push("Repeat-day outages (+0.08)");
    if (boosts.large) reasons.push("Larger outage footprint (+0.05)");
    if (boosts.social) reasons.push("Public page hotspot (+0.03)");
    if (!reasons.length) reasons.push("Elevated outage minutes in this window");

    return {
      h3: `892a10d${i}b7fffff`,
      window,
      centroid: { lat, lng },
      score: Number(score.toFixed(3)),
      score_outage: Number(outage.toFixed(3)),
      boosts,
      features: {
        events: 7 + i,
        minutes_out: 220 + i * 18,
        customers_affected_est: 4500 + i * 520,
        electric_heat_share: 0.22 + i * 0.01,
        no_gas_share: 0.18 + i * 0.012,
        social_signal: boosts.social ? 0.6 : 0.1,
      },
      top_reasons: reasons.slice(0, 3),
    };
  };

  const cells: ScoreCell[] = [
    mk(0, 42.358, -71.059),
    mk(1, 42.283, -71.35),
    mk(2, 42.102, -72.59),
    mk(3, 42.45, -71.11),
    mk(4, 41.63, -70.93),
    mk(5, 42.65, -73.25),
    mk(6, 42.52, -71.76),
    mk(7, 42.16, -71.02),
    mk(8, 42.04, -70.68),
    mk(9, 42.33, -72.0),
  ];

  return {
    updatedAt: new Date().toISOString(),
    window,
    cells,
  };
}

export function mockGasLayer(): GasLayerResponse {
  return {
    updatedAt: new Date().toISOString(),
    source: "sample",
    features: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { has_gas: true, name: "Sample gas service" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-71.32, 42.45],
                [-71.02, 42.45],
                [-71.02, 42.28],
                [-71.32, 42.28],
                [-71.32, 42.45],
              ],
            ],
          },
        },
      ],
    },
  };
}

export function mockHeatingLayer(): HeatingLayerResponse {
  return {
    updatedAt: new Date().toISOString(),
    source: "sample",
    features: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { electric_heat_share: 0.29, town: "Sample area" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-72.78, 42.22],
                [-72.35, 42.22],
                [-72.35, 41.98],
                [-72.78, 41.98],
                [-72.78, 42.22],
              ],
            ],
          },
        },
      ],
    },
  };
}

export function mockDocuments(q?: string): DocumentsResponse {
  const all: DocumentRow[] = [
    {
      id: "kubra-specs-2024",
      title: "Kubra API Integration Specifications",
      provider: "Internal",
      year: 2024,
      url: "https://github.com/justlab/Outages",
      tags: ["scraping", "api", "kubra", "quadkey"],
      snippet:
        "Technical breakdown of interval_generation_data endpoints and quadkey tiling logic for utility outage maps.",
      metrics: [
        { type: "SAIDI", value: 12.5, unit: "minutes", year: 2024 },
        { type: "SAIFI", value: 0.15, unit: "interruptions", year: 2024 },
      ],
    },
    {
      id: "dpu-2023-reliability",
      title: "MA Electric Reliability Report (2023)",
      provider: "DPU",
      year: 2023,
      url: "https://example.com/doc.pdf",
      tags: ["reliability", "saidi", "saifi"],
      snippet:
        "Summary of annual reliability metrics across service territories, including SAIDI/SAIFI by utility and major event days.",
      metrics: [
        { type: "SAIDI", value: 102.4, unit: "minutes", year: 2023 },
        { type: "SAIFI", value: 1.12, unit: "interruptions", year: 2023 },
        { type: "CAIDI", value: 91.4, unit: "minutes", year: 2023 },
      ],
    },
    {
      id: "nationalgrid-2022",
      title: "National Grid MA Reliability Performance (2022)",
      provider: "National Grid",
      year: 2022,
      url: "https://example.com/ng.pdf",
      tags: ["utility", "metrics"],
      snippet:
        "Reliability performance overview with storm-event segmentation and distribution automation initiatives.",
      metrics: [
        { type: "SAIDI", value: 118.9, unit: "minutes", year: 2022 },
        { type: "SAIFI", value: 1.29, unit: "interruptions", year: 2022 },
      ],
    },
    {
      id: "mema-storm-2019",
      title: "After-Action Storm Review (2019)",
      provider: "MEMA",
      year: 2019,
      url: "https://example.com/mema.pdf",
      tags: ["mema", "storm"],
      snippet:
        "After-action review focused on coordination, restoration timelines, and key recommendations.",
      metrics: [{ type: "CAIDI", value: 142.0, unit: "minutes", year: 2019 }],
    },
  ];

  const filtered = (q ?? "").trim()
    ? all.filter((d) =>
        `${d.title} ${d.provider ?? ""} ${d.tags.join(" ")}`
          .toLowerCase()
          .includes((q ?? "").trim().toLowerCase()),
      )
    : all;

  return {
    updatedAt: new Date().toISOString(),
    total: filtered.length,
    items: filtered,
  };
}
