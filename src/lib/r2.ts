import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function publicUrlForKey(key: string): string {
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (!publicBase) throw new Error('R2_PUBLIC_BASE_URL not set');
  return `${publicBase.replace(/\/$/, '')}/${key}`;
}

export async function createUploadUrl(input: {
  contentType: string;
  ext: string;
  folder: 'face' | 'garment' | 'scene' | 'output';
}): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error('R2_BUCKET not set');

  const key = `${input.folder}/${randomUUID()}.${input.ext.replace(/^\./, '')}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
  });
  const uploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: 600 });
  return { uploadUrl, publicUrl: publicUrlForKey(key), key };
}

/** Persist generated image (base64 or data URL) to R2; returns public URL */
export async function putGeneratedImage(input: {
  jobId: string;
  dataUrlOrBase64: string;
}): Promise<{ publicUrl: string; key: string }> {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error('R2_BUCKET not set');

  let raw = input.dataUrlOrBase64;
  let contentType = 'image/png';
  let ext = 'png';
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(raw);
  if (m) {
    contentType = m[1];
    raw = m[2];
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('webp')) ext = 'webp';
  }

  const body = Buffer.from(raw, 'base64');
  const key = `output/${input.jobId}.${ext}`;
  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { publicUrl: publicUrlForKey(key), key };
}
