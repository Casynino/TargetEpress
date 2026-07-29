import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";

import { BrandLockup } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <BrandLockup />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>
        </div>

        <div className="mx-auto w-full max-w-sm py-12">
          <div className="mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              Staff access only
            </span>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
              Sign in
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your dashboard opens automatically based on your department.
            </p>
          </div>

          <LoginForm callbackUrl={callbackUrl} />
        </div>

        <p className="text-xs text-muted-foreground">
          Lost your password? Ask the CEO to reset it — accounts are managed
          internally.
        </p>
      </div>

      {/* Brand side */}
      <div className="relative hidden overflow-hidden bg-brand lg:block">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative flex h-full flex-col justify-end gap-6 p-12 text-brand-foreground">
          <blockquote className="max-w-md font-display text-3xl font-semibold leading-tight tracking-tight">
            Every kilo that leaves Guangzhou is accounted for before it leaves
            Dar.
          </blockquote>
          <div className="space-y-1 text-sm text-brand-foreground/70">
            <p className="font-medium text-brand-foreground">{COMPANY.name}</p>
            <p>{COMPANY.chinaAddress}</p>
            <p>{COMPANY.darAddress}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
