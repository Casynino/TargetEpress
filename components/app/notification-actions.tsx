"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "@/lib/actions/profile";

/** Clears the bell in one press. */
export function MarkAllReadButton() {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(() => void markNotificationsRead())}
    >
      <CheckCheck className="mr-2 h-4 w-4" />
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
