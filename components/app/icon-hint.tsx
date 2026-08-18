/**
 * The name of an icon, on hover and on keyboard focus.
 *
 * Icon-only buttons are right for a row somebody scans a hundred times a day —
 * the owner asked for them specifically — but only once you know what they mean,
 * and a new clerk does not. The browser's own `title` tooltip technically
 * answers that: after a second of stillness, in the operating system's font, in
 * a grey box that belongs to no design. It reads as something the app forgot
 * rather than something it offers.
 *
 * This is the app's own: instant, in the app's type and colours, appearing above
 * the button so it never covers the row underneath.
 *
 * NO JAVASCRIPT. It is CSS state on the wrapper — group-hover for the mouse and
 * group-focus-within for the keyboard, so a tab-through gets the same label a
 * mouse does. That also means it works inside a server component, which is where
 * most of these rows are rendered.
 */
export function IconHint({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`group/hint relative inline-flex ${className ?? ""}`}>
      {children}
      <span
        role="tooltip"
        className="
          pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5
          -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md
          border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground
          opacity-0 shadow-lg transition-all duration-100
          group-hover/hint:translate-y-0 group-hover/hint:scale-100 group-hover/hint:opacity-100
          group-focus-within/hint:translate-y-0 group-focus-within/hint:scale-100 group-focus-within/hint:opacity-100
        "
      >
        {label}
        {/* The little tail, so it points at what it is naming. */}
        <span className="absolute left-1/2 top-full -mt-px h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r bg-popover" />
      </span>
    </span>
  );
}
