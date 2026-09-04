"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { labelForPath, previous, readTrail } from "@/lib/nav-trail";

/**
 * The way back, on a phone.
 *
 * WHY THIS EXISTS AT ALL. The Guangzhou desk opens this app inside WeChat's
 * browser, which has no back button — an ✕ that closes the whole thing and
 * nothing else. So a colleague who opened Receive cargo and wanted a different
 * screen genuinely had no route except signing out and signing in again. An app
 * that can only be left by logging out is not navigable; the phone's own back
 * gesture is a courtesy we do not always get, so the app has to carry its own.
 *
 * HISTORY FIRST, PARENT SECOND. If there is somewhere to go back TO, this goes
 * there — the real previous page, so Invoice → Customer → Batch unwinds the way
 * it was walked rather than teleporting to a hardcoded home. Only when there is
 * no history — a fresh open from a WhatsApp link, a QR scan, a WeChat webview
 * that starts clean — does it fall back to the parent section derived from the
 * path, which is always a truthful "up" even when "back" does not exist.
 *
 * Hidden on the roots. Home has nowhere above it, and a back button that goes
 * nowhere teaches people the control is decorative.
 */

/** The sections a path can climb to, longest prefix first. */
const PARENTS: { prefix: string; parent: string; label: string }[] = [
  { prefix: "/app/collections/record", parent: "/app/collections/follow-up", label: "Payment follow-up" },
  { prefix: "/app/collections/submissions", parent: "/app/collections/follow-up", label: "Payment follow-up" },
  { prefix: "/app/collections", parent: "/app/collections/follow-up", label: "Collections" },
  { prefix: "/app/finance/invoices", parent: "/app/collections/follow-up", label: "Collections" },
  { prefix: "/app/finance/pickup-notes", parent: "/app/finance/pickup-notes", label: "Pickup notes" },
  { prefix: "/app/finance/credit", parent: "/app/finance/credit", label: "Credit" },
  { prefix: "/app/finance/pricing", parent: "/app/finance/pricing", label: "Price Configuration" },
  { prefix: "/app/finance", parent: "/app/finance", label: "Finance" },
  { prefix: "/app/shipments", parent: "/app/shipments", label: "Arrived batches" },
  { prefix: "/app/batches", parent: "/app/batches", label: "Loading batches" },
  { prefix: "/app/cargo", parent: "/app/shipments", label: "Arrived batches" },
  { prefix: "/app/customers", parent: "/app/customers", label: "Customers" },
  { prefix: "/app/support/tickets", parent: "/app/support/tickets", label: "Tickets" },
  { prefix: "/app/support/sourcing", parent: "/app/support/sourcing", label: "Sourcing requests" },
  { prefix: "/app/support", parent: "/app/support", label: "Support" },
  { prefix: "/app/exceptions", parent: "/app/exceptions", label: "Issues & Claims" },
  /* Deliberately NOT /app/admin/settings. Settings is settings.manage, the
     owner's alone, and it was the parent of the whole /app/admin tree — so a
     manager backing out of Deleted records was posted at a door their own
     guard shuts, which is worse than no button. There is no landing page all
     of /app/admin's readers share (its own index redirects into Finance), so
     the climb goes to the one screen every signed-in desk can reach. */
  { prefix: "/app/admin", parent: "/app/dashboard", label: "Home" },
  /* Narrower first — the matcher takes the first row whose prefix fits, so a
     rule for the whole tree would swallow its own children. Backing out of one
     account belongs at the account list, not at the command centre four screens
     above it. */
  { prefix: "/app/manager", parent: "/app/manager", label: "Command centre" },
  { prefix: "/app/receive", parent: "/app/receive", label: "Receive" },
  { prefix: "/app/release", parent: "/app/release", label: "Release" },
];

/** Roots: the top of a portal, where "back" would be a lie. */
const ROOTS = new Set([
  "/app",
  "/app/dashboard",
  "/app/manager",
  "/app/support",
  "/app/receive",
  "/app/release",
  "/app/search",
  /*
    Registering cargo is a TAB, not a page somebody arrived at from a list.

    It is the third icon on the Guangzhou bar and the Dar bar, so a clerk opens
    it directly, and the back control above it was offering "‹ Arrived batches"
    — the parent inherited from /app/cargo, which is right for one consignment
    and wrong for the form that creates one. Worse for the desk that sees it
    most: Guangzhou never touches arrived batches at all, that is the Dar floor's
    screen, so the one label on their registration form pointed at somebody
    else's work. Centred in the header it reads as the page's own title, which
    is how a Chinese screenshot of the intake form came to be captioned
    "到达批次".
  */
  "/app/cargo/new",
  /*
    EVERY OTHER TAB DESTINATION, for the same reason.

    A back control on a screen somebody reached by tapping a tab has nowhere
    honest to point: they did not come from anywhere, and the label it prints
    describes a place they were not. Checked against the tab bar rather than
    guessed — nine of the thirteen destinations were showing one, and each was
    the parent inherited from a broader prefix rule.

    /app/batches was the worst of them after cargo/new: it is Guangzhou's
    fourth tab, and its label sent that desk to a Dar screen.
  */
  "/app/shipments",
  "/app/batches",
  "/app/finance",
  "/app/manager/control",
  "/app/collections/follow-up",
  "/app/support/tickets",
]);

export function MobileBack() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const t = useT();

  /*
    THE TRAIL FIRST, and it is read after mount so the server pass and the first
    paint agree. It is the workflow the reader actually walked — Collections to
    a payment to its bill to the cargo — where history counts redirects and
    filter changes as steps, and the parent map below can only ever name a
    record's relationships.
  */
  const [walked, setWalked] = useState<{ href: string; label: string } | null>(
    null
  );
  useEffect(() => {
    const back = previous(readTrail());
    setWalked(back ? { href: back, label: labelForPath(back) ?? "Back" } : null);
  }, [pathname]);

  if (ROOTS.has(pathname)) return null;

  const match = PARENTS.find(
    (p) => pathname.startsWith(p.prefix) && pathname !== p.parent
  );

  /*
    ONE DECISION, SO THE WORD AND THE DESTINATION CANNOT DISAGREE.

    The label came from the PARENTS table whenever the trail was empty, while
    the press fell through to history.back() — so the button read "Awaiting
    payment" and went wherever the browser happened to have been, which on a
    phone opened from a WhatsApp link was nowhere at all. And history.length
    counts entries from before this app was opened, so it cannot answer "did
    they walk here from inside it"; the trail already does.
  */
  const dest =
    walked ??
    (match
      ? { href: match.parent, label: match.label }
      : { href: "/app/dashboard", label: "Home" });
  const label = t(dest.label);

  return (
    <button
      type="button"
      /* Where the label says, always: the trail if they walked here, otherwise
         this record's own parent. */
      onClick={() => router.push(dest.href)}
      /* 44px high and reaching the screen edge, so a thumb finds it without
         aiming — this is pressed more than anything else on a phone. */
      className="focus-ring -ml-1 inline-flex h-11 max-w-[9rem] items-center gap-0.5 rounded-md pl-1 pr-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-accent"
    >
      <ChevronLeft className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
