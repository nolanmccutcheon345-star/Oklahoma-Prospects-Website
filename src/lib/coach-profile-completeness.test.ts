import test from "node:test";
import assert from "node:assert/strict";
import { profileInput } from "./coaching-contracts";
import { saveCoach } from "./coaching.server";
const profile = {
  name: "Synthetic Coach",
  specialties: [],
  career: "",
  approach: "",
  ages: "",
  achievements: "",
  welcome: "",
  published: false,
};
test("unfinished coach bios can remain drafts but cannot be published", () => {
  assert.equal(profileInput.safeParse(profile).success, true);
  for (const career of ["", "   ", "\n\t"]) {
    const result = profileInput.safeParse({ ...profile, published: true, career });
    assert.equal(result.success, false);
    if (!result.success) assert.deepEqual(result.error.issues[0].path, ["career"]);
  }
  const saved = profileInput.parse({
    ...profile,
    published: true,
    career: " A short genuine bio. ",
  });
  assert.equal(saved.career, "A short genuine bio.");
  assert.equal(profileInput.safeParse({ ...saved, name: "  " }).success, false);
});
test("direct coach save refuses a blank published bio before identity or database work", async () => {
  await assert.rejects(
    () => saveCoach("synthetic-unavailable-user", { ...profile, published: true }),
    /short bio/,
  );
});
