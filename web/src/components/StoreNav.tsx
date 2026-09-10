import { Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, ShoppingCart, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATEGORIES } from '@/lib/data';

/**
 * The storefront nav. A floating pill bar, close to the reference the team
 * shared — categories on the left, utilities and sign-in on the right.
 */
export function StoreNav({ cartCount = 0 }: { cartCount?: number }) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-50 px-4 pt-4 pb-2 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[1400px] items-center gap-1 rounded-full border border-neutral-200/80 bg-white px-5 py-2.5 shadow-sm">
        <Link to="/" className="mr-4 flex items-center gap-2 shrink-0">
          <span className="grid size-7 place-items-center rounded-full bg-neutral-900 text-[13px] font-semibold text-white">
            C
          </span>
          <span className="text-[15px] font-medium tracking-tight">Cosmic Mart</span>
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              to={`/category/${encodeURIComponent(c.value)}`}
              className="rounded-full px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
            >
              {c.label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-neutral-200" />
          <span className="cursor-default rounded-full px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100">
            Offers
          </span>
          <Link
            to="/support"
            className="rounded-full px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Support
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button className="grid size-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100">
            <Search className="size-[18px]" />
          </button>
          <button className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 sm:flex">
            <MapPin className="size-[18px]" />
            Stores
          </button>
          <button className="relative grid size-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100">
            <ShoppingCart className="size-[18px]" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-neutral-900 text-[10px] font-medium text-white">
                {cartCount}
              </span>
            )}
          </button>
          <button className="grid size-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100">
            <Grid3x3 className="size-[18px]" />
          </button>
          <Button
            onClick={() => navigate('/login')}
            className="ml-1 rounded-full bg-blue-600 px-5 hover:bg-blue-700"
          >
            Sign in
          </Button>
        </div>
      </nav>
    </div>
  );
}
