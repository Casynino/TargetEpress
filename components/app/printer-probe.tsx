"use client";

import { useEffect, useState } from "react";
import { Bluetooth, Loader2 } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * Does this printer speak a language the browser can speak?
 *
 * One question, asked once. A browser can only reach Bluetooth LOW ENERGY
 * devices; the cheap desktop label printers are usually Bluetooth Classic
 * (SPP), which no browser can open at any price. The XP-420B's manual does not
 * say which it is, and the answer decides whether "Print" can ever drive the
 * printer directly or must always go out through a PDF and the vendor's app.
 *
 * So rather than guess, the desk holding the printer presses one button. If the
 * printer appears in the chooser it is Low Energy and direct printing is
 * buildable; if the list comes up without it, it is Classic and it never will
 * be. Either answer is worth a minute of Guangzhou's time.
 *
 * This scans and reports. It deliberately sends nothing to the printer — a
 * probe that could also print would be a half-built feature nobody asked for
 * yet, and the wrong bytes at a thermal head waste a roll.
 */

/**
 * The serial-over-BLE services these printers are usually found behind.
 *
 * A GATT service cannot be read unless it was named up front, so a device that
 * connects but reports nothing is indistinguishable from one that is empty.
 * This list is the common ones — 18f0 and ff00 cover most Chinese ESC/POS and
 * TSPL boards, ffe0 is the HM-10 module, and the last is Nordic's UART.
 */
const CANDIDATE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff80-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
];

type Probe = { kind: "found" | "absent" | "error"; lines: string[] };

export function PrinterProbe() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Probe | null>(null);
  /* Read after mount, never during render: the server has no navigator, and a
     value that differs between the two is a hydration error.

     Three answers, not two. "This browser cannot" sent the owner to install
     Chrome on an iPhone, which cannot work and never will: every browser on
     iOS is Safari's engine in someone else's coat, and none of them carries
     Web Bluetooth. Telling somebody to try again on a device that is
     incapable is worse than telling them nothing. */
  const [support, setSupport] = useState<"yes" | "ios" | "no" | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if ("bluetooth" in navigator) {
      setSupport("yes");
      return;
    }
    const ua = navigator.userAgent ?? "";
    const isApple =
      /iPad|iPhone|iPod/.test(ua) ||
      /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
    setSupport(isApple ? "ios" : "no");
  }, []);

  async function scan() {
    setBusy(true);
    setResult(null);
    try {
      /* Not in TypeScript's DOM library on this version. The shape used here is
         the whole of the Web Bluetooth surface this page touches. */
      const bluetooth = (
        navigator as unknown as {
          bluetooth: {
            requestDevice(options: unknown): Promise<{
              name?: string;
              id: string;
              gatt?: {
                connect(): Promise<{
                  getPrimaryServices(): Promise<{ uuid: string }[]>;
                  disconnect(): void;
                }>;
              };
            }>;
          };
        }
      ).bluetooth;

      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICES,
      });

      const lines = [
        `${t("Printer")}: ${device.name ?? t("(no name)")}`,
        `ID: ${device.id}`,
      ];

      try {
        const server = await device.gatt!.connect();
        const services = await server.getPrimaryServices();
        lines.push(
          `${t("Connected — services found")}: ${services.length}`,
          ...services.map((s) => `• ${s.uuid}`)
        );
        server.disconnect();
      } catch {
        /* Appearing in the list already proves Low Energy; failing to open it
           is usually the printer being held by the vendor's app. Worth saying,
           not worth calling a failure. */
        lines.push(t("It was seen but would not open a connection."));
      }

      setResult({ kind: "found", lines });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "NotFoundError") {
        /* Covers both "nothing appeared" and "the chooser was dismissed", which
           the browser does not tell apart. The wording asks the reader which. */
        setResult({ kind: "absent", lines: [] });
      } else {
        setResult({
          kind: "error",
          lines: [String((error as { message?: string })?.message ?? error)],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Bluetooth className="h-5 w-5" />
          {t("Bluetooth printer test")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Turn the printer on, then press the button. A list of nearby devices will appear — choose the printer if you can see it."
          )}
        </p>
      </div>

      {support === "ios" ? (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          {t(
            "An iPhone or iPad cannot search for Bluetooth from any browser, Chrome included. Run this test on the Android phone."
          )}
        </p>
      ) : null}

      {support === "no" ? (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          {t(
            "This browser cannot search for Bluetooth devices. Open this page in Chrome on the Android phone."
          )}
        </p>
      ) : null}

      <button
        type="button"
        onClick={scan}
        disabled={busy || (support !== null && support !== "yes")}
        className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("Search for the printer")}
      </button>

      {result?.kind === "found" ? (
        <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
          <p className="font-medium">
            {t("The printer was found. Send this screen to the office.")}
          </p>
          <div className="mt-2 space-y-0.5 font-mono text-xs">
            {result.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}

      {result?.kind === "absent" ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          {t(
            "If the printer was not in the list, this printer cannot be driven by the app and labels must be printed from the printer's own app. Send this screen to the office either way."
          )}
        </p>
      ) : null}

      {result?.kind === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{t("The search stopped with an error.")}</p>
          <p className="mt-1 font-mono text-xs">{result.lines[0]}</p>
        </div>
      ) : null}
    </div>
  );
}
