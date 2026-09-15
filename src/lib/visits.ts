import { create } from "zustand";
import { persist } from "zustand/middleware";

export type VisitKind = "individual" | "team" | "field" | "lesson" | "membership" | "tryout";

export type PlannedVisit = {
  id: string;
  kind: VisitKind;
  date: string;
  time: string;
  notes: string;
  createdAt: number;
};

type VisitState = {
  visits: PlannedVisit[];
  add: (visit: Omit<PlannedVisit, "id" | "createdAt">) => void;
  remove: (id: string) => void;
};

export const VISIT_LABELS: Record<VisitKind, string> = {
  individual: "Individual cage",
  team: "Team cage",
  field: "Fielding area",
  lesson: "Private lesson",
  membership: "Membership",
  tryout: "Tryout",
};

export const useVisits = create<VisitState>()(
  persist(
    (set) => ({
      visits: [],
      add: (visit) =>
        set((state) => ({
          visits: [
            {
              ...visit,
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              createdAt: Date.now(),
            },
            ...state.visits,
          ].slice(0, 24),
        })),
      remove: (id) =>
        set((state) => ({ visits: state.visits.filter((visit) => visit.id !== id) })),
    }),
    { name: "prospects-planned-visits" },
  ),
);
