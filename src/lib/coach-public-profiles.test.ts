import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { publicCoachProfilesFor } from "./coach-public-profiles.server";
test("public coach query exposes publication fields only and excludes drafts or malformed profiles", async () => {
  const db = new PGlite();
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await db.query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    const profile = {
      name: "Synthetic Coach",
      specialties: ["Hitting"],
      career: "Short public bio",
      approach: "",
      ages: "Youth",
      achievements: "",
      welcome: "",
      email: "private@example.invalid",
      phone: "private phone",
      user_id: "private account",
      published: true,
      internalNotes: "Private staff note",
    };
    await sql`insert into coach_profiles(id,user_id,profile,published) values('visible','account-visible',${JSON.stringify(profile)}::jsonb,true),('draft','account-draft',${JSON.stringify(profile)}::jsonb,false),('invalid','account-invalid','{"name":null}'::jsonb,true)`;
    await sql`insert into coach_profiles(id,user_id,profile,published) values('empty-bio','account-empty-bio',${JSON.stringify({...profile,career:"   "})}::jsonb,true)`;
    assert.deepEqual(await publicCoachProfilesFor(sql,[]),[]);
    const rows = await publicCoachProfilesFor(sql,["visible","draft","invalid","empty-bio"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "visible");
    assert.deepEqual(
      Object.keys(rows[0].profile).sort(),
      ["name", "specialties", "career", "approach", "ages", "achievements", "welcome"].sort(),
    );
    assert.equal(rows[0].profile.career, "Short public bio");
    assert.ok(!JSON.stringify(rows).includes("private"));
    assert.ok(!JSON.stringify(rows).includes("account-visible"));
    await sql`update coach_profiles set published=false where id='visible'`;
    assert.deepEqual(await publicCoachProfilesFor(sql,["visible","draft","invalid","empty-bio"]), []);
  } finally {
    await db.close();
  }
});
