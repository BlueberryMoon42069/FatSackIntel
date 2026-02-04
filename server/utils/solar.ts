import type { InsertSolarData } from "@shared/schema";
import { storage } from "../storage";

// NREL PVWatts API integration
const PVWATTS_API_BASE = "https://developer.nrel.gov/api/pvwatts/v8.json";

export interface PVWattsRequest {
  lat: number;
  lon: number;
  systemCapacity?: number; // kW, default 4
  moduleType?: number; // 0=Standard, 1=Premium, 2=Thin film
  arrayType?: number; // 0=Fixed Open Rack, 1=Fixed Roof Mount, etc.
  tilt?: number; // degrees
  azimuth?: number; // degrees (180 = due south)
  losses?: number; // system losses percentage, default 14
}

export interface PVWattsResponse {
  outputs: {
    ac_annual: number; // Annual AC output (kWh)
    solrad_annual: number; // Annual solar radiation (kWh/m²/day)
    capacity_factor: number; // Capacity factor (%)
    ac_monthly: number[]; // Monthly AC output
    poa_monthly: number[]; // Monthly plane of array irradiance
  };
  errors?: string[];
}

export class SolarCalculator {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.NREL_API_KEY || "DEMO_KEY";
  }

  async calculatePVWatts(request: PVWattsRequest): Promise<PVWattsResponse | null> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        lat: request.lat.toString(),
        lon: request.lon.toString(),
        system_capacity: (request.systemCapacity || 4).toString(),
        module_type: (request.moduleType || 0).toString(),
        array_type: (request.arrayType || 1).toString(), // Roof mount default
        tilt: (request.tilt || this.optimalTilt(request.lat)).toString(),
        azimuth: (request.azimuth || 180).toString(),
        losses: (request.losses || 14).toString(),
      });

      const response = await fetch(`${PVWATTS_API_BASE}?${params}`);
      
      if (!response.ok) {
        console.error(`PVWatts API error: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("PVWatts API request failed:", error);
      return null;
    }
  }

  // Optimal tilt angle (approximation: latitude - 15° for better summer production)
  optimalTilt(lat: number): number {
    return Math.max(0, Math.min(60, lat - 10));
  }

  // Calculate solar score (0-100) based on production potential
  calculateSolarScore(
    annualKwh: number,
    systemCapacity: number,
    shadingFactor: number = 1.0,
    roofTilt?: number,
    roofAzimuth?: number
  ): number {
    // Base score from production per kW
    const kwhPerKw = annualKwh / systemCapacity;
    let score = Math.min(100, (kwhPerKw / 1800) * 100); // 1800 kWh/kW is excellent in MA

    // Penalty for non-optimal roof orientation
    if (roofAzimuth !== undefined) {
      const azimuthPenalty = Math.abs(roofAzimuth - 180) / 180; // 180 = south
      score *= (1 - azimuthPenalty * 0.3); // Up to 30% penalty
    }

    // Penalty for shading
    score *= shadingFactor;

    // Bonus for optimal tilt (30-40 degrees in MA)
    if (roofTilt !== undefined) {
      const tiltOptimal = Math.abs(roofTilt - 35) < 15;
      if (tiltOptimal) score *= 1.1;
    }

    return Math.min(100, Math.max(0, score));
  }

  async analyzeSolarPotential(
    lat: number,
    lon: number,
    options: {
      address?: string;
      h3Cell?: string;
      roofTilt?: number;
      roofAzimuth?: number;
      roofArea?: number;
      shadingFactor?: number;
    } = {}
  ): Promise<InsertSolarData> {
    const pvwattsResult = await this.calculatePVWatts({
      lat,
      lon,
      tilt: options.roofTilt,
      azimuth: options.roofAzimuth,
    });

    let annualGHI = 4.2; // MA average (kWh/m²/day)
    let kwhPerKw = 1300; // Conservative default for MA
    let solarScore = 50; // Default medium score

    if (pvwattsResult?.outputs) {
      annualGHI = pvwattsResult.outputs.solrad_annual;
      kwhPerKw = pvwattsResult.outputs.ac_annual / 4; // Assuming 4kW system
      
      solarScore = this.calculateSolarScore(
        pvwattsResult.outputs.ac_annual,
        4,
        options.shadingFactor || 1.0,
        options.roofTilt,
        options.roofAzimuth
      );
    }

    return {
      lat,
      lon,
      address: options.address,
      h3Cell: options.h3Cell,
      roofTilt: options.roofTilt,
      roofAzimuth: options.roofAzimuth,
      shadingFactor: options.shadingFactor,
      roofArea: options.roofArea,
      annualGHI,
      kwhPerKw,
      solarScore,
    };
  }

  // Batch analyze multiple locations
  async batchAnalyze(
    locations: Array<{ lat: number; lon: number; h3Cell?: string }>
  ): Promise<InsertSolarData[]> {
    const results: InsertSolarData[] = [];
    
    for (const loc of locations) {
      try {
        const data = await this.analyzeSolarPotential(loc.lat, loc.lon, {
          h3Cell: loc.h3Cell,
        });
        results.push(data);
        
        // Rate limiting for DEMO_KEY (50 requests per hour)
        if (this.apiKey === "DEMO_KEY") {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error analyzing ${loc.lat},${loc.lon}:`, error);
      }
    }

    return results;
  }

  // Store solar data in database
  async analyzeAndStore(
    lat: number,
    lon: number,
    options: {
      address?: string;
      h3Cell?: string;
      roofTilt?: number;
      roofAzimuth?: number;
      roofArea?: number;
      shadingFactor?: number;
    } = {}
  ): Promise<void> {
    try {
      const solarData = await this.analyzeSolarPotential(lat, lon, options);
      await storage.createOrUpdateSolarData(solarData);
      console.log(`Solar data stored for ${lat},${lon} - Score: ${(solarData.solarScore ?? 0).toFixed(1)}`);
    } catch (error) {
      console.error("Error storing solar data:", error);
    }
  }
}

export const solarCalculator = new SolarCalculator();
