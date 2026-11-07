import type { Sql } from "./db";
import { THANKSGIVING_CAMP } from "./thanksgiving-camp";

// Temporary test-branch harness. Remove this file before payment acceptance.
// It adds scheduling fixtures only, never users, credentials, grants or messages.
export async function prepareThanksgivingSandboxFixtures(
  sql: Sql,
  userId: string,
  config: { environment: string; origin: string; context?: string; runtimeContext?: string },
) {
  if (
    config.environment !== "sandbox" ||
    config.context !== "branch-deploy" ||
    config.runtimeContext === "production" ||
    config.origin !== "https://square-release-check--oklahoma-prospects.netlify.app"
  )
    throw new Error("Fixture preparation is restricted to the isolated Square test branch.");
  return sql.transaction(async (tx) => {
    const [owner] = await tx`select u.id from "user" u
      join profiles p on p.user_id=u.id and p.role='admin'
      join owner_grants g on g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null
      where u.id=${userId} and u."emailVerified"=true and u."disabledAt" is null`;
    if (!owner) throw new Error("Verified active owner access required.");
    const [row] = await tx<{ payload: string | Record<string, unknown>; revision: number }>`
      select payload,revision from pd_working_file where id='club' for update`;
    if (!row) throw new Error("Existing isolated development record required.");
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (!payload || !Array.isArray(payload.coaches)) throw new Error("Invalid development record.");
    const coaches = payload.coaches as {
      id: string;
      name: string;
      email: string;
      active: boolean;
    }[];
    const fixtures = THANKSGIVING_CAMP.coaches.map((name, i) => ({
      id: `thanksgiving-sandbox-fixture-${i + 1}`,
      name,
      email: `thanksgiving-sandbox-fixture-${i + 1}@example.invalid`,
      specialties: [],
      active: true,
    }));
    const emails = fixtures.map((c) => c.email);
    if ((await tx`select id from "user" where lower(trim(email))=any(${emails}::text[])`).length)
      throw new Error("Fixture addresses must not match any account.");
    const additions = [];
    for (const fixture of fixtures) {
      const matches = coaches.filter(
        (c) =>
          c.id === fixture.id ||
          c.email?.trim().toLowerCase() === fixture.email ||
          c.name?.trim().toLowerCase() === fixture.name.toLowerCase(),
      );
      if (
        matches.length &&
        !(
          matches.length === 1 &&
          matches[0].id === fixture.id &&
          matches[0].name === fixture.name &&
          matches[0].email === fixture.email &&
          matches[0].active === true
        )
      )
        throw new Error("Existing coach identity needs review; nothing was replaced.");
      if (!matches.length) additions.push(fixture);
    }
    if (additions.length) {
      const updated = {
        ...payload,
        coaches: [...coaches, ...additions],
        revision: row.revision + 1,
      };
      await tx`update pd_working_file set payload=${JSON.stringify(updated)},revision=revision+1,updated_at=now() where id='club' and revision=${row.revision}`;
      await tx`insert into audit_events(actor_id,action,target_table,target_id,after_state) values(${userId},'prepare-isolated-camp-fixtures','pd_working_file','club',${JSON.stringify({ fixtureIds: additions.map((c) => c.id) })}::jsonb)`;
    }
    return { prepared: true, added: additions.length };
  });
}
