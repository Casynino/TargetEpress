import { CargoGlobe } from "@/components/ui/cargo-globe";
import { siteStats } from "@/lib/site-stats";
import { cn } from "@/lib/utils";

/**
 * The globe, turning, with the company's real numbers floating round it like
 * instrument readouts (owner, 16 Nov 2026: "the globe must be there", and the
 * logistics key art he held up with figures orbiting an earth).
 *
 * Every figure is a count from the operational database — cargo actually
 * delivered, customers actually served, kilos actually flown. Figures at zero
 * drop out entirely: "0 shipments delivered" is the one number on a homepage
 * that actively costs you the customer. The flight rhythm is always true, so
 * it is always there. The globe takes no touches on a phone, so a finger on it
 * scrolls the page.
 */
export async function LiveStats() {
  const stats = await siteStats();
  const cells = [
    { raw: stats.delivered, value: stats.delivered.toLocaleString(), label: "Mizigo imekabidhiwa" },
    { raw: stats.customers, value: stats.customers.toLocaleString(), label: "Wateja" },
    { raw: stats.weightFlownKg, value: `${stats.weightFlownKg.toLocaleString()} kg`, label: "Zimesafirishwa" },
  ]
    .filter((cell) => cell.raw > 0)
    .concat([{ raw: 1, value: String(stats.weeklyFlights), label: "Ndege kila wiki" }]);

  // Four places round the earth; the readouts take them in order.
  const SPOTS = [
    "left-0 top-[6%] sm:left-[4%]",
    "right-0 top-[18%] sm:right-[4%]",
    "left-0 bottom-[16%] sm:left-[2%]",
    "right-0 bottom-[4%] sm:right-[6%]",
  ];

  return (
    <section aria-label="Target Express kwa namba" className="relative isolate overflow-hidden bg-[hsl(var(--ink))] py-14 text-white md:py-20">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "radial-gradient(circle at 50% 50%, hsl(214 80% 40% / 0.35), transparent 55%)" }}
      />
      <div className="container">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
          <span className="sm:hidden">China → Dar es Salaam</span>
          <span className="max-sm:hidden">Guangzhou · Hong Kong → Dar es Salaam</span>
        </p>
        <div className="relative mx-auto mt-6 max-w-[560px]">
          <div className="mx-auto w-[78%] max-lg:pointer-events-none">
            <CargoGlobe spin={0.2} />
          </div>
          {cells.map((cell, i) => (
            <div
              key={cell.label}
              className={cn(
                "float-y absolute rounded-2xl border border-white/15 bg-[hsl(var(--ink)/0.55)] px-3.5 py-2.5 backdrop-blur-md",
                i % 3 === 1 && "float-y-2",
                i % 3 === 2 && "float-y-3",
                SPOTS[i],
              )}
            >
              <p className="font-display text-xl font-bold leading-none tabular sm:text-2xl">{cell.value}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{cell.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
