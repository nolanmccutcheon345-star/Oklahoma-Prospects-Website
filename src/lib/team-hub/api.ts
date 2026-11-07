import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { hubQuery, hubAction } from "./contracts";
export const getTeamHub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(hubQuery)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { readHub } = await import("./server");
    return readHub(await getSql(), context.userId, data);
  });
export const changeTeamHub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(hubAction)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { writeHub } = await import("./server");
    return writeHub(await getSql(), context.userId, data);
  });
