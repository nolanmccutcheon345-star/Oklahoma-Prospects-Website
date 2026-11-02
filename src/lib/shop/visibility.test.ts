import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { publicShop } from "./store.server";
import { createDraft } from "./management.server";
import { shopPublicVisibility } from "./visibility";

async function fixture() {
  const db = new PGlite();
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""), values))
      .rows) as Sql;
  sql.query = (async (text: string, values: unknown[] = []) =>
    (await db.query(text, values)).rows) as Sql["query"];
  sql.transaction = (work) => work(sql);
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('owner','owner@example.invalid','owner',true,now(),now())`;
  await sql`insert into profiles(user_id,email,name,role,family_id) values('owner','owner@example.invalid','owner','admin','fam-owner')`;
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  return sql;
}

const base = { archived: false, published: false, sample_approved: false, coming_soon: false };
const states = [
  base,
  { ...base, archived: true, published: true, coming_soon: true },
  { ...base, published: true },
  { ...base, published: true, coming_soon: true },
  { ...base, published: true, sample_approved: true },
];

test("visibility labels cover draft, archived, coming soon, for sale and unapproved samples", () => {
  assert.deepEqual(
    states.map((s) => shopPublicVisibility(s).visible),
    [false, false, false, true, true],
  );
  assert.match(shopPublicVisibility(base).reason, /Draft/);
  assert.match(shopPublicVisibility(states[2]).reason, /sample is not approved/);
});

test("office visibility matches what the public shop query actually returns", async () => {
  const sql = await fixture();
  const draft = await createDraft(sql, "owner", "SYNTHETIC draft");
  // A newly created draft is persisted but hidden; the office must say so.
  const [created] = await sql<{
    archived: boolean;
    published: boolean;
    sample_approved: boolean;
    coming_soon: boolean;
  }>`select archived,published,sample_approved,coming_soon from shop_products where id=${draft}`;
  assert.ok(created, "draft persisted");
  assert.equal(shopPublicVisibility(created).visible, false);
  assert.equal((await publicShop(sql)).products.length, 0);
  for (const [i, s] of states.entries())
    await sql`insert into shop_products(id,title,image_url,variants,updated_by,archived,published,sample_approved,coming_soon) values(${"s" + i},'SYNTHETIC','https://example.invalid/x.jpg','[]','owner',${s.archived},${s.published},${s.sample_approved},${s.coming_soon})`;
  const shown = new Set((await publicShop(sql)).products.map((p) => p.id));
  for (const [i, s] of states.entries())
    assert.equal(shown.has("s" + i), shopPublicVisibility(s).visible, `state ${i}`);
});
