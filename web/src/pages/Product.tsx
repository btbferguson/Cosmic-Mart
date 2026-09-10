import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { StoreNav } from '@/components/StoreNav';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCatalog } from '@/lib/api';
import { CATEGORY_STYLE, imageFor, money } from '@/lib/data';
import type { Product as P } from '@/lib/types';

/**
 * The product page.
 *
 * This is where the demo lands: the marketing claims are shown exactly as a
 * customer sees them, so a judge can read "charges 10x faster / 300W" here and
 * then watch Agent 1 block that same listing.
 */
export function Product() {
  const { sku } = useParams<{ sku: string }>();
  const [product, setProduct] = useState<P | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getCatalog()
      .then((all) => {
        const found = all.find((p) => p.sku_id === sku);
        if (found) setProduct(found);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [sku]);

  const style = product
    ? CATEGORY_STYLE[product.product_category] ?? { tint: 'from-neutral-100 to-neutral-200', glyph: '◇' }
    : null;

  return (
    <div className="min-h-screen bg-white">
      <StoreNav />
      <main className="mx-auto max-w-[1400px] px-6 pb-24">
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>

        {notFound && (
          <p className="mt-10 text-neutral-600">
            No product found for {sku}. <Link to="/" className="underline">Back to store</Link>
          </p>
        )}

        {!product && !notFound && (
          <div className="mt-8 grid gap-12 lg:grid-cols-2">
            <Skeleton className="aspect-square rounded-3xl" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        )}

        {product && style && (
          <div className="mt-8 grid gap-12 lg:grid-cols-2">
            <div
              className={`flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${style.tint}`}
            >
              {imageFor(product.sku_id) ? (
                <img
                  src={imageFor(product.sku_id)}
                  alt={product.product_name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <div className="text-6xl text-neutral-400/70">{style.glyph}</div>
                  <div className="mt-6 px-10 text-2xl font-medium tracking-tight text-neutral-700">
                    {product.product_name}
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-[13px] uppercase tracking-[0.12em] text-neutral-400">
                {product.sku_id}
              </p>
              <h1 className="mt-2 text-4xl font-medium tracking-tight text-neutral-900">
                {product.product_name}
              </h1>
              <p className="mt-4 text-2xl text-neutral-900">{money(product.price)}</p>

              <p className="mt-6 leading-relaxed text-neutral-700">{product.description}</p>

              {product.claims && (
                <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-neutral-500">
                    Product claims
                  </p>
                  <p className="mt-2 leading-relaxed text-neutral-800">{product.claims}</p>
                </div>
              )}

              <div className="mt-8 flex gap-3">
                <Button className="rounded-full bg-blue-600 px-8 hover:bg-blue-700">
                  Add to cart
                </Button>
                <Button variant="outline" className="rounded-full px-8">
                  Buy now
                </Button>
              </div>

              <p className="mt-6 flex items-center gap-2 text-sm text-neutral-500">
                <ShieldCheck className="size-4" />
                Every listing is checked by CosmicTrust before it goes live.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
