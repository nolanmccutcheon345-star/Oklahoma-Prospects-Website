import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import {
  noticeAuditInput,
  noticeApproveInput,
  noticeHoldInput,
  noticeDispatchInput,
} from "./release-control-contracts";
export { noticeQueues, type NoticeQueue } from "./release-control-contracts";
const env = () => ({ ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT });
export const getNoticeReleaseAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(noticeAuditInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./release-control.server")).auditNoticeReleases(
      await getSql(),
      context.userId,
      env(),
      data,
    );
  });
export const approveNoticeRelease = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(noticeApproveInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./release-control.server")).approveNoticeReleases(
      await getSql(),
      context.userId,
      env(),
      data,
    );
  });
export const holdNoticeRelease = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(noticeHoldInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./release-control.server")).holdNoticeReleases(
      await getSql(),
      context.userId,
      env(),
      data,
    );
  });
export const dispatchNoticeRelease = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(noticeDispatchInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./release-control.server")).dispatchNoticeReleases(
      await getSql(),
      context.userId,
      env(),
      data,
    );
  });
