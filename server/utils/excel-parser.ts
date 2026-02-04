import * as XLSX from 'xlsx';
import type { InsertHistoricalOutage } from '@shared/schema';

// Column mapping for DPU Outage_Accident_Report format
// Based on actual Eversource 2023 report structure
interface OutageReportRow {
  'Report Date'?: string;
  'Region'?: string;
  'AWC'?: string;
  'Town'?: string;
  'Street'?: string;
  'Station'?: string;
  'Feeder'?: string;
  'Protective Device'?: string;
  'Voltage'?: string;
  'OH/UG'?: string;
  'Customers Out'?: number;
  'Injuries'?: number;
  'Duration (hrs)'?: number;
  'Customer Minutes'?: number;
  'Incident Start'?: string;
  'Incident End'?: string;
  'Cause'?: string;
  'Failed Component'?: string;
  'Weather'?: string;
  'Major Event'?: string;
  'Planned'?: string;
  'Draft Incident #'?: string;
  // Alternative column names (different reports may use different names)
  'TOWN'?: string;
  'STREET'?: string;
  'CUSTOMERS OUT'?: number;
  'DURATION'?: number;
  'CAUSE'?: string;
}

export interface ParseResult {
  success: boolean;
  records: InsertHistoricalOutage[];
  errors: string[];
  warnings: string[];
  stats: {
    totalRows: number;
    validRows: number;
    skippedRows: number;
  };
}

function parseDate(dateStr: string | number | undefined): Date | undefined {
  if (!dateStr) return undefined;
  
  // Handle Excel serial date numbers
  if (typeof dateStr === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + dateStr * 86400000);
  }
  
  // Try various date formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try MM/DD/YY HH:MM format
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(\d{1,2}):(\d{2})?/);
  if (match) {
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]), parseInt(match[4]), parseInt(match[5] || '0'));
  }
  
  return undefined;
}

function extractYear(dateStr: string | number | undefined): number {
  const date = parseDate(dateStr);
  if (date) return date.getFullYear();
  
  // Try to extract year from string
  if (typeof dateStr === 'string') {
    const yearMatch = dateStr.match(/20\d{2}/);
    if (yearMatch) return parseInt(yearMatch[0]);
  }
  
  return new Date().getFullYear();
}

function normalizeString(val: any): string | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  return String(val).trim();
}

function normalizeNumber(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const num = parseFloat(val);
  return isNaN(num) ? undefined : num;
}

function normalizeInteger(val: any): number | undefined {
  const num = normalizeNumber(val);
  return num !== undefined ? Math.round(num) : undefined;
}

function detectUtilityFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('eversource')) return 'Eversource';
  if (lower.includes('national') || lower.includes('ngrid')) return 'National Grid';
  if (lower.includes('unitil')) return 'Unitil';
  return 'Unknown';
}

function getColumnValue(row: any, ...possibleNames: string[]): any {
  for (const name of possibleNames) {
    if (row[name] !== undefined) return row[name];
    // Try case-insensitive match
    const keys = Object.keys(row);
    const match = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (match) return row[match];
    // Try partial match (column name contains the search term)
    const partialMatch = keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (partialMatch) return row[partialMatch];
  }
  return undefined;
}

// Detect utility from company name in row or filename
function detectUtilityFromRow(row: any, filename: string): string {
  const companyName = getColumnValue(row, 'Company Name', 'Company', 'Utility');
  if (companyName) {
    const lower = String(companyName).toLowerCase();
    if (lower.includes('eversource') || lower.includes('ema') || lower.includes('wma')) return 'Eversource';
    if (lower.includes('national') || lower.includes('ngrid')) return 'National Grid';
    if (lower.includes('unitil')) return 'Unitil';
  }
  return detectUtilityFromFilename(filename);
}

