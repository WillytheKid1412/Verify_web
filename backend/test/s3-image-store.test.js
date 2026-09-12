import assert from "node:assert/strict";
import test from "node:test";
import { byteRange } from "../src/storage/s3ImageStore.js";

test("builds inclusive S3 byte ranges without reading an object", () => {
  assert.equal(byteRange(128, 512), "bytes=128-639");
  assert.throws(() => byteRange(-1, 10), /không hợp lệ/);
  assert.throws(() => byteRange(0, 0), /không hợp lệ/);
});
