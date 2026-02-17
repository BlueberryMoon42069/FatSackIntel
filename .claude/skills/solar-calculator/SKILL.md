---
name: solar-calculator
description: Solar savings calculator model and PDF report generation. Use when the user asks to modify calculator formulas, update solar rates, customize the savings report, or analyze solar potential.
user-invocable: true
argument-hint: "[action: rates|formula|report|analyze]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Solar Savings Calculator

You are modifying the SackFinder solar savings calculator. Use $ARGUMENTS to determine what to do.

## Overview

The calculator at `/calculator` compares utility costs vs solar over 25 years.

**Main file**: `client/src/pages/calculator.tsx` (~997 lines)

## Calculation Model

```typescript
for (year = 1; year <= 25; year++) {
  utilityRate = startingRate * (1 + utilityIncrease) ** (year - 1)
  solarPayment = baseSolarPayment * (1 + solarEscalator) ** (year - 1)

  utilityAnnual = utilityRate * annualKwh
  solarAnnual = (solarPayment * 12) + (utilityRate * annualKwh * (1 - percentOffset))

  savings = utilityAnnual - solarAnnual - annualRebates
  cumulativeSavings += savings
}
```

## Default Values (MA Market)

| Parameter | Default | Source |
|-----------|---------|--------|
| Utility Rate Increase | 4.84% | National 5-year average |
| Solar Monthly Payment | Varies | PPA/lease rate |
| Solar Escalator | 3.5% | Standard contract term |
| % Offset | 100% | Full solar coverage |
| Term | 25 years | Standard PPA term |

## Preset Dropdowns

- **Utility Rate**: Customer, NE avg ($0.294), MA avg ($0.332), National Grid ($0.344), Eversource ($0.339), Unitil ($0.311)
- **Utility Escalator**: Customer, MA 5yr (4.25%), MA 10yr (5.89%), MA 25yr (5.59%), NE 5yr (3.16%), National 5yr (4.84%)
- **CPI Inflation**: National 10yr (2.75%), National 5yr (4.23%), Custom

## PDF Report

The `handlePrint()` function generates a printable HTML page with:
1. Customer info header
2. Option A (Utility) vs Option B (Solar) comparison
3. Key metrics grid
4. Year-by-year projection table (years 1, 5, 10, 15, 20, 25)
5. Disclaimer footer

## NREL Solar API

Backend integration in `server/utils/solar.ts`:
- API: NREL PVWatts v8
- Default system: 4kW roof mount
- Optimal tilt: latitude - 10 degrees
- Score: kWh/kW normalized to 1800 baseline

```bash
# Analyze solar potential for a location
curl -X POST http://localhost:5000/api/solar/analyze \
  -H "Content-Type: application/json" \
  -d '{"lat": 42.36, "lon": -71.06}'
```

## Key Files

- Calculator page: `client/src/pages/calculator.tsx`
- Outage detail drawer (links to calc): `client/src/components/OutageDetailDrawer.tsx`
- Solar backend: `server/utils/solar.ts`
- Solar API routes: `server/routes.ts` (search for "SOLAR DATA API")
