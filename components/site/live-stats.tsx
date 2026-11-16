import { siteStats } from "@/lib/site-stats";

/**
 * The company, in real numbers, as one quiet row.
 *
 * Every figure is a count from the operational database — cargo actually
 * delivered, customers actually served, kilos actually flown. A website that
 * claims ten thousand happy customers is one nobody believes; a website that
 * says 1,247 kilos reads like a company with records.
 *
 * Figures at zero drop out entirely: "0 shipments delivered" is the one number
 * on a homepage that actively costs you the customer. The flight rhythm is
 * always true, so it is always there. No cards and no icons (owner, 16 Nov
 * 2026): big figures, a short word under each, hairlines between.
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

  return (
    <section aria-label="Target Express kwa namba" className="border-b bg-background">
      <div className="container grid grid-cols-2 md:grid-cols-4">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={
              "py-7 md:py-10 " +
              (i % 2 === 1 ? "border-l pl-5 md:pl-8 " : "") +
              (i >= 2 ? "max-md:border-t " : "") +
              (i === 2 ? "md:border-l md:pl-8" : "")
            }
          >
            <p className="font-display text-[2rem] font-bold leading-none tracking-tight tabular md:text-5xl">{cell.value}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{cell.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
