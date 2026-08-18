import "server-only";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

// Lazily constructed so importing this module never fails before an
// R2/S3-dependent route actually runs (S3_* env vars are optional until then).
function client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

export async function uploadToStorage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: requiredEnv("S3_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${requiredEnv("S3_PUBLIC_BASE_URL")}/${key}`;
}

export async function deleteFromStorage(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: requiredEnv("S3_BUCKET"),
      Key: key,
    }),
  );
}

export function storageKeyFromUrl(url: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL;
  return base && url.startsWith(`${base}/`) ? url.slice(base.length + 1) : url;
}
