import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, mayManageListing, overlaps, reminderKey, validateDateRange } from "../lib/policy.ts";

test("listing write ownership is explicit", () => {
  assert.equal(mayManageListing("user", "alice", "bob"), false);
  assert.equal(mayManageListing("user", "alice", "alice"), true);
  assert.equal(mayManageListing("admin", "alice", "bob"), true);
});
test("only lenders approve and confirm returns", () => {
  assert.equal(canTransition("pending", "approved", "borrower"), false);
  assert.equal(canTransition("pending", "approved", "lender"), true);
  assert.equal(canTransition("approved", "returned", "lender"), true);
  assert.equal(canTransition("approved", "returned", "borrower"), false);
  assert.equal(canTransition("returned", "approved", "lender"), false);
  assert.equal(canTransition("pending", "cancelled", "borrower"), true);
});
test("inclusive ranges catch adjacent and overlapping loans", () => {
  assert.equal(overlaps("2026-12-01", "2026-12-04", "2026-12-04", "2026-12-05"), true);
  assert.equal(overlaps("2026-12-01", "2026-12-03", "2026-12-04", "2026-12-05"), false);
});
test("borrow dates must be valid, future and at most 31 days", () => {
  assert.doesNotThrow(() => validateDateRange("2026-12-01", "2026-12-31", "2026-11-01"));
  assert.throws(() => validateDateRange("2026-02-30", "2026-03-01", "2026-01-01"));
  assert.throws(() => validateDateRange("2026-11-01", "2026-11-10", "2026-12-01"));
  assert.throws(() => validateDateRange("2026-12-01", "2027-02-01", "2026-11-01"));
});
test("daily reminder key is deterministic", () => {
  assert.equal(reminderKey("id", "2026-11-03"), reminderKey("id", "2026-11-03"));
  assert.notEqual(reminderKey("id", "2026-11-03"), reminderKey("id", "2026-11-04"));
});
