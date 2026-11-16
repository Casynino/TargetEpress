/**
 * Remounted on every move between public pages, which is what lets each page
 * fade in (`.page-in`, globals.css). The header, the footer and the sky are in
 * the layout above it and stay where they are.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
