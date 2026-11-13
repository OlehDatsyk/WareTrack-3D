"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { loginSchema, type LoginInput } from "@/schemas/auth";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { LogoMark } from "@/components/layout/logo";

const DEMO_ACCOUNTS = [
  { role: "Administrator", email: "admin@waretrack.demo" },
  { role: "Warehouse Manager", email: "manager@waretrack.demo" },
  { role: "Operator", email: "operator@waretrack.demo" },
  { role: "Viewer", email: "viewer@waretrack.demo" },
];

function safeNext(next: string | null) {
  // Only allow same-site relative paths to avoid open redirects.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: values });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload to reset client caches
      window.location.assign(safeNext(params.get("next")));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in");
    }
  });

  return (
    <div className="w-full max-w-sm">
      <LogoMark className="mb-6 size-10 lg:hidden" />
      <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-1.5 text-sm text-ink-muted">Sign in to your WareTrack workspace.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-danger-soft px-3 py-2.5 text-[13px] text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            {...form.register("password")}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-muted">
        New to WareTrack?{" "}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      {demoMode && (
        <div className="mt-8 rounded-xl border border-line bg-surface-muted p-4">
          <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Demo accounts</div>
          <p className="mt-1 text-xs text-ink-muted">
            Click to fill the email. The password is the <code className="font-semibold">SEED_DEMO_PASSWORD</code> value from your
            environment (see README).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => form.setValue("email", a.email, { shouldValidate: true })}
                className="rounded-lg border border-line bg-surface px-2.5 py-2 text-left hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="block text-[12.5px] font-semibold">{a.role}</span>
                <span className="block truncate text-[11px] text-ink-muted">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
