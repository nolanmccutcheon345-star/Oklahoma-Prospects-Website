import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { readHub, writeHub } from "./server";

test("live Team Hub persists scoped communication without financial or contact records", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    const other = structuredClone(club.teams[0].roster[0]);
    other.id = "other-player";
    other.name = "Other household athlete";
    other.familyId = "home-other";
    other.parents = [
      {
        name: "Other parent",
        email: "other@example.invalid",
        phone: "PRIVATE PHONE",
        rel: "parent",
      },
    ];
    club.teams[0].roster.push(other);
    club.teams[0].announcements = [];
    club.teams[0].practices = [
      {
        id: "practice",
        date: "2098-01-15",
        time: "18:00",
        where: "Indoor",
        cageHours: 0,
        status: "on",
      },
    ];
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    const parent = await readHub(sql, "guardian", { teamId: "base" });
    assert.equal(parent.teams.length, 2);
    assert.equal(parent.workspace!.manage, false);
    assert.equal(parent.workspace!.players.find((p) => p.id === "other-player")!.canChat, false);
    assert.doesNotMatch(
      JSON.stringify(parent),
      /PRIVATE PHONE|familyId|payments|feeLock|birth|guardian@example/,
    );
    for (const id of ["stranger", "fake", "coordinator", "othercoach"])
      await assert.rejects(readHub(sql, id, { teamId: "base" }));
    await assert.rejects(readHub(sql, "player", {}), /linked parents/);
    assert.equal((await readHub(sql, "stranger", {})).workspace, null);
    assert.equal((await readHub(sql, "coach", { teamId: "base" })).workspace!.manage, true);
    await assert.rejects(
      readHub(sql, "guardian", { teamId: "base", playerId: "other-player" }),
      /family conversation/,
    );
    const post = {
      kind: "post" as const,
      teamId: "base",
      requestId: randomUUID(),
      title: "Practice update",
      body: "Arrive early",
      urgent: true,
    };
    await assert.rejects(writeHub(sql, "guardian", post), /assigned coaches/);
    await writeHub(sql, "coach", post);
    await writeHub(sql, "coach", post);
    await assert.rejects(
      writeHub(sql, "coach", { ...post, body: "Different" }),
      /Submission changed/,
    );
    assert.equal((await sql`select id from team_hub_posts`).length, 1);
    const ack = { kind: "ack" as const, teamId: "base", postKey: post.requestId };
    await writeHub(sql, "guardian", ack);
    await writeHub(sql, "guardian", ack);
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.posts[0].acknowledged,
      true,
    );
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.posts[0].count,
      null,
    );
    assert.equal((await readHub(sql, "coach", { teamId: "base" })).workspace!.posts[0].count, 1);
    await assert.rejects(writeHub(sql, "guardian", { ...ack, teamId: "soft" }), /update changed/);
    const privateMessage = {
      kind: "message" as const,
      teamId: "base",
      playerId: "base-player",
      requestId: randomUUID(),
      body: "Private family question",
    };
    await writeHub(sql, "guardian", privateMessage);
    await writeHub(sql, "guardian", privateMessage);
    await assert.rejects(
      writeHub(sql, "guardian", { ...privateMessage, body: "Changed" }),
      /Submission changed/,
    );
    assert.equal(
      (await readHub(sql, "coach", { teamId: "base", playerId: "base-player" })).workspace!.messages
        .length,
      1,
    );
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.messages.length,
      0,
    );
    await assert.rejects(
      writeHub(sql, "guardian", {
        ...privateMessage,
        requestId: randomUUID(),
        playerId: "other-player",
      }),
      /family conversation/,
    );
    await assert.rejects(
      writeHub(sql, "othercoach", { ...privateMessage, requestId: randomUUID() }),
    );
    const group = {
      ...privateMessage,
      playerId: null,
      requestId: randomUUID(),
      body: "Team question",
    };
    await writeHub(sql, "guardian", group);
    await writeHub(sql, "guardian", group);
    assert.equal((await readHub(sql, "coach", { teamId: "base" })).workspace!.messages.length, 1);
    assert.equal(
      (await sql`select id from team_chat_messages where body='Team question'`).length,
      1,
      "Existing team chat is reused",
    );
    // The browser receives standard UTC timestamps, regardless of the database session zone.
    await sql`update team_hub_posts set created_at='2026-10-29 12:34:56.123+00' where id=${post.requestId}`;
    await sql`update team_hub_family_messages set created_at='2026-10-29 12:34:56.123+00' where id=${privateMessage.requestId}`;
    await sql`update team_chat_messages set created_at='2026-10-29 12:34:56.123+00' where id=${group.requestId}`;
    await sql`set time zone 'America/Chicago'`;
    const datedTeam = (await readHub(sql, "guardian", { teamId: "base" })).workspace!;
    const datedFamily = (
      await readHub(sql, "guardian", { teamId: "base", playerId: "base-player" })
    ).workspace!;
    assert.equal(datedTeam.posts[0].at, "2026-10-29T12:34:56.123Z");
    assert.equal(datedTeam.messages[0].at, "2026-10-29T12:34:56.123Z");
    assert.equal(datedFamily.messages[0].at, "2026-10-29T12:34:56.123Z");
    const rsvp = {
      kind: "rsvp" as const,
      teamId: "base",
      eventId: "practice",
      playerId: "base-player",
      response: "going" as const,
    };
    await writeHub(sql, "guardian", rsvp);
    await writeHub(sql, "guardian", { ...rsvp, response: "maybe" });
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.events[0].responses[0]
        .response,
      "maybe",
    );
    await assert.rejects(writeHub(sql, "guardian", { ...rsvp, playerId: "other-player" }));
    await assert.rejects(writeHub(sql, "guardian", { ...rsvp, eventId: "not-a-practice" }));
    await writeHub(sql, "coach", { ...rsvp, playerId: "other-player" });
    assert.equal(
      (await readHub(sql, "guardian", { teamId: "base" })).workspace!.events[0].responses.length,
      1,
      "Other household RSVPs remain private",
    );
    assert.equal(
      (await readHub(sql, "coach", { teamId: "base" })).workspace!.events[0].responses.length,
      2,
    );
    // Reassignment does not expose a previous household's conversation to the new family.
    club.teams[0].roster[0].familyId = "home-other";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    assert.equal(
      (await readHub(sql, "coach", { teamId: "base", playerId: "base-player" })).workspace!.messages
        .length,
      0,
    );
    await assert.rejects(readHub(sql, "guardian", { teamId: "base" }));
    // Revoked assignment is checked on every request, even with a stale browser selection.
    club.teams[0].coachEmail = "replacement@example.invalid";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await assert.rejects(readHub(sql, "coach", { teamId: "base" }));
    await assert.rejects(writeHub(sql, "coach", { ...post, requestId: randomUUID() }));
    assert.equal(
      (await sql`select invitation_id from invitation_delivery`).length,
      0,
      "Hub actions do not enqueue email",
    );
  } finally {
    await db.close();
  }
});

test("hub access requires current verified adult and active coaching or guardian authority", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await sql`update "user" set "emailVerified"=false where id='guardian'`;
    await assert.rejects(readHub(sql, "guardian", {}));
    await sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='guardian'`;
    await assert.rejects(readHub(sql, "guardian", {}));
    await sql`insert into club_staff(id,name,email,user_id,active) values('inactive-hub-coach','Coach','coach@example.invalid','coach',false)`;
    await assert.rejects(readHub(sql, "coach", { teamId: "base" }));
    club.teams[0].closed = true;
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await assert.rejects(readHub(sql, "owner", { teamId: "base" }));
  } finally {
    await db.close();
  }
});
