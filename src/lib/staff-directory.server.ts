import { getSql, type Sql } from "./db";
import { requireOrganizationOperations, financiallyRestricted } from "./coordinator/access.server";
import { lockFinancialExecution } from "./finance/execution.server";
import { staffListingInput, type StaffListing, type PublicStaffListing } from "./staff-directory";
async function requireOwner(sql: Sql, userId: string) {
  try {
    await requireOrganizationOperations(sql, userId);
  } catch {
    throw new Error(
      "Owner access required to manage staff listings, or an active organization operations grant.",
    );
  }
}
export async function publicStaffFor(sql: Sql) {
  return sql<PublicStaffListing>`select d.id,d.name,d.title,d.program,d.email,d.phone,d.bio from staff_directory d left join "user" u on u.id=d.identity_user_id or (d.identity_email is null and lower(trim(u.email))=lower(trim(d.email))) left join operational_person_settings o on o.user_id=u.id where d.published=true and u."disabledAt" is null and coalesce(o.directory_active,true) order by d.name`;
}
export async function listStaffDirectoryFor(sql: Sql, userId: string) {
  await requireOwner(sql, userId);
  const restricted = await financiallyRestricted(sql, userId);
  const rows = await sql<
    StaffListing & { bioWithheld: boolean }
  >`select id,name,title,program,email,phone,case when ${restricted} and not published and operational_bio_version is distinct from version then '' else bio end as bio,published,version,(${restricted} and not published and operational_bio_version is distinct from version) as "bioWithheld" from staff_directory order by name`;
  return rows.map(({ bioWithheld, ...row }) => (bioWithheld ? { ...row, bioWithheld } : row));
}
export async function saveStaffListingFor(sql: Sql, userId: string, raw: StaffListing) {
  const input = staffListingInput.parse(raw);
  try {
    return await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await requireOwner(tx, userId);
      const restricted = await financiallyRestricted(tx, userId);
      const [old] = await tx<
        StaffListing & {
          identity_email: string | null;
          identity_user_id: string | null;
          operational_bio_version: number | null;
          withheld: boolean;
        }
      >`select id,name,title,program,email,phone,case when ${restricted} and not published and operational_bio_version is distinct from version then '' else bio end as bio,published,version,identity_email,identity_user_id,operational_bio_version,(${restricted} and not published and operational_bio_version is distinct from version) as withheld from staff_directory where id=${input.id} for update`;
      if ((old && old.version !== input.version) || (!old && input.version !== 0))
        throw new Error("This listing changed. Refresh the staff list before saving again.");
      if (old?.withheld && (input.bio || input.published))
        throw new Error(
          "This unpublished biography must be reviewed by an owner before it can be edited or published.",
        );
      const identityEmail = old?.identity_email ?? old?.email ?? input.email;
      const [account] =
        old?.identity_email !== null && old?.identity_email !== undefined
          ? []
          : await tx<{
              id: string;
            }>`select id from "user" where lower(trim(email))=${identityEmail.trim().toLowerCase()}`;
      const identityUser =
        old?.identity_email !== null && old?.identity_email !== undefined
          ? old.identity_user_id
          : (account?.id ?? null);
      const version = (old?.version || 0) + 1;
      const classification =
        restricted && !old?.withheld ? version : input.published ? version : null;
      if (old)
        await tx`update staff_directory set name=${input.name},title=${input.title},program=${input.program},email=${input.email},phone=${input.phone},bio=case when ${Boolean(old.withheld)} then bio else ${input.bio} end,published=${input.published},version=${version},identity_email=${identityEmail},identity_user_id=${identityUser},operational_bio_version=case when ${Boolean(old.withheld)} then operational_bio_version else ${classification} end,updated_at=now() where id=${input.id}`;
      else
        await tx`insert into staff_directory(id,name,title,program,email,phone,bio,published,identity_email,identity_user_id,operational_bio_version) values(${input.id},${input.name},${input.title},${input.program},${input.email},${input.phone},${input.bio},${input.published},${identityEmail},${identityUser},${classification})`;
      await tx`insert into audit_events(actor_id,action,target_table,target_id,before_state,after_state) values(${userId},${old ? "UPDATE" : "INSERT"},'staff_directory',${input.id},${old ? JSON.stringify({ version: old.version, published: old.published }) : null}::jsonb,${JSON.stringify({ version, published: input.published })}::jsonb)`;
      const [saved] = await tx<
        StaffListing & { bioWithheld: boolean }
      >`select id,name,title,program,email,phone,case when ${restricted} and not published and operational_bio_version is distinct from version then '' else bio end as bio,published,version,(${restricted} and not published and operational_bio_version is distinct from version) as "bioWithheld" from staff_directory where id=${input.id}`;
      const { bioWithheld, ...row } = saved;
      return bioWithheld ? { ...row, bioWithheld } : row;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new Error("This staff email is already listed. Edit the existing entry.");
    throw error;
  }
}
export async function publicStaff() {
  return publicStaffFor(await getSql());
}
export async function listStaffDirectory(userId: string) {
  return listStaffDirectoryFor(await getSql(), userId);
}
export async function saveStaffListing(userId: string, input: StaffListing) {
  return saveStaffListingFor(await getSql(), userId, input);
}
