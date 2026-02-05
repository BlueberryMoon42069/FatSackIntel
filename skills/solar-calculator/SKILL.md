---
name: solar-calculator
description: Solar savings calculator model and PDF report generation. Use when the user asks to modify calculator formulas, update solar rates, or customize the savings report.
---

# Solar Savings Calculator

## Overview

The calculator at `/calculator` compares utility costs vs solar over 25 years using this model:

## Calculation Model

```typescript
// Year-over-year projection
for (year = 1; year <= 25; year++) {
  utilityRate = startingRate * (1 + utilityIncrease)^(year-1)
  solarRate = startingSolarRate * (1 + solarEscalator)^(year-1)
  
  utilityMonthly = utilityRate * monthlyKwh
  solarMonthly = solarRate * monthlyKwh
  
  savingsMonthly = utilityMonthly - solarMonthly
  savingsYearly = savingsMonthly * 12
  cumulativeSavings += savingsYearly
}
```

## Default Values (MA Market)

| Parameter | Default | Source |
|-----------|---------|--------|
| Utility Rate Increase | 4.84% | National 5-year average |
| Solar Rate | $0.332/kWh | Typical PPA rate |
| Solar Escalator | 3.5% | Standard contract term |

## Input Fields

- **Customer Name**: Pre-filled from `?name=` query param
- **Address**: Pre-filled from `?address=` query param (linked from outage drawer)
- **Current Bill**: Monthly utility bill in dollars
- **kWh Usage**: Monthly consumption
- **Utility Rate Increase**: Annual % increase assumption
- **Solar Rate**: Starting $/kWh for solar
- **Solar Escalator**: Annual % increase for solar rate

## PDF Report Generation

The Print Report button opens a new window with formatted HTML that triggers browser print dialog:

Key sections:
1. Customer info header
2. Option A vs Option B comparison boxes
3. Key metrics grid (monthly advantage, 10-yr avg, 25-yr total)
4. Rate comparison table
5. Year-by-year projection table (years 1, 5, 10, 15, 20, 25)
6. Disclaimer footer

## File Location

- Calculator page: `client/src/pages/calculator.tsx`
- Integrated from outage drawer: `client/src/components/OutageDetailDrawer.tsx`

## Customization Points

1. **Change default rates**: Update `useState` defaults in calculator.tsx
2. **Modify PDF layout**: Edit the template string in `handlePrint()` function
3. **Add new metrics**: Extend the `calculateSavingsModel()` function
