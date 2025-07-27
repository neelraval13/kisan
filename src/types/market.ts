/* ======================================================================== */
/* 1.  Record (one row of price data)                                        */
/* ======================================================================== */

export interface MarketRecord {
  state: string;             // e.g. "Andhra Pradesh"
  district: string;          // e.g. "Chittor"
  market: string;            // e.g. "Chittoor"
  commodity: string;         // e.g. "Gur(Jaggery)"
  variety: string;           // e.g. "NO 2"
  grade: string;             // e.g. "FAQ"
  arrival_date: string;      // "DD/MM/YYYY"  (API returns string)
  min_price: string;         // prices come back as stringified numbers
  max_price: string;
  modal_price: string;
}

/* ======================================================================== */
/* 2.  Full Agmarknet JSON payload - flexible for error responses           */
/* ======================================================================== */

export interface AgmarknetResponse {
  created?: number;
  updated?: number;
  created_date?: string;
  updated_date?: string;
  title?: string;
  total?: number;
  count?: number;
  records?: MarketRecord[];
  status?: string;           // 'ok' or 'error'
  message?: string;          // Error message if status is 'error'
  // ... other metadata fields
}