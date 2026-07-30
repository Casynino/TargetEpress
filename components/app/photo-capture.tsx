"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2, TriangleAlert } from "lucide-react";

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

  function add(incoming: FileList | null) {
    if (!incoming) return;
    const room = max - filesRef.current.length;
    if (room <= 0) return;
    filesRef.current = [...filesRef.current, ...Array.from(incoming).slice(0, room)];
    sync();
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
          {label}
          {required ? <span className="ml-1 text-signal">*</span> : null}
        </p>
        <p className="text-xs text-muted-foreground tabular">
          {previews.length} / {max}
        </p>
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

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
          disabled={full}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="mr-2 h-4 w-4" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => libraryRef.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          Choose file
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
            {required ? "A photo is required" : "No photos yet"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Photograph the cargo as it sits, before it is packed.
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
                alt={`Cargo photo ${index + 1}`}
                className="aspect-square w-full rounded-lg border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="focus-ring absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1.5 text-destructive opacity-0 shadow-soft transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove photo ${index + 1}`}
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
            Photos are being saved to this machine&apos;s disk. Set
            BLOB_READ_WRITE_TOKEN before deploying, or uploads will not survive.
          </span>
        </p>
      ) : null}
    </div>
  );
}
