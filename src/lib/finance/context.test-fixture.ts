/** TEST-ONLY prospective schema. Never import from a server/route or migration.
 * The production migration chain deliberately cannot represent active state.
 * This schema fixture grants no user authority; tests must create real verified
 * users/owner grants and initialize through the authenticated owner repository. */
import type { Sql } from "../db";
export async function applyFutureActiveSchemaForTest(sql: Sql): Promise<void> {
  await sql.query(
    `alter table financial_basis_state drop constraint financial_basis_state_activation_state_check`,
  );
  await sql.query(
    `alter table financial_basis_state drop constraint financial_basis_state_active_version_check`,
  );
  await sql.query(`alter table financial_basis_state add constraint fixture_financial_activation_shape check (
    (activation_state='captured' and active_version is null) or
    (activation_state='active' and active_version is not null and active_version=current_version))`);
  await sql.query(`alter table financial_basis_state add constraint fixture_financial_active_version
    foreign key(id,active_version) references financial_basis_versions(basis_id,version) deferrable initially deferred`);
  await sql.query(
    `update financial_basis_state set activation_state='active',active_version=current_version where activation_state='captured'`,
  );
}
