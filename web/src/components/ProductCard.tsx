import { Link } from 'react-router-dom';
import { useState } from 'react';
import { CATEGORY_STYLE, imageFor, money } from '@/lib/data';
import type { Product } from '@/lib/types';

/**
 * One product tile.
 *
 * No images exist in the data, so the tile is typographic: a category tint, a
 * glyph, and the product name. Nothing to fail to load on conference wifi.
 */
export function ProductCard({ product }: { product: Product }) {
  const style = CATEGORY_STYLE[product.product_category] ?? {
    tint: 'from-neutral-100 to-neutral-200',
    glyph: '◇',
  };

  const src = imageFor(product.sku_id);
  // If an image is missing or fails to load, fall back to the typographic tile
  // rather than showing a broken-image icon.
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(src) && !broken;

  return (
    <Link to={`/product/${product.sku_id}`} className="group block">
      <div
        className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${style.tint} transition-transform duration-200 group-hover:scale-[1.015]`}
      >
        {showPhoto ? (
          <img
            src={src}
            alt={product.product_name}
            loading="lazy"
            onError={() => setBroken(true)}
            className="size-full object-cover"
          />
        ) : (
          <>
            <span className="absolute right-4 top-4 text-2xl text-neutral-400/70">
              {style.glyph}
            </span>
            <span className="px-8 text-center text-[17px] font-medium leading-snug tracking-tight text-neutral-700">
              {product.product_name}
            </span>
          </>
        )}
        {!product.in_stock && (
          <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
            Out of stock
          </span>
        )}
      </div>

      <div className="mt-3 px-1">
        <h3 className="text-[15px] font-medium leading-snug text-neutral-900">
          {product.product_name}
        </h3>
        {/* Only our own price. competitor_price is a rival's price, not a former
            price of ours - showing it struck through would be exactly the kind
            of misleading claim Agent 1 exists to catch. */}
        <div className="mt-1">
          <span className="text-[15px] text-neutral-900">{money(product.price)}</span>
        </div>
      </div>
    </Link>
  );
}
