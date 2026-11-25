import assert from "node:assert/strict";
import { test } from "node:test";
import { asRole, canSeeItem, makeKey, sameSecret } from "./rules.ts";

const open = (assignee: string | null) => ({ status: "open", assignee_id: assignee, completed_by: null });
const done = (assignee: string | null, by: string) => ({
  status: "done",
  assignee_id: assignee,
  completed_by: by,
});

test("supervisors see every job", () => {
  assert.equal(canSeeItem("supervisor", "s", open("t1")), true);
  assert.equal(canSeeItem("supervisor", "s", done("t1", "t1")), true);
});

test("technicians see their open jobs and the crew pool, not other people's", () => {
  assert.equal(canSeeItem("technician", "t1", open("t1")), true);
  assert.equal(canSeeItem("technician", "t1", open(null)), true);
  assert.equal(canSeeItem("technician", "t1", open("t2")), false);
});

test("technicians see finished jobs only if assigned or cleared by them", () => {
  assert.equal(canSeeItem("technician", "t1", done("t1", "s")), true);
  assert.equal(canSeeItem("technician", "t1", done(null, "t1")), true);
  assert.equal(canSeeItem("technician", "t1", done("t2", "t2")), false);
});

test("unknown roles fall back to technician", () => {
  assert.equal(asRole("supervisor"), "supervisor");
  assert.equal(asRole("admin"), "technician");
});

test("keys look like ABC-234 and avoid look-alike characters", () => {
  for (let i = 0; i < 200; i += 1) {
    const key = makeKey();
    assert.match(key, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
  }
});

test("sameSecret compares exactly", () => {
  assert.equal(sameSecret("ABC-234", "ABC-234"), true);
  assert.equal(sameSecret("ABC-234", "ABC-235"), false);
  assert.equal(sameSecret("ABC-234", "ABC-2345"), false);
});
