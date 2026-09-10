/**
 * Illustrative time series for the dashboard charts.
 *
 * IMPORTANT: this is not agent output. The agents only produce data for the
 * current session, so a chart with a trend needs history that does not exist
 * yet. Everything here is a plausible baseline so the panels are legible in a
 * pitch, and every chart that uses it is labelled "illustrative" in the UI.
 *
 * Live figures — decisions made, refunds issued, advisories published — come
 * from GET /api/state and are rendered separately. Do not blend the two
 * silently: a judge asking "is this real?" deserves a straight answer per panel.
 */

export interface Point {
  category: string;
  [series: string]: string | number;
}

/** Agent activity across the working week. */
export const ACTIVITY: Point[] = [
  { category: 'Mon', trustgate: 34, cosmiccare: 18, deadstock: 6 },
  { category: 'Tue', trustgate: 41, cosmiccare: 23, deadstock: 8 },
  { category: 'Wed', trustgate: 38, cosmiccare: 31, deadstock: 11 },
  { category: 'Thu', trustgate: 47, cosmiccare: 27, deadstock: 9 },
  { category: 'Fri', trustgate: 52, cosmiccare: 34, deadstock: 14 },
  { category: 'Sat', trustgate: 29, cosmiccare: 41, deadstock: 7 },
  { category: 'Sun', trustgate: 22, cosmiccare: 36, deadstock: 5 },
];

/** TrustGate outcomes. The blocked line is the one leadership cares about. */
export const LISTING_OUTCOMES: Point[] = [
  { category: 'Wk 1', approved: 186, escalated: 31, blocked: 9 },
  { category: 'Wk 2', approved: 204, escalated: 28, blocked: 12 },
  { category: 'Wk 3', approved: 197, escalated: 42, blocked: 17 },
  { category: 'Wk 4', approved: 223, escalated: 37, blocked: 14 },
  { category: 'Wk 5', approved: 241, escalated: 26, blocked: 8 },
  { category: 'Wk 6', approved: 258, escalated: 21, blocked: 6 },
];

/** CosmicCare: how complaints were resolved. */
export const RESOLUTIONS: Point[] = [
  { category: 'Wk 1', refund: 48, replacement: 22, waiver: 11 },
  { category: 'Wk 2', refund: 54, replacement: 19, waiver: 14 },
  { category: 'Wk 3', refund: 67, replacement: 12, waiver: 18 },
  { category: 'Wk 4', refund: 61, replacement: 9, waiver: 21 },
  { category: 'Wk 5', refund: 52, replacement: 14, waiver: 17 },
  { category: 'Wk 6', refund: 44, replacement: 17, waiver: 15 },
];

/** DeadStock Zero: value recovered, split by intervention. */
export const RECOVERY: Point[] = [
  { category: 'Wk 1', reprice: 18400, redistribute: 9200, donation: 4100 },
  { category: 'Wk 2', reprice: 21700, redistribute: 11800, donation: 6300 },
  { category: 'Wk 3', reprice: 19200, redistribute: 14500, donation: 12700 },
  { category: 'Wk 4', reprice: 24800, redistribute: 12100, donation: 18900 },
  { category: 'Wk 5', reprice: 27300, redistribute: 15600, donation: 22400 },
  { category: 'Wk 6', reprice: 25100, redistribute: 17200, donation: 28600 },
];

/** Cosmic Nexus donation programme, cumulative. */
export const NEXUS: Point[] = [
  { category: 'Apr', units: 120, co2: 41 },
  { category: 'May', units: 268, co2: 92 },
  { category: 'Jun', units: 441, co2: 151 },
  { category: 'Jul', units: 703, co2: 241 },
  { category: 'Aug', units: 968, co2: 332 },
  { category: 'Sep', units: 1247, co2: 438 },
];

/** Illustrative headline figures for the weekly brief. */
export const BRIEF = {
  listingsReviewed: 258,
  listingsBlocked: 6,
  complaintsResolved: 124,
  avgResolutionSeconds: 8,
  marginRecovered: 70_900,
  unitsDiverted: 1_247,
  co2SavedKg: 438,
};
