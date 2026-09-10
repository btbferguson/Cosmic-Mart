import images from './images.json';
import type { Profile, Role, RoleKey } from './types';

/**
 * The four employee roles.
 *
 * These are lifted verbatim from `rolesMeta` in the original ui/index.html so
 * the new front end supervises the same agents under the same names the team
 * already agreed on. Do not rename these — server.js and the old portal both
 * key off them.
 */
export const ROLES: Record<RoleKey, Role> = {
  trustgate: { key: 'trustgate', label: 'Listings Reviewer', agent: 'TrustGate · Agent 1' },
  cosmiccare: { key: 'cosmiccare', label: 'Customer Service', agent: 'CosmicCare · Agent 2' },
  deadstock: { key: 'deadstock', label: 'Inventory Manager', agent: 'DeadStock Zero · Agent 3' },
  admin: { key: 'admin', label: 'Admin', agent: 'All three agents' },
};

/** The demo staff accounts, also carried over from the original portal. */
export const PROFILES: Profile[] = [
  {
    name: 'Sofia Reyes',
    email: 's.reyes@cosmicmart.com',
    initials: 'SR',
    role: 'trustgate',
    colour: 'bg-blue-600',
  },
  {
    name: 'Marcus Park',
    email: 'm.park@cosmicmart.com',
    initials: 'MP',
    role: 'cosmiccare',
    colour: 'bg-teal-600',
  },
  {
    name: 'Jordan Lee',
    email: 'j.lee@cosmicmart.com',
    initials: 'JL',
    role: 'deadstock',
    colour: 'bg-green-600',
  },
  {
    name: 'Ada Okonkwo',
    email: 'a.okonkwo@cosmicmart.com',
    initials: 'AO',
    role: 'admin',
    colour: 'bg-neutral-800',
  },
];

/** Store nav. Values match `product_category` in the CSVs exactly. */
export const CATEGORIES = [
  { value: 'gadgets', label: 'Gadgets' },
  { value: 'home and lifestyle', label: 'Home & Lifestyle' },
  { value: 'fashion', label: 'Fashion' },
] as const;

/**
 * Products have no images in the data, so each category gets a tint and a
 * glyph. Typographic tiles rather than hotlinked stock photos — nothing to
 * fail to load on conference wifi.
 */
export const CATEGORY_STYLE: Record<string, { tint: string; glyph: string }> = {
  gadgets: { tint: 'from-slate-100 to-slate-200', glyph: '◈' },
  'home and lifestyle': { tint: 'from-amber-50 to-orange-100', glyph: '◉' },
  fashion: { tint: 'from-rose-50 to-pink-100', glyph: '◆' },
};

/**
 * Product photography, downloaded to web/public/products at build time.
 *
 * These are seeded Picsum photos, not photographs of the actual products - the
 * Cosmic Mart catalogue is fictional, so no real photos exist. Seeded by SKU so
 * the store looks identical in rehearsal and on stage, and stored locally so a
 * flaky network cannot leave the storefront full of broken tiles.
 */
const IMAGES = images as Record<string, string>;

export const imageFor = (skuId: string): string | undefined => IMAGES[skuId];

export const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
