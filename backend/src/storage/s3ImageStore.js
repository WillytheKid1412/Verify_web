import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

let client;

function getClient() {
  if (!config.storage.region) throw new Error("Thiếu AWS_REGION cho S3 image store.");
  if (!client) client = new S3Client({ region: config.storage.region });
  return client;
}

async function bodyToBuffer(body) {
  if (!body) throw new Error("S3 trả về body rỗng.");
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function byteRange(start, length) {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length <= 0) {
    throw new Error("Byte range không hợp lệ.");
  }
  return `bytes=${start}-${start + length - 1}`;
}

export async function getObjectRange({ bucket = config.storage.imageBucket, key, versionId, start, length }) {
  if (!bucket || !key) throw new Error("Thiếu S3 bucket hoặc object key.");
  const response = await getClient().send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    VersionId: versionId || undefined,
    Range: byteRange(start, length),
  }));
  const bytes = await bodyToBuffer(response.Body);
  if (bytes.length !== length) {
    throw new Error(`S3 Range GET trả ${bytes.length} byte, cần ${length} byte.`);
  }
  return { bytes, contentRange: response.ContentRange, versionId: response.VersionId };
}
