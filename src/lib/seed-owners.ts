import { createServerFn } from "@tanstack/react-start";

/**
 * Create Steve and Nolan credential logins if they do not exist yet.
 * Never overwrite an existing password.
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
    const sql = await getSql();
    for (const owner of owners) {
      try {
        const existing = await sql<{ id: string }>`
          select id from "user" where lower(email) = ${owner.email}
        `;
        if (existing[0]) continue;
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