export function parseOutageReport(buffer: Buffer, filename: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const records: InsertHistoricalOutage[] = [];
  
  let totalRows = 0;
  let validRows = 0;
  let skippedRows = 0;
  
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    
    // Find the main data sheet (usually first sheet or one named "Outages" or similar)
    let sheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      if (name.toLowerCase().includes('outage') || name.toLowerCase().includes('data')) {
        sheetName = name;
        break;
      }
    }
    
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: undefined });
    
    totalRows = rows.length;
    const utility = detectUtilityFromFilename(filename);
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;
      const rowNum = i + 2; // Excel rows are 1-indexed, plus header row
      
      try {
        // Get town - required field
        // Actual column names from DPU reports: "City/Town", "Town", etc.
        const town = normalizeString(getColumnValue(row, 'City/Town', 'Town', 'TOWN', 'City', 'CITY', 'Municipality'));
        if (!town) {
          skippedRows++;
          continue; // Skip rows without town
        }
        
        // Skip header rows that might have been parsed
        if (town.toLowerCase() === 'town' || town.toLowerCase() === 'city' || town.toLowerCase() === 'city/town') {
          skippedRows++;
          continue;
        }
        
        // Column mapping for actual DPU Outage_Accident_Report format:
        // "Date Filed", "Date and Time Out", "Date And Time In", "Actual Duration", etc.
        const reportDateVal = getColumnValue(row, 'Date Filed', 'Report Date', 'Date Reported');
        const incidentStartVal = getColumnValue(row, 'Date and Time Out', 'Date Time Out', 'Incident Start', 'Start Time');
        const incidentEndVal = getColumnValue(row, 'Date And Time In', 'Date Time In', 'Incident End', 'End Time');
        
        const year = extractYear(incidentStartVal || reportDateVal);
        
        // Detect utility from row data if possible
        const rowUtility = detectUtilityFromRow(row, filename);
        
        const record: InsertHistoricalOutage = {
          utility: rowUtility,
          year,
          reportDate: parseDate(reportDateVal),
          region: normalizeString(getColumnValue(row, 'Company Name', 'Region', 'District/Division')),
          awc: normalizeString(getColumnValue(row, 'District/Division', 'AWC', 'Area Work Center')),
          town,
          street: normalizeString(getColumnValue(row, 'Street', 'STREET', 'Address', 'Location')),
          station: normalizeString(getColumnValue(row, 'Substation/ID', 'Station', 'Substation')),
          feeder: normalizeString(getColumnValue(row, 'Circuit Number', 'Feeder', 'Circuit')),
          protectiveDevice: normalizeString(getColumnValue(row, 'Circuit Branch', 'Protective Device', 'Device')),
          voltage: normalizeString(getColumnValue(row, 'Voltage Levels', 'Voltage', 'kV')),
          ohUg: normalizeString(getColumnValue(row, 'Circuit Type', 'OH/UG', 'Type')),
          // Use "Original Number Customers Affected" as primary customers count
          customersOut: normalizeInteger(getColumnValue(row, 'Original Number Customers Affected', 'Customers Out', 'Customers Affected')),
          injuries: normalizeString(getColumnValue(row, 'Injury', 'Injuries')) === 'Y' ? 1 : 0,
          durationHours: normalizeNumber(getColumnValue(row, 'Actual Duration', 'Duration', 'Duration (hrs)')),
          customerMinutes: normalizeNumber(getColumnValue(row, 'Total Customers Outage Hours', 'Customer Minutes', 'CMI')),
          incidentStart: parseDate(incidentStartVal),
          incidentEnd: parseDate(incidentEndVal),
          cause: normalizeString(getColumnValue(row, 'Reason For Outage', 'Cause', 'Outage Cause')),
          failedComponent: normalizeString(getColumnValue(row, 'Failed or Damaged Equipment', 'Failed Component', 'Component')),
          weather: normalizeString(getColumnValue(row, 'Weather Condition', 'Weather')),
          majorEvent: normalizeString(getColumnValue(row, 'Major Excludable Emergency', 'Major Event', 'MED')),
          plannedOutage: normalizeString(getColumnValue(row, 'Planned/Unplanned/Intentional', 'Planned')),
          draftIncidentNumber: normalizeString(getColumnValue(row, 'Incident ID', 'Draft Incident #', 'Incident Number')),
        };
        
        records.push(record);
        validRows++;
        
      } catch (rowError) {
        warnings.push(`Row ${rowNum}: ${rowError}`);
        skippedRows++;
      }
    }
    
    if (records.length === 0) {
      errors.push('No valid outage records found in the file. Check that the file format matches the DPU Outage_Accident_Report format.');
    }
    
  } catch (parseError) {
    errors.push(`Failed to parse Excel file: ${parseError}`);
  }
  
  return {
    success: errors.length === 0 && records.length > 0,
    records,
    errors,
    warnings,
    stats: {
      totalRows,
      validRows,
      skippedRows,
    },
  };
}

export function parseCSV(buffer: Buffer, filename: string): ParseResult {
  // CSV parsing using xlsx library
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  // Reuse the same parsing logic
  const tempWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(tempWorkbook, sheet, 'Data');
  
  return parseOutageReport(buffer, filename);
}
