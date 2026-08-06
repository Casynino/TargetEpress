"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, Plus, RotateCcw, X } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  publishRule,
  revisePrice,
  setProductActive,
  withdrawRule,
} from "@/lib/actions/pricing";

export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  route: string | null;
  active: boolean;
  /** Live prices covering this product specifically. */
  ruleCount: number;
};

export type AdminRule = {
  id: string;
  category: string;
  productName: string | null;
  method: string;
  price: string;
  currency: string;
  minWeightKg: string | null;
  maxWeightKg: string | null;
  minChargeableKg: string | null;
  minCharge: string | null;
  notes: string | null;
  effectiveFrom: string;
  active: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  NORMAL_GOODS: "Normal goods",
  ELECTRONICS: "Electronics",
  LIQUID_SPECIAL: "Special goods",
};

const ROUTE_LABEL: Record<string, string> = {
  GUANGZHOU: "Guangzhou",
  HONG_KONG: "Hong Kong",
};

function tierLabel(rule: AdminRule) {
  if (rule.method === "FIXED_PER_ITEM") return "Any weight";
  const min = rule.minWeightKg ? `${Number(rule.minWeightKg)} kg` : null;
  const max = rule.maxWeightKg ? `${Number(rule.maxWeightKg)} kg` : null;
  if (min && max) return `${min} – under ${max}`;
  if (min) return `${min} and above`;
  if (max) return `Under ${max}`;
  return "All weights";
}

function priceLabel(rule: AdminRule) {
  const unit = rule.method === "WEIGHT_BASED" ? "/kg" : " per item";
  return `${rule.currency} ${Number(rule.price).toFixed(2)}${unit}`;
}

/* -------------------------------------------------------------- price book */

