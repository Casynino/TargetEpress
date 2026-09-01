"use client";

import { useEffect, useRef, useState } from "react";
import { Bluetooth, Loader2, Printer } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { testLabel, toPrinterBytes } from "@/lib/tspl";

/**
 * Can the app drive this printer itself?
 *
 * Guangzhou wants one tap: press Print, paper comes out. Everything else has
 * been tried and refused — Android had no print service for the XP-420B, and
 * the vendor's own app means downloading a PDF, leaving our app and opening
 * another, which the desk rightly calls 很麻烦.
 *
 * The last route is for the page to talk to the printer directly. A browser can
 * do that, but only over Bluetooth LOW ENERGY: a Bluetooth Classic printer is
 * refused by the operating system before any of our code runs. Nothing in
 * Xprinter's documentation says which this is.
 *
 * So this asks the printer, in two steps, and each answers a different
 * question. SEARCH answers "is it Low Energy" — if it appears in the chooser it
 * is. TEST PRINT answers "does it understand us" — the label machines speak
 * TSPL rather than the receipt language, and being able to connect is not the
 * same as being understood. Paper coming out of the slot is the only proof that
 * counts, and it is what decides whether the real thing gets built.
 */

/**
 * The serial-over-BLE services these boards are usually found behind.
 *
 * A GATT service cannot be read unless it was named up front, so a printer that
 * connects but reports nothing is indistinguishable from one that is empty.
 * 18f0 and ff00 cover most Chinese ESC/POS and TSPL boards, ffe0 is the HM-10
 * module, and the last is Nordic's UART.
 */
const CANDIDATE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff80-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
];

/* The Web Bluetooth surface this page touches, and no more of it. Not in the
   DOM library on this TypeScript version. */
type Characteristic = {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  writeValue?(value: BufferSource): Promise<void>;
};
type Service = {
  uuid: string;
  getCharacteristics(): Promise<Characteristic[]>;
};
type Device = {
  name?: string;
  id: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryServices(): Promise<Service[]> }>;
    disconnect(): void;
  };
};

type Probe = { kind: "found" | "absent" | "error"; lines: string[] };
type PrintState = { kind: "sent" | "error"; lines: string[] };

/**
 * BLE hands over about twenty bytes at a time by default, and a printer that is
 * written to faster than it drains simply drops the overflow — which prints as
 * a label with its bottom half missing. A hundred bytes with a breath between
 * them is slow and arrives whole, and a test label is under a kilobyte.
 */
const CHUNK = 100;

export function PrinterProbe() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [result, setResult] = useState<Probe | null>(null);
  const [printed, setPrinted] = useState<PrintState | null>(null);
  /* Held so Test print does not send the reader back through the chooser. */
  const device = useRef<Device | null>(null);

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
      (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
    setSupport(isApple ? "ios" : "no");
  }, []);

  async function scan() {
    setBusy(true);
    setResult(null);
    setPrinted(null);
    try {
      const bluetooth = (
        navigator as unknown as {
          bluetooth: { requestDevice(options: unknown): Promise<Device> };
        }
      ).bluetooth;

      const chosen = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICES,
      });
      device.current = chosen;

      const lines = [
        `${t("Printer")}: ${chosen.name ?? t("(no name)")}`,
        `ID: ${chosen.id}`,
      ];

      try {
        const server = await chosen.gatt!.connect();
        const services = await server.getPrimaryServices();
        lines.push(
          `${t("Connected — services found")}: ${services.length}`,
          ...services.map((s) => `• ${s.uuid}`)
        );
        chosen.gatt!.disconnect();
      } catch {
        /* Appearing in the list already proves Low Energy; failing to open it
           is usually the printer being held by the vendor's app. Worth saying,
           not worth calling a failure — Test print will say for certain. */
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

  /** The first characteristic on the device that will accept bytes. */
  async function findWriter(dev: Device) {
    const server = await dev.gatt!.connect();
    for (const service of await server.getPrimaryServices()) {
      for (const characteristic of await service.getCharacteristics()) {
        const { write, writeWithoutResponse } = characteristic.properties;
        if (write || writeWithoutResponse) {
          return { characteristic, where: `${service.uuid} / ${characteristic.uuid}` };
        }
      }
    }
    return null;
  }

  async function testPrint() {
    const dev = device.current;
    if (!dev) return;
    setPrinting(true);
    setPrinted(null);
    try {
      const writer = await findWriter(dev);
      if (!writer) {
        setPrinted({
          kind: "error",
          lines: [t("It connected, but there is no channel on it that accepts printing.")],
        });
        return;
      }

      const bytes = toPrinterBytes(testLabel("TX-PRINTER-TEST"));
      const { characteristic } = writer;
      for (let at = 0; at < bytes.length; at += CHUNK) {
        const slice = bytes.slice(at, at + CHUNK);
        if (characteristic.properties.writeWithoutResponse) {
          await characteristic.writeValueWithoutResponse!(slice);
        } else if (characteristic.writeValueWithResponse) {
          await characteristic.writeValueWithResponse(slice);
        } else {
          await characteristic.writeValue!(slice);
        }
        await new Promise((done) => setTimeout(done, 20));
      }

      dev.gatt!.disconnect();
      setPrinted({
        kind: "sent",
        lines: [
          `${t("Sent")}: ${bytes.length} bytes`,
          `${t("Channel")}: ${writer.where}`,
        ],
      });
    } catch (error) {
      setPrinted({
        kind: "error",
        lines: [String((error as { message?: string })?.message ?? error)],
      });
    } finally {
      setPrinting(false);
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
        <div className="space-y-3 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
          <p className="font-medium">{t("The printer was found.")}</p>
          <div className="space-y-0.5 font-mono text-xs">
            {result.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          {/* Being able to connect is not the same as being understood. This is
              the only proof that counts, and it costs one label. */}
          <p className="text-muted-foreground">
            {t("Now press this. One test label should come out of the printer.")}
          </p>
          <button
            type="button"
            onClick={testPrint}
            disabled={printing}
            className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-brand px-5 text-sm font-semibold hover:bg-brand/10 disabled:opacity-60"
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            {t("Print a test label")}
          </button>
        </div>
      ) : null}

      {printed?.kind === "sent" ? (
        <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
          <p className="font-medium">
            {t("Sent to the printer. Did a label come out? Send a photo either way.")}
          </p>
          <div className="mt-2 space-y-0.5 font-mono text-xs">
            {printed.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}

      {printed?.kind === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{t("It could not be printed to.")}</p>
          <p className="mt-1 font-mono text-xs">{printed.lines[0]}</p>
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
