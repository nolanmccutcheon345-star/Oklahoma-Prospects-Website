import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
import { personSaveInput, ownProfileInput } from "./person-contracts";
export const getPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => (await import("./person.server")).people(context.userId));
export const getPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1).max(200) }).strict())
  .handler(async ({ context, data }) =>
    (await import("./person.server")).person(context.userId, data.userId),
  );
export const savePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(personSaveInput)
  .handler(async ({ context, data }) =>
    (await import("./person.server")).savePerson(context.userId, data),
  );
export const getMyPerson = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => (await import("./person.server")).myPerson(context.userId));
export const saveMyPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ownProfileInput)
  .handler(async ({ context, data }) =>
    (await import("./person.server")).saveMyPerson(context.userId, data),
  );
export const getPublicPeople = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./person-public.server")).publicPeople(),
);
