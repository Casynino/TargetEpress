import { CountUp, Reveal } from "@/components/site/reveal";
import { siteStats } from "@/lib/site-stats";
import { cn } from "@/lib/utils";

/**
 * The company in real numbers, straight under the scene: big figures that
 * count up as they come into view, a red tick and a few words under each.
 *
 * Every figure is a count from the operational database — cargo actually
 * delivered, customers actually served, kilos actually flown. Figures at zero
 * drop out entirely: "0 shipments delivered" is the one number on a homepage
 * that actively costs you the customer. The flight rhythm is always true, so
 * it is always there.
 */
export async function LiveStats() {
  const stats = await siteStats();
  const cells = [
    { n: stats.delivered, suffix: "", label: "Mizigo imekabidhiwa" },
    { n: stats.customers, suffix: "", label: "Wateja" },
    { n: stats.weightFlownKg, suffix: " kg", label: "Zimesafirishwa" },
  ]
    .filter((cell) => cell.n > 0)
    .concat([{ n: stats.weeklyFlights, suffix: "", label: "Ndege kila wiki" }]);

  return (
    <section aria-label="Target Express kwa namba" className="relative pt-6 md:pt-10">
      <div className="container">
        {/* On a card of its own: the labels are small, and small type straight on the sky is hard to read. */}
        <Reveal className="grid grid-cols-2 gap-y-8 rounded-2xl border bg-card px-5 py-7 md:grid-cols-4 md:px-4 md:py-9">
          {cells.map((cell, i) => (
            <div key={cell.label} className={cn("md:px-7", i % 2 === 1 && "max-md:border-l max-md:pl-6", i > 0 && "md:border-l")}>
              <p className="font-display text-[2.2rem] font-semibold leading-none tracking-[-0.035em] tabular md:text-5xl">
                <CountUp value={cell.n} suffix={cell.suffix} />
              </p>
              <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span aria-hidden className="h-px w-5 shrink-0 bg-signal" />
                {cell.label}
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
