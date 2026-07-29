import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/session";

export default async function NoAccessPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="h-7 w-7" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
        That area is not yours
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        You are signed in as <span className="font-medium">{user.name}</span> (
        {ROLE_LABELS[user.role]}). This page belongs to another department. If
        you need access, ask the CEO to change your role.
      </p>
      <Button asChild variant="brand" className="mt-6 rounded-xl">
        <Link href="/app/dashboard">Back to my dashboard</Link>
      </Button>
    </div>
  );
}
