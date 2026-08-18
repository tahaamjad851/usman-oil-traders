import "server-only";

import sharp from "sharp";

import { prisma } from "@/lib/db";
import { requireRole, ValidationError } from "@/lib/auth/guard";
import { deleteFromStorage, storageKeyFromUrl, uploadToStorage } from "@/lib/storage";
import type { AuthContext } from "@/types/auth";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadableFile = { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

type ImageRecord = { id: string; productId: string; url: string; thumbUrl: string | null };

type ImageClient = {
  product: { findUniqueOrThrow: (args: { where: { id: string }; select?: unknown }) => Promise<{ id: string }> };
  productImage: {
    count: (args: { where: { productId: string } }) => Promise<number>;
    create: (args: { data: Record<string, unknown> }) => Promise<ImageRecord>;
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<ImageRecord>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export function assertValidImageUpload(file: Pick<UploadableFile, "type" | "size">): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new ValidationError("Unsupported image type. Use JPEG, PNG, or WebP.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new ValidationError("Image exceeds the 5MB limit.");
  }
}

export async function uploadProductImage(
  ctx: AuthContext,
  productId: string,
  file: UploadableFile,
  client: ImageClient = prisma as unknown as ImageClient,
) {
  requireRole(ctx, "SUPER_ADMIN");
  assertValidImageUpload(file);

  await client.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true } });

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageId = crypto.randomUUID();

  const [fullBuffer, thumbBuffer] = await Promise.all([
    sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    sharp(buffer).resize(300, 300, { fit: "cover" }).webp({ quality: 75 }).toBuffer(),
  ]);

  const [url, thumbUrl] = await Promise.all([
    uploadToStorage(`products/${productId}/${imageId}-full.webp`, fullBuffer, "image/webp"),
    uploadToStorage(`products/${productId}/${imageId}-thumb.webp`, thumbBuffer, "image/webp"),
  ]);

  const sortOrder = await client.productImage.count({ where: { productId } });

  const image = await client.productImage.create({
    data: { productId, url, thumbUrl, sortOrder },
  });

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "PRODUCT_IMAGE_UPLOADED",
      entityType: "Product",
      entityId: productId,
      newValue: { imageId: image.id },
      ipAddress: ctx.ip,
    },
  });

  return image;
}

export async function deleteProductImage(
  ctx: AuthContext,
  productId: string,
  imageId: string,
  client: ImageClient = prisma as unknown as ImageClient,
) {
  requireRole(ctx, "SUPER_ADMIN");

  const image = await client.productImage.findUniqueOrThrow({ where: { id: imageId } });
  if (image.productId !== productId) {
    throw new ValidationError("Image does not belong to this product.");
  }

  await client.productImage.delete({ where: { id: imageId } });

  await Promise.all([
    deleteFromStorage(storageKeyFromUrl(image.url)),
    image.thumbUrl ? deleteFromStorage(storageKeyFromUrl(image.thumbUrl)) : Promise.resolve(),
  ]);

  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: "PRODUCT_IMAGE_DELETED",
      entityType: "Product",
      entityId: productId,
      previousValue: { imageId },
      ipAddress: ctx.ip,
    },
  });
}
