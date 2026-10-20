import { masterSchema } from "./budget-matrix";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import {
  feeAction,
  businessSchema,
  financialEventAmendment,
  financialEventAdmission,
} from "./fee-contracts";
import { z } from "zod";
export const getFeeWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { feeWorkspace } = await import("./fee.server");
    return feeWorkspace(await getSql(), context.userId);
  });
export const changeFeePlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(feeAction)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { mutateFeePlan } = await import("./fee.server");
    return mutateFeePlan(await getSql(), context.userId, data);
  });
export const saveFeeBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        revision: z.number().int(),
        basisVersion: z.number().int().positive().optional(),
        value: businessSchema,
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { setFeeBusiness } = await import("./fee.server");
    return setFeeBusiness(await getSql(), context.userId, data);
  });

export const getTeamUniform = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { teamUniform } = await import("./fee.server");
    return teamUniform(await getSql(), context.userId, data.teamId);
  });

export const getTeamFundingStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { teamFundingStatus } = await import("./fee.server");
    return teamFundingStatus(await getSql(), context.userId, data.teamId);
  });

export const getBudgetMaster = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { getBudgetMaster } = await import("./budget-matrix.server");
    return getBudgetMaster(await getSql(), context.userId);
  });
export const saveBudgetMaster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        revision: z.number().int().nonnegative(),
        basisVersion: z.number().int().positive().optional(),
        value: masterSchema,
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveBudgetMaster } = await import("./budget-matrix.server");
    return saveBudgetMaster(
      await getSql(),
      context.userId,
      data.revision,
      data.value,
      data.basisVersion,
    );
  });

export const getFinancialEventCommitments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { financialEventCommitments } = await import("./fee.server");
    return financialEventCommitments(await getSql(), context.userId, data.teamId);
  });

export const saveFinancialEventCommitment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(financialEventAmendment)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { amendFinancialEventCommitment } = await import("./fee.server");
    return amendFinancialEventCommitment(await getSql(), context.userId, data);
  });

export const admitFinancialEventCommitment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(financialEventAdmission)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { admitFinancialEventCommitment } = await import("./fee.server");
    return admitFinancialEventCommitment(await getSql(), context.userId, data);
  });
