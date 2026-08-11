"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2, TriangleAlert } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Preview = { id: string; url: string; name: string; sizeMb: string };

/**
 * Cargo photo capture.
 *
 * Two separate inputs on purpose. `capture="environment"` opens the rear camera
 * straight away, which is what a clerk holding a phone over a carton wants; the
 * second is a plain file picker for a desktop with photos already on disk.
 * One combined input gives Android an ambiguous chooser every single time.
 *
 * The file input is left in the DOM (visually hidden) rather than being
 * re-created, so the FormData the parent form submits always carries the files.
 */

/**
 * Shrink a photo in the browser before it is ever sent.
 *
 * The reason is a hard platform limit, not a preference: a Vercel serverless
 * function refuses a request body over 4.5 MB, and no config raises it. A
 * modern phone photo is 3-8 MB, so releasing cargo with a handover photo
 * failed in production with "Something went wrong" while working perfectly on
 * a laptop — the request never reached the action, which is why nothing was
 * saved and no error of ours was ever shown.
 *
 * 1600px on the long edge at 82% JPEG is 200-600 KB. That is far inside the
 * limit, uploads in a second on the mobile data this business actually runs on,
 * and is still more resolution than a proof-of-condition photo needs — you can
 * read a carton label and see a torn corner.
 *
 * It also converts HEIC to JPEG on the way through: iPhones hand over HEIC,
 * which most Android phones and Windows machines cannot display. A proof
 * photograph nobody can open is not proof.
 *
 * If anything here fails — an exotic format, a browser without canvas — the
 * original file is used. A slightly-too-big photo that might fail beats no
 * photo at all, and the server still enforces its own limit.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function PhotoCapture({
  name = "photos",
  required = false,
  max = 4,
  label = "Cargo photos",
  hint,
  durable = true,
}: {
  name?: string;
  required?: boolean;
  max?: number;
  label?: string;
  hint?: string;
  /** False when storage is local disk — say so rather than imply permanence. */
  durable?: boolean;
}) {
  const t = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);

  /** Keeps one authoritative FileList across both inputs. */
  const filesRef = useRef<File[]>([]);

  function sync() {
    // Rebuild a DataTransfer so the camera input holds the full set; that is
    // the input whose name the form submits.
    const transfer = new DataTransfer();
    for (const file of filesRef.current) transfer.items.add(file);
    if (cameraRef.current) cameraRef.current.files = transfer.files;
    if (libraryRef.current) libraryRef.current.value = "";

    setPreviews(
      filesRef.current.map((file, index) => ({
        id: `${index}-${file.name}-${file.size}`,
        url: URL.createObjectURL(file),
        name: file.name || `photo-${index + 1}.jpg`,
        sizeMb: (file.size / 1024 / 1024).toFixed(1),
      }))
    );
  }

  const [working, setWorking] = useState(false);

  async function add(incoming: FileList | null) {
    if (!incoming) return;
    const room = max - filesRef.current.length;
    if (room <= 0) return;

    setWorking(true);
    try {
      const shrunk = await Promise.all(
        Array.from(incoming).slice(0, room).map(shrink)
      );
      filesRef.current = [...filesRef.current, ...shrunk];
      sync();
    } finally {
      setWorking(false);
    }
  }

  function remove(index: number) {
    filesRef.current = filesRef.current.filter((_, i) => i !== index);
    sync();
  }

  const full = previews.length >= max;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {t(label)}
          {required ? <span className="ml-1 text-signal">*</span> : null}
        </p>
        <p className="text-xs text-muted-foreground tabular">
          {previews.length} / {max}
        </p>
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{t(hint)}</p> : null}

      {/* Real inputs, hidden but present so the form submits their files. */}
      <input
        ref={cameraRef}
        type="file"
        name={name}
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => add(e.target.files)}
        // `required` on the input would fire before our own check and give a
        // browser-default message; the server enforces it regardless.
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => add(e.target.files)}
        aria-hidden
        tabIndex={-1}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="signal"
          size="sm"
          disabled={full || working}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="mr-2 h-4 w-4" />
          {working ? t("Preparing…") : t("Take photo")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full || working}
          onClick={() => libraryRef.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          {t("Choose file")}
        </Button>
      </div>

      {previews.length === 0 ? (
        <div
          className={cn(
            "rounded-lg border border-dashed p-6 text-center",
            required ? "border-signal/40 bg-signal/5" : "bg-muted/20"
          )}
        >
          <Camera className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium">
            {required ? t("A photo is required") : t("No photos yet")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Photograph the cargo as it sits, before it is packed.")}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previews.map((preview, index) => (
            <li key={preview.id} className="group relative">
              {/* Object URLs are local blobs; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={`${t("Cargo photo")} ${index + 1}`}
                className="aspect-square w-full rounded-lg border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="focus-ring absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1.5 text-destructive opacity-0 shadow-soft transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`${t("Remove photo")} ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <p className="mt-1 truncate text-[10px] text-muted-foreground tabular">
                {preview.sizeMb} MB
              </p>
            </li>
          ))}
        </ul>
      )}

      {!durable ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t(
              "Photos are being saved to this machine's disk. Set BLOB_READ_WRITE_TOKEN before deploying, or uploads will not survive."
            )}
          </span>
        </p>
      ) : null}
    </div>
  );
}
