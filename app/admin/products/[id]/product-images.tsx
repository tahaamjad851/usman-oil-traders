"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProductImageRow = { id: string; url: string; thumbUrl: string | null };

export function ProductImages({ productId, images }: { productId: string; images: ProductImageRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose an image file first.");
      return;
    }

    setIsUploading(true);
    const response = await fetch(`/api/products/${productId}/images`, { method: "POST", body: data });
    setIsUploading(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Unable to upload the image.");
      return;
    }

    form.reset();
    router.refresh();
  }

  async function onDelete(imageId: string) {
    if (!window.confirm("Remove this image?")) return;
    setDeletingId(imageId);
    await fetch(`/api/products/${productId}/images/${imageId}`, { method: "DELETE" });
    setDeletingId(undefined);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images yet.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {images.map((image) => (
            <div key={image.id} className="w-28 space-y-1">
              {/* Product images live in admin-configured external storage (S3-compatible) whose
                  domain isn't known ahead of time — see components/storefront/ProductCard.tsx. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.thumbUrl ?? image.url}
                alt=""
                className="h-28 w-28 rounded-md border object-cover"
              />
              <button
                type="button"
                onClick={() => onDelete(image.id)}
                disabled={deletingId === image.id}
                className="w-full text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3" onSubmit={onUpload}>
        <label className="block text-sm font-medium">
          Add an image (JPEG, PNG, or WebP)
          <input
            className="mt-1 rounded-md border bg-background px-3 py-2"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </label>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={isUploading}
          type="submit"
        >
          {isUploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
