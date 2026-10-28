import test from "node:test";
import assert from "node:assert/strict";
import { publicCoachPhotoResponse, publicPhotoLink } from "./public-coach-photo.server";
import { emptySharedProfile, type PublicPerson } from "./person-contracts";
const person: PublicPerson = {
  ...emptySharedProfile("Sample Coach"),
  id: "c-sample",
  coachId: "c-sample",
  photo: "data:image/png;base64,iVBORw0KGgo=",
  instructor: true,
  bookable: false,
  serviceIds: [],
  coach: true,
  teams: [],
};
test("public coach photo transport removes inline payload and rechecks publication before 304", async () => {
  const url = "https://fixture.invalid" + publicPhotoLink(person);
  assert(!url.includes("base64"));
  const response = await publicCoachPhotoResponse(new Request(url), person.id, async () => [
    person,
  ]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from("iVBORw0KGgo=", "base64"),
  );
  const request = new Request(url, { headers: { "if-none-match": response.headers.get("etag")! } });
  assert.equal(
    (await publicCoachPhotoResponse(request, person.id, async () => [person])).status,
    304,
  );
  assert.equal((await publicCoachPhotoResponse(request, person.id, async () => [])).status, 404);
  assert.equal(
    (
      await publicCoachPhotoResponse(request, person.id, async () => [
        { ...person, photo: "data:image/png;base64,YWJj" },
      ])
    ).status,
    404,
  );
});
test("public photo endpoint rejects unsupported sources, stale versions and oversized data without proxying URLs", async () => {
  for (const photo of [
    "data:image/svg+xml;base64,YWJj",
    "https://private.example.invalid/image",
    "data:image/png;base64," + "A".repeat(250000),
  ]) {
    const row = { ...person, photo };
    assert.equal(
      (
        await publicCoachPhotoResponse(
          new Request("https://fixture.invalid/x?v=invalid"),
          person.id,
          async () => [row],
        )
      ).status,
      404,
    );
  }
  assert.equal(publicPhotoLink({ ...person, photo: "data:image/svg+xml;base64,YWJj" }), "");
  let queried = false;
  assert.equal(
    (
      await publicCoachPhotoResponse(
        new Request("https://fixture.invalid/x"),
        "../private",
        async () => {
          queried = true;
          return [person];
        },
      )
    ).status,
    404,
  );
  assert.equal(queried, false);
});
