import { getSql, type Sql } from "./db";
import { requireOrganizationOperations, financiallyRestricted } from "./coordinator/access.server";
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
  return sql<PublicStaffListing>`select id,name,title,program,email,phone,bio from staff_directory where published=true order by name`;
}
export async function listStaffDirectoryFor(sql: Sql, userId: string) {
  await requireOwner(sql, userId);
  const rows =
    await sql<StaffListing>`select id,name,title,program,email,phone,bio,published,version from staff_directory order by name`;
  const restricted = await financiallyRestricted(sql, userId);
  return rows.map((row) =>
    restricted && !row.published ? { ...row, bio: "", bioWithheld: true } : row,
  );
}
export async function saveStaffListingFor(sql: Sql, userId: string, raw: StaffListing) {
  await requireOwner(sql, userId);
  const input = staffListingInput.parse(raw);
  try {
    return await sql.transaction(async (tx) => {
      await requireOwner(tx, userId);
      const [old] =
        await tx<StaffListing>`select * from staff_directory where id=${input.id} for update`;
      if ((old && old.version !== input.version) || (!old && input.version !== 0))
        throw new Error("This listing changed. Refresh the staff list before saving again.");
      const withheld = old && !old.published && (await financiallyRestricted(tx, userId));
      if (withheld && (input.bio || input.published))
        throw new Error(
          "This unpublished biography must be reviewed by an owner before it can be edited or published.",
        );
      const bio = withheld ? old.bio : input.bio;
      const saved = old
        ? await tx<StaffListing>`update staff_directory set name=${input.name},title=${input.title},program=${input.program},email=${input.email},phone=${input.phone},bio=${bio},published=${input.published},version=version+1,updated_at=now() where id=${input.id} returning id,name,title,program,email,phone,bio,published,version`
        : await tx<StaffListing>`insert into staff_directory(id,name,title,program,email,phone,bio,published) values(${input.id},${input.name},${input.title},${input.program},${input.email},${input.phone},${bio},${input.published}) returning id,name,title,program,email,phone,bio,published,version`;
      await tx`insert into audit_events(actor_id,action,target_table,target_id,before_state,after_state) values(${userId},${old ? "UPDATE" : "INSERT"},'staff_directory',${input.id},${old ? JSON.stringify({ version: old.version, published: old.published }) : null}::jsonb,${JSON.stringify({ version: saved[0].version, published: saved[0].published })}::jsonb)`;
      return (await financiallyRestricted(tx, userId)) && !saved[0].published
        ? { ...saved[0], bio: "", bioWithheld: true }
        : saved[0];
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
