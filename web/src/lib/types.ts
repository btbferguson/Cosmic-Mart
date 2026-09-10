/** Shapes returned by the Express API. Mirrors server.js. */

export type Category = 'gadgets' | 'fashion' | 'home and lifestyle';

/** One row of GET /api/catalog — the storefront view of a SKU. */
export interface Product {
  sku_id: string;
  product_name: string;
  product_category: Category;
  price: number;
  competitor_price: number;
  in_stock: boolean;
  /** Customer-facing marketing copy. This is what Agent 1 polices. */
  description: string;
  /** The promotional claims. Deliberately unsupportable on some SKUs. */
  claims: string;
  /** Manufacturer ground truth. What the claims get checked against. */
  specs: string;
}

/** The four employee roles, exactly as the original portal defined them. */
export type RoleKey = 'trustgate' | 'cosmiccare' | 'deadstock' | 'admin';

export interface Role {
  key: RoleKey;
  label: string;
  /** Which agent this role supervises, for the dashboard header. */
  agent: string;
}

export interface Profile {
  name: string;
  email: string;
  initials: string;
  role: RoleKey;
  /** Tailwind class for the avatar, kept close to the original portal colours. */
  colour: string;
}

/** GET /api/state — live shared state, written by the agents themselves. */
export interface SharedState {
  listingDecisions: Array<{
    sku_id: string;
    product_name: string;
    decision: 'approved' | 'escalate' | 'auto-blocked';
    confidence: string;
    reason: string;
    timestamp: string;
  }>;
  complaintPatterns: Array<{
    complaint_pattern_tag: string;
    product_category: string;
    sku_id: string;
    timestamp: string;
  }>;
  returnSpikes: Record<string, boolean>;
  actions: Array<{ sku_id?: string; action?: string; amount?: number; timestamp: string }>;
  inventoryAdvisories: Array<{
    sku_id: string;
    intervention: string;
    risk_level: string;
    replacements_available: boolean;
    note: string;
    timestamp: string;
  }>;
  reviewQueue: Array<{ id: string; status: string; sku_id?: string; timestamp: string }>;
  connections: Record<string, number>;
}
