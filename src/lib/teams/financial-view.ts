import type { Player } from "./types";

/** Reviewed desk projection. This is never an editable ClubRecord or a basis. */
export type TeamFinancialView = {
  mode: "basis";
  version: number;
  owner: boolean;
  catalog: { id: string; name: string; fee: number }[];
  obligations: {
    agreementId: string;
    teamSeasonId: string;
    teamId: string;
    teamName: string;
    playerId: string;
    playerName: string;
    familyId: string;
    signed: number;
    due: number;
    agreement: Player["agreement"];
    feeLock: Player["feeLock"];
    planLock: Player["planLock"];
    payments: Player["payments"];
    credits: Player["credits"];
    depositPaid: boolean;
  }[];
  coachTeams: {
    teamId: string;
    teamName: string;
    eventBudget: number;
    spent: number;
    readiness: { playerId: string; signed: boolean; depositPaid: boolean }[];
  }[];
  staff: {
    teamId: string;
    teamName: string;
    id: string;
    name: string;
    monthly: number;
    applyAmount: number;
    w9: boolean;
    safeSport: boolean;
  }[];
};
