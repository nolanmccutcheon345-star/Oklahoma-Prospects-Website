import { createServerFn } from "@tanstack/react-start";

/**
 * Owner desks for Steve and Nolan. Preview PGLite wipes on process restart, so
 * we re-create these if missing. Passwords live only in this server handler.
 * If the user already exists (stale hash from a prior seed), reset the password
 * so the documented owner logins keep working.
 */
export const ensureOwnerAccounts = createServerFn({ method: "POST" }).handler(
  async () => {
    const owners = [
      {
        email: "nolanmccutcheon@icloud.com",
        password: "Baseball345!",
        name: "Nolan McCutcheon",
      },
      {
        email: "stevemccutcheon89@gmail.com",
        password: "Nolanandsteve123!",
        name: "Steve McCutcheon",
      },
    ];
    const { auth } = await import("@/lib/auth/server");
    const { getSql } = await import("@/lib/db");
    const { hashPassword } = await import("better-auth/crypto");
    const sql = await getSql();
    for (const owner of owners) {
      try {
        const existing = await sql<{ id: string }>`
          select id from "user" where lower(email) = ${owner.email}
        `;
        if (existing[0]) {
          const hashed = await hashPassword(owner.password);
          const accounts = await sql<{ id: string }>`
            select id from "account"
            where "userId" = ${existing[0].id} and "providerId" = ${"credential"}
          `;
          if (accounts[0]) {
            await sql`
              update "account"
              set password = ${hashed}, "updatedAt" = now()
              where id = ${accounts[0].id}
            `;
          } else {
            await sql`
              insert into "account" (
                id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
              ) values (
                ${`cred-${existing[0].id}`},
                ${owner.email.toLowerCase()},
                ${"credential"},
                ${existing[0].id},
                ${hashed},
                now(),
                now()
              )
            `;
          }
          continue;
        }
        await auth.api.signUpEmail({
          body: {
            email: owner.email,
            password: owner.password,
            name: owner.name,
          },
        });
      } catch {
        /* already exists or auth still booting */
      }
    }
    return { ok: true as const };
  },
);
