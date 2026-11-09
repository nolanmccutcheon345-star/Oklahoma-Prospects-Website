import type { OfficeSection } from "../components/front-office-shell";

type Tool = { label: string; description: string } & (
  { section: OfficeSection; href?: never } | { href: string; section?: never }
);
export const OFFICE_TOOL_GROUPS: readonly { title: string; tools: readonly Tool[] }[] = [
  {
    title: "Run the academy",
    tools: [
      {
        section: "requests",
        label: "Requests & follow-up",
        description: "Review incoming inquiries and follow up with families.",
      },
      {
        section: "bookings",
        label: "Bookings & facility",
        description: "Manage sessions, availability and booking changes.",
      },
      {
        section: "events",
        label: "Camps & clinics",
        description: "Manage academy events and registrations.",
      },
      {
        section: "staff",
        label: "People & access",
        description: "Manage staff, accounts and coaching assignments.",
      },
    ],
  },
  {
    title: "Teams & player development",
    tools: [
      {
        section: "teams",
        label: "Teams & players",
        description: "Manage rosters, coaches, team fees and invitations.",
      },
      {
        section: "development",
        label: "Team development",
        description: "Open team training and development tools.",
      },
      {
        section: "evaluations",
        label: "Tryout evaluations",
        description: "Review evaluations and player placement.",
      },
      {
        section: "tournaments",
        label: "Tournament finder",
        description: "Find events and manage team tournament plans.",
      },
      {
        href: "/player-profiles",
        label: "Recruiting profiles",
        description: "Review player profiles and metric approvals.",
      },
      {
        href: "/handbooks",
        label: "Handbooks & standards",
        description: "Open team standards and handbook tools.",
      },
      {
        href: "/enrollment",
        label: "Enrollment pilot",
        description: "Review existing enrollment and season progress tools.",
      },
    ],
  },
  {
    title: "Money & business",
    tools: [
      {
        section: "payments",
        label: "Payments & Square",
        description: "Review payment operations and provider status.",
      },
      {
        section: "finance",
        label: "Finance",
        description: "Open the academy’s existing finance workspace.",
      },
      {
        section: "reports",
        label: "Reports & team fees",
        description: "Review operating reports and team fee records.",
      },
      { section: "shop", label: "Shop", description: "Manage merchandise and shop operations." },
    ],
  },
  {
    title: "Website & communication",
    tools: [
      {
        section: "services",
        label: "Services, pricing & website",
        description: "Manage the service catalog, website content and promotions.",
      },
      {
        section: "articles",
        label: "Articles & news",
        description: "Write and manage academy news with the existing publishing tools.",
      },
    ],
  },
];
