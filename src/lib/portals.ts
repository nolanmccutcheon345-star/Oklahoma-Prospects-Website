export type PortalId =
  | "book"
  | "tryouts"
  | "memberships"
  | "lessons"
  | "members"
  | "coaches"
  | "waiver"
  | "checkin"
  | "uniform";

export type PortalTarget =
  | { to: "/pay"; search: { kind: string; id: string } }
  | {
      to:
        | "/book"
        | "/tryouts"
        | "/training"
        | "/account"
        | "/waiver"
        | "/visits"
        | "/more"
        | "/memberships"
        | "/contact"
        | "/family";
      hash?: string;
    };

export const PORTALS: Record<
  PortalId,
  {
    title: string;
    kicker: string;
    body: string;
    cta: string;
  }
> = {
  book: {
    title: "Pick a live slot",
    kicker: "Cages · Oklahoma Prospects",
    body: "Individual, team, or fielding area. Choose an open window and hold it on this club — not a second booking site.",
    cta: "Open cage booking",
  },
  tryouts: {
    title: "Spring 2027 tryouts",
    kicker: "Free evaluation · Oklahoma Prospects",
    body: "Register for November 14–15 sessions. Age-specific times are on the Teams screen. No payment to evaluate.",
    cta: "Register for free",
  },
  memberships: {
    title: "Cage memberships",
    kicker: "Same club · same prices",
    body: "All-Star is the plan most families should start. Pay on this club with debit or credit.",
    cta: "See memberships",
  },
  lessons: {
    title: "Player development",
    kicker: "Lessons · Oklahoma Prospects",
    body: "Assessments, private 30s and 60s, packages, and monthly development.",
    cta: "Open lessons",
  },
  members: {
    title: "Member portal",
    kicker: "Invited families only",
    body: "Sign in for training plans, progress, and feedback.",
    cta: "Open member sign-in",
  },
  coaches: {
    title: "Coaches",
    kicker: "Oklahoma Prospects staff",
    body: "Ask about the right instructor, team, or evaluation.",
    cta: "Talk to a coach",
  },
  waiver: {
    title: "Annual facility waiver",
    kicker: "Required before you train",
    body: "Parent or guardian signs for athletes under 18. One waiver covers Prospects activity for a year. This is the official club waiver.",
    cta: "Sign the waiver",
  },
  checkin: {
    title: "Athlete check-in",
    kicker: "On-site visit",
    body: "Check your athlete in when you arrive. Same Oklahoma Prospects visit tools as uniforms and waiver.",
    cta: "Check in",
  },
  uniform: {
    title: "Uniform sizing",
    kicker: "Jersey, pants, hat",
    body: "Submit sizes so your athlete is ready when the team order goes in.",
    cta: "Submit sizes",
  },
};

export function portalTarget(id: PortalId): PortalTarget {
  switch (id) {
    case "book":
      return { to: "/book" };
    case "tryouts":
      return { to: "/tryouts", hash: "register" };
    case "memberships":
      return { to: "/memberships" };
    case "lessons":
      return { to: "/training" };
    case "coaches":
      return { to: "/contact" };
    case "members":
      return { to: "/account" };
    case "waiver":
      return { to: "/waiver" };
    case "checkin":
      return { to: "/visits" };
    case "uniform":
      return { to: "/family" };
  }
}
