import test from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifyPayload, verifyBearer } from "../convex/crypto.ts";

const secret = "an-example-secret-with-more-than-32-bytes-12345";
test("signed JSON validates without changing raw bytes", async () => {
  const body = JSON.stringify({requestId:"r1",reminderKey:"overdue:r1:2026-12-01"});
  const timestamp = String(Date.now());
  const signature = `sha256=${await signPayload(secret,timestamp,body)}`;
  assert.equal(await verifyPayload(secret,timestamp,body,signature),true);
  assert.equal(await verifyPayload(secret,timestamp,body.replace("r1","r2"),signature),false);
  assert.equal(await verifyPayload("wrong-key",timestamp,body,signature),false);
  assert.equal(await verifyPayload(secret,String(Date.now()-301_000),body,signature),false);
});
test("Bearer token must match a secret", async () => {
  assert.equal(await verifyBearer(secret,`Bearer ${secret}`),true);
  assert.equal(await verifyBearer(secret,"Bearer wrong"),false);
  assert.equal(await verifyBearer(secret,"Basic something"),false);
});
