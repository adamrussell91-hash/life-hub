import test from "node:test";
import assert from "node:assert/strict";
import {
  knowledgePresignGet,
  knowledgePresignPut,
} from "../../netlify/functions/_shared/knowledge-r2.mjs";

const env = {
  R2_ACCOUNT_ID: "exampleaccount",
  R2_BUCKET: "knowledge-hub-archive",
  R2_ACCESS_KEY_ID: "AKIAtesttesttest",
  R2_SECRET_ACCESS_KEY: "secretsecretsecretsecretsecret12",
};

test("food photo URLs do not ask R2 for the unsupported checksum mode", async () => {
  const getUrl = new URL(
    await knowledgePresignGet(env, { key: "food/photos/photo_test.jpg" }),
  );
  const putUrl = new URL(
    await knowledgePresignPut(env, {
      key: "food/photos/photo_test.jpg",
      contentType: "image/jpeg",
    }),
  );
  assert.equal(getUrl.searchParams.get("x-amz-checksum-mode"), null);
  assert.equal(putUrl.searchParams.get("x-amz-checksum-crc32"), null);
  assert.equal(putUrl.searchParams.get("x-amz-sdk-checksum-algorithm"), null);
  assert.equal(getUrl.pathname, "/food/photos/photo_test.jpg");
});