export function RateBook({ rules }: { rules: AdminRule[] }) {
  const [category, setCategory] = useState<string>("ALL");
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Change a live price. A withdrawal and a fresh publication underneath. */
  const save = (rule: AdminRule) => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }
    if (next === Number(rule.price)) {
      setEditing(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const body = new FormData();
      body.set("ruleId", rule.id);
      body.set("price", String(next));
      const result = await revisePrice(undefined, body);
      if (!result.ok) setError(result.error);
      else setEditing(null);
    });
  };

  const visible = useMemo(
    () =>
      rules.filter(
        (rule) =>
          (category === "ALL" || rule.category === category) &&
          (showWithdrawn || rule.active)
      ),
    [rules, category, showWithdrawn]
  );

  const withdraw = (rule: AdminRule) => {
    setError(null);
    startTransition(async () => {
      const result = await withdrawRule(rule.id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Published prices</h2>
          <p className="text-sm text-muted-foreground">
            Every quote in the system comes from this table. Nothing is hardcoded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label="Filter by category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 w-auto"
          >
            <option value="ALL">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant={showWithdrawn ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowWithdrawn((v) => !v)}
          >
            {showWithdrawn ? "Hiding nothing" : "Show withdrawn"}
          </Button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="border-b bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Applies to</th>
              <th className="p-3 font-medium">Tier</th>
              <th className="p-3 font-medium">Price</th>
              <th className="hidden p-3 font-medium lg:table-cell">Floor</th>
              <th className="hidden p-3 font-medium md:table-cell">Since</th>
              <th className="p-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((rule) => (
              <tr key={rule.id} className="border-t align-top">
                <td className="p-3">
                  <div className="font-medium">
                    {rule.productName ?? `Every ${CATEGORY_LABEL[rule.category] ?? rule.category}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {CATEGORY_LABEL[rule.category] ?? rule.category}
                    {rule.productName ? "" : " — catch-all"}
                  </div>
                  {rule.notes ? (
                    <div className="mt-1 text-xs text-muted-foreground">{rule.notes}</div>
                  ) : null}
                </td>
                <td className="p-3 whitespace-nowrap">{tierLabel(rule)}</td>
                {/* The price is the thing people come here to change, so it is
                    editable where it is read. Saving withdraws this rule and
                    publishes a new one underneath, so the rate book can still
                    answer "what were we charging in March". */}
                <td className="p-3 whitespace-nowrap font-mono font-medium tabular-nums">
                  {editing === rule.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {rule.currency}
                      </span>
                      <input
                        autoFocus
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") save(rule);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="focus-ring h-8 w-24 rounded-md border bg-background px-2 text-sm tabular-nums"
                        aria-label="New price"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="brand"
                        disabled={pending}
                        onClick={() => save(rule)}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </span>
                  ) : rule.active ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(rule.id);
                        setDraft(rule.price);
                      }}
                      className="focus-ring rounded-md px-1 underline decoration-dotted underline-offset-4 hover:text-brand"
                      title="Change this price"
                    >
                      {priceLabel(rule)}
                    </button>
                  ) : (
                    priceLabel(rule)
                  )}
                </td>
                <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                  {rule.minChargeableKg ? `min ${Number(rule.minChargeableKg)} kg` : null}
                  {rule.minChargeableKg && rule.minCharge ? " · " : null}
                  {rule.minCharge ? `min ${rule.currency} ${Number(rule.minCharge)}` : null}
                  {!rule.minChargeableKg && !rule.minCharge ? "—" : null}
                </td>
                <td className="hidden p-3 whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                  {new Date(rule.effectiveFrom).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="p-3 text-right">
                  {rule.active ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => withdraw(rule)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Withdraw
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Withdrawn
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  No prices match that filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ publish form */

export function PublishPriceForm({ products }: { products: AdminProduct[] }) {
  const [state, action] = useActionState(publishRule, undefined);
  const [category, setCategory] = useState("NORMAL_GOODS");
  const [method, setMethod] = useState("WEIGHT_BASED");
  const [productId, setProductId] = useState("");
  const [open, setOpen] = useState(false);

  // Arriving from "this product cannot be quoted".
  //
  // The warning named the problem and then left somebody to find this form,
  // pick the right category and hunt the product out of thirty-one. It now
  // links straight here with the product chosen, so the only thing left to
  // supply is the figure — which is the only thing the warning was ever
  // actually asking for.
  const params = useSearchParams();
  const wanted = params.get("price");
  useEffect(() => {
    if (!wanted) return;
    const product = products.find((p) => p.id === wanted);
    if (!product) return;
    setCategory(product.category);
    setProductId(product.id);
    setOpen(true);
  }, [wanted, products]);

  // Controlled on purpose: publishing a tier usually means publishing its
  // neighbour straight after, and a form that empties itself makes that tedious.
  const inCategory = products.filter((p) => p.active && p.category === category);

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Publish a price</h2>
          <p className="text-sm text-muted-foreground">
            Takes effect on the next quote. Invoices already raised keep theirs.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "ghost" : "default"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : <><Plus className="mr-1 h-4 w-4" />New price</>}
        </Button>
      </header>

      {open ? (
        <form action={action} className="space-y-4 p-4">
          <FormError state={state} />
          {state?.ok ? (
            <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              Price published. It applies to every quote from now on.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-category">Cargo category</Label>
              <NativeSelect
                id="rule-category"
                name="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setProductId("");
                }}
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-method">How it is charged</Label>
              <NativeSelect
                id="rule-method"
                name="method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="WEIGHT_BASED">Per kilogram</option>
                <option value="FIXED_PER_ITEM">Fixed price per item</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-product">Product</Label>
              <NativeSelect
                id="rule-product"
                name="cargoTypeId"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">
                  Every {CATEGORY_LABEL[category]?.toLowerCase()} — catch-all
                </option>
                {inCategory.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {method === "FIXED_PER_ITEM"
                  ? "A per-item price must name one product."
                  : "A catch-all covers anything in the category without its own price."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-price">
                Price in USD {method === "WEIGHT_BASED" ? "per kg" : "per item"}
              </Label>
              <Input
                id="rule-price"
                name="price"
                inputMode="decimal"
                placeholder={method === "WEIGHT_BASED" ? "13.50" : "45"}
                required
              />
            </div>

            {method === "WEIGHT_BASED" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-min">From (kg)</Label>
                    <Input id="rule-min" name="minWeightKg" inputMode="decimal" placeholder="10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-max">Under (kg)</Label>
                    <Input id="rule-max" name="maxWeightKg" inputMode="decimal" placeholder="—" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-minkg">Minimum billable kg</Label>
                    <Input
                      id="rule-minkg"
                      name="minChargeableKg"
                      inputMode="decimal"
                      placeholder="optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-mincharge">Minimum charge (USD)</Label>
                    <Input
                      id="rule-mincharge"
                      name="minCharge"
                      inputMode="decimal"
                      placeholder="optional"
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-notes">Note (shown on the quote)</Label>
              <Input id="rule-notes" name="notes" placeholder="e.g. 10 kg and above" />
            </div>
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Publishing supersedes any live price covering the same product and
            tier, so there is only ever one answer to &ldquo;what does this
            cost&rdquo;. The old price stays readable for old invoices.
          </p>

          <SubmitButton pendingLabel="Publishing…">Publish price</SubmitButton>
        </form>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- products */

export function ProductCatalogue({ products }: { products: AdminProduct[] }) {
  const [state, action] = useActionState(createProduct, undefined);
  const [category, setCategory] = useState("NORMAL_GOODS");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (product: AdminProduct) => {
    setError(null);
    startTransition(async () => {
      const result = await setProductActive(product.id, !product.active);
      if (!result.ok) setError(result.error);
    });
  };

  const grouped = Object.keys(CATEGORY_LABEL).map((key) => ({
    key,
    label: CATEGORY_LABEL[key],
    items: products.filter((p) => p.category === key),
  }));

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="border-b p-4">
        <h2 className="font-semibold">Products</h2>
        <p className="text-sm text-muted-foreground">
          What the China desk can pick from, and what customers see in the
          calculator. A product with no price still cannot be quoted.
        </p>
      </header>

      <form action={action} className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="product-name" className="text-xs">
            Product name
          </Label>
          <Input id="product-name" name="name" placeholder="e.g. Drones" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-category" className="text-xs">
            Category
          </Label>
          <NativeSelect
            id="product-category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-route" className="text-xs">
            Ships from
          </Label>
          <NativeSelect
            id="product-route"
            name="route"
            defaultValue={category === "NORMAL_GOODS" ? "GUANGZHOU" : "HONG_KONG"}
            key={category}
          >
            <option value="GUANGZHOU">Guangzhou</option>
            <option value="HONG_KONG">Hong Kong</option>
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <SubmitButton pendingLabel="Adding…" variant="secondary">
            Add product
          </SubmitButton>
        </div>

        <div className="sm:col-span-4">
          <Label htmlFor="product-keywords" className="text-xs">
            Match words on packing lists (optional, comma separated — Chinese welcome)
          </Label>
          <Textarea
            id="product-keywords"
            name="keywords"
            rows={2}
            placeholder="drone,无人机,quadcopter"
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-4">
          <FormError state={state} />
        </div>
      </form>

      {error ? (
        <p role="alert" className="border-b bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="divide-y">
        {grouped.map((group) => (
          <div key={group.key} className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
              <span className="ml-2 font-normal normal-case tracking-normal">
                {group.items.filter((i) => i.active).length} active
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {group.items.map((product) => (
                <div
                  key={product.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    product.active ? "bg-background" : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span className={product.active ? "" : "line-through"}>{product.name}</span>
                  {product.route ? (
                    <span className="text-xs text-muted-foreground">
                      {ROUTE_LABEL[product.route] ?? product.route}
                    </span>
                  ) : null}
                  {product.active && product.ruleCount === 0 ? (
                    <Badge variant="outline" className="border-warning/40 text-warning">
                      no own price
                    </Badge>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(product)}
                    title={product.active ? "Archive" : "Restore"}
                    aria-label={`${product.active ? "Archive" : "Restore"} ${product.name}`}
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    {product.active ? (
                      <Archive className="h-3.5 w-3.5" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here yet.</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
