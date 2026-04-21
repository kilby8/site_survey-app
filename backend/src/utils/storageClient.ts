/**
 * backend/src/utils/storageClient.ts
 *
 * Storage abstraction — swap between local disk and AWS S3 via the
 * STORAGE_BACKEND environment variable.
 *
 *   STORAGE_BACKEND=local  (default) — writes to the local `uploads/` dir.
 *   STORAGE_BACKEND=s3               — streams to an S3 bucket.
 *
 * Callers always receive a public-facing URL string back from uploadFile().
 * For S3, a presigned GET URL valid for 1 hour is returned so the client
 * can access the object without making the bucket publicly readable.
 *
 * Required env vars for S3 mode:
 *   AWS_BUCKET_NAME        — target bucket
 *   AWS_REGION             — e.g. us-east-1
 *   AWS_ACCESS_KEY_ID      — IAM key (or use instance role / IRSA)
 *   AWS_SECRET_ACCESS_KEY  — IAM secret
 *   AWS_S3_KEY_PREFIX      — optional folder prefix, e.g. "uploads/"
 */

import fs from "fs";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------
const STORAGE_BACKEND = (process.env.STORAGE_BACKEND || "local").toLowerCase();
const IS_S3 = STORAGE_BACKEND === "s3";

const BUCKET = process.env.AWS_BUCKET_NAME || "";
const REGION = process.env.AWS_REGION || "us-east-1";
const KEY_PREFIX = process.env.AWS_S3_KEY_PREFIX || "uploads/";
const PRESIGN_TTL_SECONDS = 3600; // 1 hour

// Local uploads directory — only used in local mode
const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

// ----------------------------------------------------------------
// S3 client (lazy — only initialised when IS_S3 is true)
// ----------------------------------------------------------------
let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: REGION });
  }
  return _s3;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Uploads a file buffer and returns a URL the client can use to fetch it.
 *
 * @param buffer    Raw file bytes.
 * @param filename  Desired filename (already unique — callers must ensure this).
 * @param mimeType  MIME type, e.g. "image/jpeg".
 * @returns         A URL string — presigned S3 URL or local `/uploads/<filename>`.
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (IS_S3) {
    return uploadToS3(buffer, filename, mimeType);
  }
  return uploadToLocal(buffer, filename);
}

/**
 * Deletes a previously uploaded file.
 *
 * @param filePathOrKey  The value originally returned by uploadFile().
 *                       For S3 this is the presigned URL or the S3 key prefix + filename.
 *                       For local this is the `/uploads/<filename>` path string.
 */
export async function deleteFile(filePathOrKey: string): Promise<void> {
  if (IS_S3) {
    await deleteFromS3(filePathOrKey);
    return;
  }
  deleteFromLocal(filePathOrKey);
}

/**
 * Returns true when the backend is configured for S3, so callers can
 * skip static-file serving middleware when not needed.
 */
export function isS3Mode(): boolean {
  return IS_S3;
}

// ----------------------------------------------------------------
// Local implementation
// ----------------------------------------------------------------

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

async function uploadToLocal(buffer: Buffer, filename: string): Promise<string> {
  ensureUploadsDir();
  const dest = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(dest, buffer);
  return `/uploads/${filename}`;
}

function deleteFromLocal(filePath: string): void {
  // filePath is like "/uploads/1234-abc.jpg"
  const filename = path.basename(filePath);
  const dest = path.join(UPLOADS_DIR, filename);
  try {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
  } catch (err) {
    console.warn(`[storageClient] Could not delete local file ${dest}:`, err);
  }
}

// ----------------------------------------------------------------
// S3 implementation
// ----------------------------------------------------------------

async function uploadToS3(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (!BUCKET) {
    throw new Error(
      "[storageClient] AWS_BUCKET_NAME is not set. Cannot upload to S3.",
    );
  }

  const key = `${KEY_PREFIX}${filename}`;
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  // Return a presigned URL valid for PRESIGN_TTL_SECONDS
  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );

  return presignedUrl;
}

async function deleteFromS3(presignedUrlOrKey: string): Promise<void> {
  if (!BUCKET) return;

  // Derive the S3 key from whatever was stored —
  // presigned URLs contain the key as the URL path component.
  let key: string;
  try {
    const url = new URL(presignedUrlOrKey);
    // S3 virtual-hosted URL: https://bucket.s3.region.amazonaws.com/key
    // S3 path-style URL:      https://s3.region.amazonaws.com/bucket/key
    key = url.pathname.startsWith(`/${BUCKET}/`)
      ? url.pathname.slice(`/${BUCKET}/`.length)
      : url.pathname.slice(1);
  } catch {
    // Not a URL — treat as a raw key
    key = presignedUrlOrKey;
  }

  try {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
    );
  } catch (err) {
    console.warn(`[storageClient] Could not delete S3 object ${key}:`, err);
  }
}
