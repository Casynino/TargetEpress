"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitSourcingEnquiry } from "@/lib/actions/public-sourcing";

const TYPES = [
  { value: "FIND_PRODUCT", label: "Find me this product" },
  { value: "FIND_SUPPLIER", label: "Find me a supplier" },
  { value: "REQUEST_QUOTATION", label: "Get me a price" },
  { value: "VERIFY_SUPPLIER", label: "Check a supplier is real" },
  { value: "BUY_ON_BEHALF", label: "Buy it for me" },
];

export function SourcingForm() {
  const [state, action] = useActionState(submitSourcingEnquiry, undefined);

  if (state?.ok && state.data) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h2 className="mt-4 font-display text-xl font-bold">
          Tumeipokea. We have it.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your reference is{" "}
          <span className="font-mono font-semibold text-foreground">
            {state.data.requestNumber}
          </span>
          . Someone from our team will call you — quote that number when they do.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
      <FormError state={state} />

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Jina lako / Your name</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Namba ya simu / Phone</Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0688 887 784"
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="type">Unahitaji nini? / What do you need?</Label>
          <NativeSelect id="type" name="type" defaultValue="FIND_PRODUCT">
            {TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="product">Bidhaa / Product</Label>
          <Input
            id="product"
            name="product"
            placeholder="e.g. LED shop signs, 1.2 m"
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">
            Maelezo / Details — quantity, colour, quality
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            placeholder="The more you tell us, the closer the price we come back with."
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budgetUsd">
            Bajeti / Budget in USD{" "}
            <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input id="budgetUsd" name="budgetUsd" inputMode="decimal" placeholder="500" />
        </div>
      </div>

      <SubmitButton size="lg" variant="brand" className="rounded-xl" pendingLabel="Sending…">
        Send the request
      </SubmitButton>

      <p className="text-xs text-muted-foreground">
        We use your number to call you back about this request. Nothing else.
      </p>
    </form>
  );
}
