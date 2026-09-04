"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Tailwind classes applied to both header and cell. */
  className?: string;
  /** Hide the column below this breakpoint (keeps narrow screens readable). */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /** Start hidden; the user can switch it on from the column menu. */
  defaultHidden?: boolean;
  align?: "left" | "right" | "center";
};

export type TableFilter<T> = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

const HIDE_BELOW: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Enterprise data table.
 *
 * Sorting, filtering, search, column visibility, pagination, bulk selection and
 * row expansion, all client-side over a page of rows the server already sent.
 *
 * Two deliberate decisions:
 *  - Below `md` the table becomes a list of cards via `renderCard`. Warehouse
 *    staff work on phones; a horizontally scrolling table is unusable there,
 *    and hiding columns until a row is meaningless is worse.
 *  - Selection state is keyed by row id, not index, so it survives sorting and
 *    filtering. Selecting five rows then sorting must not move the ticks.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  searchValue,
  searchPlaceholder,
  filters = [],
  pageSize = 25,
  renderExpanded,
  renderCard,
  rowHref,
  bulkActions,
  toolbar,
  emptyTitle,
  emptyDescription,
  initialSort,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** Concatenated searchable text for a row. Omit to hide the search box. */
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: TableFilter<T>[];
  pageSize?: number;
  renderExpanded?: (row: T) => React.ReactNode;
  renderCard?: (row: T) => React.ReactNode;
  /**
   * Where a row opens. Given this, the whole row is a click target, not just
   * whichever cell happens to contain a link — somebody who has found their
   * cargo in a list expects to press it, anywhere.
   *
   * Keep a real `<Link>` in one of the cells as well. This is a convenience on
   * top of that link, never a replacement for it: a `<tr>` cannot be tabbed to,
   * middle-clicked or opened in a new tab, and a row that is *only* clickable
   * is unreachable from a keyboard.
   */
  rowHref?: (row: T) => string;
  /** Rendered when at least one row is selected. */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  initialSort?: { columnId: string; direction: "asc" | "desc" };
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id))
  );
  const [showFilters, setShowFilters] = React.useState(false);

  const visibleColumns = columns.filter((c) => !hidden.has(c.id));
  const placeholder = searchPlaceholder ?? t("Search…");

  // --- derive: filter → search → sort ------------------------------------
  const filtered = React.useMemo(() => {
    let out = rows;

    for (const filter of filters) {
      const value = filterValues[filter.id];
      if (value) out = out.filter((row) => filter.match(row, value));
    }

    const q = query.trim().toLowerCase();
    if (q && searchValue) {
      out = out.filter((row) => searchValue(row).toLowerCase().includes(q));
    }

    if (sort) {
      const column = columns.find((c) => c.id === sort.columnId);
      if (column?.sortValue) {
        const dir = sort.direction === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = column.sortValue!(a);
          const bv = column.sortValue!(b);
          // Empty values always sort last, whichever direction is active —
          // a blank cell is never "the biggest".
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          if (av instanceof Date && bv instanceof Date) {
            return (av.getTime() - bv.getTime()) * dir;
          }
          if (typeof av === "number" && typeof bv === "number") {
            return (av - bv) * dir;
          }
          return String(av).localeCompare(String(bv)) * dir;
        });
      }
    }

    return out;
  }, [rows, filters, filterValues, query, searchValue, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset to page 1 whenever the result set changes shape under the user.
  React.useEffect(() => setPage(1), [query, filterValues]);

  const pageIds = pageRows.map(getRowId);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function toggleAllOnPage() {
    setSelected((current) => {
      const next = new Set(current);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRows = filtered.filter((row) => selected.has(getRowId(row)));
  const activeFilterCount = Object.values(filterValues).filter(Boolean).length;
  const colSpan =
    visibleColumns.length + (bulkActions ? 1 : 0) + (renderExpanded ? 1 : 0);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {searchValue ? (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="pl-9"
              aria-label={placeholder}
            />
            {query ? (
              /* The hint needs the button to sit inside it, so the placement
                 inside the field moves out here — the wrapper holds the
                 position, the button keeps its own look. */
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <IconHint label={t("Clear the search")}>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="focus-ring -m-2.5 rounded-md p-3.5 text-muted-foreground hover:text-foreground"
                    aria-label={t("Clear search")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </IconHint>
              </span>
            ) : null}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Wraps rather than widening the page: below 640px this row already
            has the full content width and three unshrinkable buttons in it. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {filters.length > 0 ? (
            <Button
              type="button"
              variant={activeFilterCount ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className="h-11"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              {t("Filters")}
              {activeFilterCount ? (
                <span className="ml-2 rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground tabular">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-11">
                <Columns3 className="mr-2 h-4 w-4" />
                {t("Columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{t("Show columns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={!hidden.has(column.id)}
                  onCheckedChange={(next) =>
                    setHidden((current) => {
                      const set = new Set(current);
                      if (next) set.delete(column.id);
                      else set.add(column.id);
                      return set;
                    })
                  }
                  // Never let the user hide every column.
                  disabled={!hidden.has(column.id) && visibleColumns.length === 1}
                >
                  {column.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {toolbar}
        </div>
      </div>

      {/* Filter row */}
      <AnimatePresence initial={false}>
        {showFilters && filters.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="panel-inset flex flex-wrap items-end gap-3 p-3">
              {filters.map((filter) => (
                <div key={filter.id} className="min-w-[160px] flex-1 space-y-1.5">
                  <label
                    htmlFor={`filter-${filter.id}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {filter.label}
                  </label>
                  <NativeSelect
                    id={`filter-${filter.id}`}
                    value={filterValues[filter.id] ?? ""}
                    onChange={(e) =>
                      setFilterValues((current) => ({
                        ...current,
                        [filter.id]: e.target.value,
                      }))
                    }
                    className="h-11"
                  >
                    <option value="">{t("All")}</option>
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
              {activeFilterCount ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterValues({})}
                >
                  {t("Clear all")}
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Bulk action bar */}
      <AnimatePresence initial={false}>
        {bulkActions && selectedRows.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/40 bg-brand/5 px-4 py-2.5"
          >
            <p className="text-sm font-medium tabular">
              {selectedRows.length} selected
            </p>
            <div className="flex items-center gap-2">
              {bulkActions(selectedRows, () => setSelected(new Set()))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                {t("Clear")}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Empty */}
      {filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? t("Nothing to show")}
          description={emptyDescription}
          action={
            query || activeFilterCount ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilterValues({});
                }}
              >
                {t("Clear search and filters")}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          {renderCard ? (
            <ul className="space-y-3 md:hidden">
              {pageRows.map((row) => (
                <li key={getRowId(row)}>{renderCard(row)}</li>
              ))}
            </ul>
          ) : null}

          {/* Desktop table */}
          <div
            className={cn(
              "panel overflow-hidden",
              renderCard && "hidden md:block"
            )}
          >
            <div className="relative max-h-[70vh] overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                  <tr className="border-b">
                    {bulkActions ? (
                      <th className="w-10 px-3 py-2.5">
                        <Checkbox
                          checked={allOnPageSelected}
                          indeterminate={!allOnPageSelected && someOnPageSelected}
                          onChange={toggleAllOnPage}
                          aria-label={t("Select all rows on this page")}
                        />
                      </th>
                    ) : null}

                    {visibleColumns.map((column) => {
                      const sortable = Boolean(column.sortValue);
                      const active = sort?.columnId === column.id;
                      return (
                        <th
                          key={column.id}
                          scope="col"
                          aria-sort={
                            active
                              ? sort!.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                          className={cn(
                            "h-10 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                            ALIGN[column.align ?? "left"],
                            column.hideBelow && HIDE_BELOW[column.hideBelow],
                            column.className
                          )}
                        >
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSort((current) =>
                                  current?.columnId === column.id
                                    ? {
                                        columnId: column.id,
                                        direction:
                                          current.direction === "asc"
                                            ? "desc"
                                            : "asc",
                                      }
                                    : { columnId: column.id, direction: "asc" }
                                )
                              }
                              className={cn(
                                "focus-ring -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground",
                                active && "text-foreground"
                              )}
                            >
                              {column.header}
                              {active ? (
                                <ChevronDown
                                  className={cn(
                                    "h-3.5 w-3.5 transition-transform",
                                    sort!.direction === "asc" && "rotate-180"
                                  )}
                                />
                              ) : (
                                <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                              )}
                            </button>
                          ) : (
                            column.header
                          )}
                        </th>
                      );
                    })}

                    {renderExpanded ? <th className="w-10" /> : null}
                  </tr>
                </thead>

                <tbody>
                  {pageRows.map((row) => {
                    const id = getRowId(row);
                    const isOpen = expanded.has(id);
                    const isSelected = selected.has(id);
                    const href = rowHref?.(row);
                    return (
                      <React.Fragment key={id}>
                        <tr
                          onClick={
                            href
                              ? (event) => {
                                  // Anything the row already contains keeps its
                                  // own behaviour: a link inside a row must go
                                  // where the link says, a checkbox must tick.
                                  if (
                                    (event.target as HTMLElement).closest(
                                      "a, button, input, label, select, textarea"
                                    )
                                  ) {
                                    return;
                                  }
                                  // Somebody reading a long description drags
                                  // across it and lets go — that is a
                                  // selection, not a request to navigate.
                                  if (window.getSelection()?.toString()) return;
                                  router.push(href);
                                }
                              : undefined
                          }
                          className={cn(
                            "border-b transition-colors hover:bg-muted/40",
                            href && "cursor-pointer",
                            isSelected && "bg-brand/5"
                          )}
                        >
                          {bulkActions ? (
                            <td className="px-3 py-3">
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleRow(id)}
                                aria-label={t("Select row")}
                              />
                            </td>
                          ) : null}

                          {visibleColumns.map((column) => (
                            <td
                              key={column.id}
                              className={cn(
                                "px-3 py-3 align-middle",
                                ALIGN[column.align ?? "left"],
                                column.hideBelow && HIDE_BELOW[column.hideBelow],
                                column.className
                              )}
                            >
                              {column.cell(row)}
                            </td>
                          ))}

                          {renderExpanded ? (
                            <td className="px-2 py-3">
                              <IconHint
                                label={
                                  isOpen
                                    ? t("Hide the details")
                                    : t("Show the details")
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(id)}
                                  aria-expanded={isOpen}
                                  aria-label={
                                    isOpen ? t("Collapse row") : t("Expand row")
                                  }
                                  className="focus-ring rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  <ChevronRight
                                    className={cn(
                                      "h-4 w-4 transition-transform duration-200",
                                      isOpen && "rotate-90"
                                    )}
                                  />
                                </button>
                              </IconHint>
                            </td>
                          ) : null}
                        </tr>

                        {renderExpanded && isOpen ? (
                          <tr className="border-b bg-muted/25">
                            <td colSpan={colSpan} className="px-4 py-4">
                              {renderExpanded(row)}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground tabular">
              {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} of{" "}
              {filtered.length.toLocaleString()}
              {filtered.length !== rows.length
                ? ` (filtered from ${rows.length.toLocaleString()})`
                : ""}
            </p>

            {pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("Previous")}
                </Button>
                <span className="text-xs text-muted-foreground tabular">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  {t("Next")}
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
