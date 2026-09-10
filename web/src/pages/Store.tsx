import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { StoreNav } from '@/components/StoreNav';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCatalog } from '@/lib/api';
import { CATEGORIES } from '@/lib/data';
import type { Product } from '@/lib/types';

export function Store() {
  const { category } = useParams<{ category?: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog()
      .then(setProducts)
      .catch((e) => setError(e.message));
  }, []);

  const filtered = category
    ? (products ?? []).filter((p) => p.product_category === category)
    : (products ?? []);

  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label;

  return (
    <div className="min-h-screen bg-white">
      <StoreNav />

      <main className="mx-auto max-w-[1400px] px-6 pb-24">
        {/* Hero — only on the home route, not on a category listing. */}
        {!category && (
          <section className="relative mt-2 overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-10 py-24 sm:px-16 sm:py-32">
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                background:
                  'radial-gradient(700px circle at 78% 22%, rgba(96,165,250,0.5), transparent 60%), radial-gradient(500px circle at 18% 78%, rgba(244,114,182,0.35), transparent 60%)',
              }}
            />
            <div className="relative max-w-xl">
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-neutral-400">
                Cosmic Mart
              </p>
              <h1 className="mt-4 text-5xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl">
                Everything, honestly.
              </h1>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-neutral-300">
                144 million customers across 10 markets. Every listing checked before it
                reaches you.
              </p>
              <Button
                onClick={() => navigate('/category/gadgets')}
                className="mt-8 rounded-full bg-white px-6 text-neutral-900 hover:bg-neutral-100"
              >
                Explore gadgets
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
          </section>
        )}

        {/* Heading */}
        <div className="mt-14 flex items-baseline justify-between">
          <h2 className="text-3xl font-medium tracking-tight text-neutral-900">
            {categoryLabel ?? 'Popular at Cosmic Mart'}
          </h2>
          {products && (
            <span className="text-sm text-neutral-500">
              {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
            </span>
          )}
        </div>

        {/* Category chips */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/"
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              !category
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              to={`/category/${encodeURIComponent(c.value)}`}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                category === c.value
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {error && (
          <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-medium">Could not load the catalogue.</p>
            <p className="mt-1 text-amber-800">
              {error} — is the API server running? Start it with{' '}
              <code className="rounded bg-amber-100 px-1.5 py-0.5">npm start</code> in the
              project root.
            </p>
          </div>
        )}

        {/* Grid */}
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {!products && !error
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-square rounded-2xl" />
                  <Skeleton className="mt-3 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/4" />
                </div>
              ))
            : filtered.map((p) => <ProductCard key={p.sku_id} product={p} />)}
        </div>
      </main>

      <footer className="border-t border-neutral-200 py-10">
        <div className="mx-auto max-w-[1400px] px-6 text-sm text-neutral-500">
          Cosmic Mart · CosmicTrust demo · APEX Hackathon FY27
        </div>
      </footer>
    </div>
  );
}
