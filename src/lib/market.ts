import type { AgmarknetResponse, MarketRecord } from '@/types/market';

/** Agmarknet daily–price dataset (fixed resource ID) */
const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';

/**
 * Create a unique key for deduplication
 */
function getRecordKey(record: MarketRecord): string {
  return `${record.state}-${record.district}-${record.market}-${record.commodity}-${record.variety}-${record.arrival_date}`;
}

/**
 * Deduplicate records
 */
function deduplicateRecords(records: MarketRecord[]): MarketRecord[] {
  const seen = new Set<string>();
  return records.filter(record => {
    const key = getRecordKey(record);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Try fetching data from the last few days
 */
async function fetchWithDateRange(
  commodity?: string,
  state?: string,
  limit = 50
): Promise<MarketRecord[]> {
  if (!process.env.AGMARKNET_API_KEY) return [];

  // Try different date ranges (last 7 days)
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    // Format as DD/MM/YYYY
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    dates.push(`${day}/${month}/${year}`);
  }

  let allRecords: MarketRecord[] = [];

  for (const date of dates) {
    const url = new URL(`https://api.data.gov.in/resource/${RESOURCE_ID}`);
    url.searchParams.set('api-key', process.env.AGMARKNET_API_KEY);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', limit.toString());
    
    // Filter by specific date
    url.searchParams.set('filters[arrival_date]', date);
    
    if (commodity) {
      url.searchParams.set('filters[commodity]', commodity.toUpperCase());
    }
    
    if (state) {
      url.searchParams.set('filters[state]', state.toUpperCase());
    }

    try {
      console.log(`Trying date: ${date}`);
      
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) continue;

      const data = await res.json();
      if (data.status === 'error' || !data.records) continue;

      console.log(`Found ${data.records.length} records for date ${date}`);
      allRecords.push(...data.records);
      
    } catch (error) {
      console.error(`Error fetching data for date ${date}:`, error);
      continue;
    }
  }

  // Deduplicate records
  const uniqueRecords = deduplicateRecords(allRecords);
  console.log(`Total records: ${allRecords.length}, Unique records: ${uniqueRecords.length}`);
  
  return uniqueRecords;
}

/**
 * Discover available commodities from recent days
 */
export async function discoverAvailableCommodities(): Promise<{
  commodities: string[];
  sampleRecords: MarketRecord[];
  totalRecords: number;
  dateRange: string;
}> {
  try {
    const records = await fetchWithDateRange(undefined, undefined, 100);
    
    const commodities = new Set<string>();
    records.forEach((record: MarketRecord) => {
      if (record.commodity) {
        commodities.add(record.commodity);
      }
    });

    const sortedCommodities = Array.from(commodities).sort();
    
    return {
      commodities: sortedCommodities,
      sampleRecords: records.slice(0, 5), // Reduced since we have fewer unique records
      totalRecords: records.length,
      dateRange: 'Last 7 days (deduplicated)',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error discovering commodities:', errorMessage);
    return { 
      commodities: [], 
      sampleRecords: [], 
      totalRecords: 0,
      dateRange: 'Error'
    };
  }
}

/**
 * Fetch market price for a specific commodity
 */
export async function fetchMarketPrice(
  commodity: string,
  state?: string,
  limit = 5,
): Promise<MarketRecord[]> {
  try {
    console.log(`Fetching prices for: ${commodity}${state ? ` in ${state}` : ''}`);
    
    const records = await fetchWithDateRange(commodity, state, 50);
    
    if (records.length === 0) {
      console.log(`No records found for ${commodity}`);
      return [];
    }

    // Sort by date (newest first) and limit results
    const sorted = records
      .sort((a, b) => {
        const dateA = new Date(a.arrival_date.split('/').reverse().join('-'));
        const dateB = new Date(b.arrival_date.split('/').reverse().join('-'));
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limit);

    console.log(`Found ${sorted.length} unique records for ${commodity}`);
    return sorted;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('fetchMarketPrice error:', errorMessage);
    return [];
  }
}

/**
 * Get available commodity suggestions based on what we know works
 */
export function getCommoditySuggestions(): string[] {
  return [
    'ARECANUT(BETELNUT/SUPARI)', // We know this one exists
    'TOMATO', 'ONION', 'POTATO', 'RICE', 'WHEAT', 'MAIZE', 'COTTON',
    'SUGARCANE', 'GROUNDNUT', 'SOYBEAN', 'CHILLI', 'TURMERIC'
  ];
}