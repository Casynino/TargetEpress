import { redirect } from "next/navigation";

/**
 * Reports has been folded into the General ledger.
 *
 * Its money row — revenue, collected, outstanding — was the Overview's figures
 * a second time. Its Speed and What-we-carry panels are the CEO dashboard's,
 * a second time. What was genuinely only here, the cargo position, now sits on
 * the ledger Overview beside the money it explains.
 *
 * Kept as a redirect rather than deleted: the CEO dashboard links here, an
 * /app/admin visit lands here, and people have it bookmarked.
 */
export default function ReportsPage() {
  redirect("/app/finance");
}
