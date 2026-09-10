import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PROFILES, ROLES } from '@/lib/data';
import type { RoleKey } from '@/lib/types';

/**
 * One login for everyone. The role you sign in as decides which dashboard you
 * land on — there is no separate "admin area" URL.
 *
 * Roles and staff accounts are the ones the team already agreed on in the
 * original portal, not new inventions.
 */
export function Login() {
  const navigate = useNavigate();

  function signIn(role: RoleKey) {
    // Demo auth: the role is the session. No passwords are checked, and none
    // are stored — this is a prototype, not an auth system.
    sessionStorage.setItem('cosmictrust.role', role);
    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row lg:items-start lg:py-20">
        {/* Left: the form */}
        <div className="flex-1">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft className="size-4" />
            Back to store
          </Link>

          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Login to your account</CardTitle>
              <CardDescription>Enter your email below to login to your account</CardDescription>
              <CardAction>
                <Button variant="link">Sign Up</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // Any email lands on the customer view in the demo.
                  signIn('cosmiccare');
                }}
              >
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="m@example.com" required />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="password">Password</Label>
                      <a
                        href="#"
                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </a>
                    </div>
                    <Input id="password" type="password" required />
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Button type="submit" className="w-full" onClick={() => signIn('cosmiccare')}>
                Login
              </Button>
              <Button variant="outline" className="w-full">
                Login with Google
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right: pick a demo account */}
        <div className="flex-1 lg:max-w-md lg:pt-16">
          <h2 className="text-sm font-medium text-neutral-900">Or continue as a demo account</h2>
          <p className="mt-1 text-sm text-neutral-500">
            The role you choose decides which dashboard you land on.
          </p>

          <Separator className="my-5" />

          <div className="flex flex-col gap-2">
            {PROFILES.map((p) => (
              <button
                key={p.email}
                onClick={() => signIn(p.role)}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ${p.colour}`}
                >
                  {p.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">{p.email}</span>
                </span>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                  {ROLES[p.role].label}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-5 text-xs text-neutral-400">
            Demo only — no passwords are checked or stored.
          </p>
        </div>
      </div>
    </div>
  );
}
