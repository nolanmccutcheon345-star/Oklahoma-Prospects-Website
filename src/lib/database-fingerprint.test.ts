import assert from "node:assert/strict";
import test from "node:test";
import { databaseDestinationFingerprint, missingPersistentFingerprint } from "./database-fingerprint";

test("separate Neon database targets report different non-secret fingerprints", () => {
  const prod = databaseDestinationFingerprint("postgresql://app:prod-super-secret@ep-one.ap-south-1.aws.neon.tech:5432/prospects?sslmode=require");
  const preview = databaseDestinationFingerprint("postgres://other:preview-super-secret@ep-two.ap-south-1.aws.neon.tech/prospects");
  assert.equal(prod.source, "postgres");
  assert.equal(preview.source, "postgres");
  assert.match(prod.fingerprint!, /^[0-9a-f]{64}$/);
  assert.notEqual(prod.fingerprint,preview.fingerprint);
  assert.doesNotMatch(JSON.stringify([prod,preview]), /prod-super-secret|preview-super-secret|neon\.tech|prospects/);
});

test("credential, query and login differences do NOT fabricate database separation", () => {
  const first = databaseDestinationFingerprint("postgres://user-one:password-one@db.example.invalid/academy?sslmode=require");
  const second = databaseDestinationFingerprint("postgresql://user-two:password-two@DB.EXAMPLE.INVALID:5432/academy?application_name=preview");
  assert.equal(first.fingerprint,second.fingerprint, "Different credentials to same DB are not isolation");
  assert.notEqual(databaseDestinationFingerprint("postgres://user:pass@db.example.invalid/other").fingerprint,first.fingerprint);
});

test("absence, malformed URLs, non-Postgres URLs and embedded fallback fail unverified", () => {
  for (const input of [undefined,"","   ","mysql://local/db","postgres://bad-host","not-a-uri"]) {
    assert.deepEqual(databaseDestinationFingerprint(input),{source:"unconfigured",fingerprint:null});
  }
  assert.deepEqual(missingPersistentFingerprint,{source:"pglite",fingerprint:null});
});
