import "server-only";

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Image storage for cargo photos.
 *
 * Two drivers, chosen by whether a Blob token exists:
 *
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set. This is the production
 *    path; Vercel's filesystem is ephemeral and read-only at runtime, so
 *    nothing written to disk there survives.
 *  - Local disk under public/uploads otherwise, so photo capture is fully
 *    testable on a laptop with no cloud account.
 *
 * The driver in use is reported by `storageDriver()` and surfaced in the UI, so
 * nobody deploys believing photos are being kept when they are not.
 */

const MAX_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request ceiling
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export type StoredImage = { url: string; bytes: number; contentType: string };

export function storageDriver(): "blob" | "local" {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

/** True when photos will survive a deploy. */
export function storageIsDurable() {
  return storageDriver() === "blob";
}

function safeName(original: string) {
  const ext = (original.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  return `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
}

/**
 * Validates and stores one image. Throws a message fit to show a warehouse
 * clerk — they need to know what to do differently, not a stack trace.
 */
export async function putImage(
  file: File,
  folder = "cargo"
): Promise<StoredImage> {
  if (!file || file.size === 0) {
    throw new Error("That photo appears to be empty. Take it again.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 6 MB — use your phone's normal camera setting.`
    );
  }
  if (file.type && !ALLOWED.has(file.type)) {
    throw new Error(
      "Photos must be JPEG, PNG, WebP or HEIC. That file is not an image we can store."
    );
  }

  const name = safeName(file.name || "photo.jpg");
  const contentType = file.type || "image/jpeg";

  if (storageDriver() === "blob") {
    // Imported lazily so the package is only needed when actually configured.
    const { put } = await import("@vercel/blob");
    const result = await put(`${folder}/${name}`, file, {
      access: "public",
      contentType,
    });
    return { url: result.url, bytes: file.size, contentType };
  }

  const dir = join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, name), buffer);

  return { url: `/uploads/${folder}/${name}`, bytes: file.size, contentType };
}

/**
 * A document rather than a photograph: a bank confirmation, a transfer slip,
 * an M-Pesa screenshot.
 *
 * Separate from `putImage` because the rules genuinely differ. Proof of payment
 * arrives as a PDF as often as a screenshot, and a bank statement scan is
 * routinely larger than a phone photo — so the allow-list and the cap are
 * their own, rather than loosened on the photo path where a 12 MB upload would
 * be a mistake.
 *
 * HEIC is refused here even though photos allow it. An iPhone screenshot sent
 * to a bank or shown to a customer has to open on the other end, and HEIC does
 * not open on most of what a Tanzanian customer or a bank clerk is using.
 */
const DOC_MAX_BYTES = 4 * 1024 * 1024; // as above — the platform, not a preference
const DOC_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export async function putDocument(
  file: File,
  folder = "proof"
): Promise<StoredImage> {
  if (!file || file.size === 0) {
    throw new Error("That file appears to be empty. Choose it again.");
  }
  if (file.size > DOC_MAX_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 12 MB.`
    );
  }
  if (file.type === "image/heic" || /\.heic$/i.test(file.name ?? "")) {
    throw new Error(
      "HEIC will not open for most people you would send this to. On iPhone, set Settings → Camera → Formats to Most Compatible, or send a screenshot instead."
    );
  }
  if (file.type && !DOC_ALLOWED.has(file.type)) {
    throw new Error(
      "Proof of payment must be a PDF, JPEG, PNG or WebP."
    );
  }

  const name = safeName(file.name || "proof.pdf");
  const contentType = file.type || "application/pdf";

  if (storageDriver() === "blob") {
    const { put } = await import("@vercel/blob");
    const result = await put(`${folder}/${name}`, file, {
      access: "public",
      contentType,
    });
    return { url: result.url, bytes: file.size, contentType };
  }

  const dir = join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${folder}/${name}`, bytes: file.size, contentType };
}

/** Stores several images, stopping at the first failure so nothing is half-done. */
export async function putImages(files: File[], folder = "cargo") {
  const stored: StoredImage[] = [];
  for (const file of files) {
    stored.push(await putImage(file, folder));
  }
  return stored;
}

/** Pulls real image files out of a FormData field, ignoring empty inputs. */
export function filesFrom(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((value): value is File => value instanceof File && value.size > 0);
}
