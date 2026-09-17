import { dollars } from "./pricing";
export const CLUB = {
  name: "Oklahoma Prospects",
  shortName: "Oklahoma Prospects",
  tagline: "Indoor baseball & softball in Broken Arrow.",
  established: 2008,
  mindset: ["Grit", "Heart", "Pride"],
  phoneDisplay: "(918) 922-8114",
  phoneTel: "+19189228114",
  email: "oklahomaprospectsbaseball@gmail.com",
  addressLine1: "3804 S. Elm Pl., Suite A",
  addressLine2: "Broken Arrow, OK 74011",
  city: "Broken Arrow, Oklahoma",
  sports: "Baseball & softball",
  hoursWeekday: "Mon–Fri · 4–8 PM by booking",
  hoursWeekend: "Sat–Sun · 1–8 PM by booking",
  cancellation:
    "Cancel 48 hours ahead for a full refund. Between 24 and 48 hours: 50% refund. Inside 24 hours: no refund.",
  coachSteve: "Coach Steve",
  coachStevePhone: "(918) 760-2719",
  coachSteveTel: "+19187602719",
} as const;

export const LINKS = {
  book: "/book",
  bookSchedule: "/book",
  tryouts: "/tryouts",
  memberships: "/memberships",
  development: "/training",
  memberApp: "/account",
  pricing: "/training",
  coaches: "/coaches",
  uniform: "/family",
  waiver: "/waiver",
  checkin: "/visits",
  maps: "https://www.google.com/maps/search/?api=1&query=3804+S.+Elm+Pl.+Suite+A+Broken+Arrow+OK+74011",
  site: "https://prospectsbaseball.club/",
  googleReview: "https://www.google.com/maps/search/?api=1&query=Oklahoma+Prospects+3804+S+Elm+Pl+Broken+Arrow+OK",
} as const;

export function smsHref(tel: string, body: string) {
  const number = tel.replace(/[^\d+]/g, "");
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}

export const AGE_GROUPS = [
  "5U",
  "6U",
  "7U",
  "8U",
  "9U",
  "10U",
  "11U",
  "12U",
  "13U",
  "14U",
  "15U",
  "16U",
] as const;

export const TRYOUT_AGES = ["5U", "8U", "9U", "10U", "13U", "15U"] as const;

export const TRYOUT_DAYS = [
  {
    date: "2026-11-14",
    weekday: "Saturday",
    sessions: [
      { age: "5U", time: "9:00–10:00 AM" },
      { age: "8U", time: "10:15–11:15 AM" },
      { age: "9U", time: "11:30 AM–12:30 PM" },
      { age: "10U", time: "1:00–2:00 PM" },
    ],
  },
  {
    date: "2026-11-15",
    weekday: "Sunday",
    sessions: [
      { age: "13U", time: "1:00–2:30 PM" },
      { age: "15U", time: "3:00–4:30 PM" },
    ],
  },
] as const;

export const TRYOUT_MAKEUP = {
  date: "2026-11-21",
  label: "November 21 by appointment",
} as const;

export const CANCEL_POLICY = {
  fullRefundHours: 48,
  partialRefundHours: 24,
  partialRefundPct: 50,
  copy: "Cancel 48 hours ahead for a full refund. Between 24 and 48 hours: 50% refund. Inside 24 hours: no refund.",
  short: "48-hour full refund · 24–48 hours 50% · under 24 hours none",
} as const;

export const HOUSEHOLD_CAGE_PLAN_IDS = ["prospect", "all-star", "elite-family"] as const;

export type RentalId = "individual" | "team" | "field";

export const RENTALS: {
  id: RentalId;
  name: string;
  price: number;
  unit: string;
  summary: string;
  lanes: string;
}[] = [
  {
    id: "individual",
    name: "Individual cage",
    price: 50,
    unit: "/ hour",
    summary: "One cage. Focused hitting or pitching work.",
    lanes: "Lanes 1, 2, 5, 6, 7",
  },
  {
    id: "team",
    name: "Team cage",
    price: dollars("team"),
    unit: "/ hour",
    summary: "One cage. Space for your team's next workout.",
    lanes: "Lanes 1, 2, 5, 6, 7",
  },
  {
    id: "field",
    name: "Fielding area",
    price: dollars("field"),
    unit: "/ hour",
    summary: "Combined lanes 3–4 for defensive repetitions.",
    lanes: "Cages 3 and 4",
  },
];

export const MEMBERSHIPS = [
  {
    name: "Prospect",
    price: dollars("prospect"),
    period: "/ month",
    hours: 2,
    hourly: "$39.50 / included hour",
    bestFor: "One athlete · two sessions a month",
    savings: "About $21 vs two drop-in hours",
    featured: false,
    perks: [
      "Two 1-hour cage rentals included",
      "Household athletes only — not for team practices",
    ],
  },
  {
    name: "All-Star",
    price: dollars("all-star"),
    period: "/ month",
    hours: 4,
    hourly: "$34.75 / included hour",
    bestFor: "The weekly trainer",
    savings: "About $61 vs four drop-in hours",
    featured: true,
    perks: [
      "Four 1-hour cage rentals included",
      "14-day priority booking",
      "Household athletes only — not for team practices",
    ],
  },
  {
    name: "Elite Family",
    price: dollars("elite-family"),
    period: "/ month",
    hours: 6,
    hourly: "$33.17 / included hour",
    bestFor: "Two household athletes",
    savings: "Six hours to split across the household",
    featured: false,
    perks: [
      "Six 1-hour cage rentals, shared",
      "Two household athletes",
      "Household use only — not for team practices",
    ],
  },
] as const;

export const TEAM_MEMBERSHIPS = [
  {
    space: "One cage",
    rates: [
      { duration: "1 hour", price: 219 },
      { duration: "90 min", price: 329 },
      { duration: "2 hours", price: 439 },
    ],
  },
  {
    space: "Two cages",
    rates: [
      { duration: "1 hour", price: 399 },
      { duration: "90 min", price: 599 },
      { duration: "2 hours", price: 799 },
    ],
  },
  {
    space: "Field / team area",
    rates: [
      { duration: "1 hour", price: 289 },
      { duration: "90 min", price: 429 },
      { duration: "2 hours", price: 549 },
    ],
  },
] as const;

export const LESSONS = [
  {
    name: "New Pitcher Assessment",
    detail: "75 minutes · required entry point",
    dest: "lessons" as const,
    prices: [{ label: "75 min", price: dollars("s1") }],
  },
  {
    name: "Hitting Assessment",
    detail: "60 minutes · swing, contact, power",
    dest: "lessons" as const,
    prices: [{ label: "60 min", price: dollars("s9") }],
  },
  {
    name: "Private 30",
    detail: "Pitching, hitting, or catching",
    dest: "lessons" as const,
    prices: [{ label: "30 min", price: 60 }],
  },
  {
    name: "Private 60",
    detail: "Pitching, hitting, catching, or fielding",
    dest: "lessons" as const,
    prices: [{ label: "60 min", price: 100 }],
  },
] as const;

export const LANES = [
  {
    id: "1",
    name: "Mound lane",
    size: "75 × 14 ft",
    use: "Pitching and bullpen work",
    tone: "maroon" as const,
  },
  {
    id: "2",
    name: "Mound lane",
    size: "75 × 14 ft",
    use: "Pitching and bullpen work",
    tone: "maroon" as const,
  },
  {
    id: "3–4",
    name: "Combined fielding area",
    size: "70 × 28 ft",
    use: "Defensive repetitions and team stations",
    tone: "navy" as const,
    tall: true,
  },
  {
    id: "5",
    name: "Machine lane",
    size: "60 × 14 ft",
    use: "Pitching machine work",
    tone: "ink" as const,
  },
  {
    id: "6",
    name: "Hitting lane",
    size: "60 × 14 ft",
    use: "Tee work, front toss, and live hitting",
    tone: "powder" as const,
  },
  {
    id: "7",
    name: "Dual-use lane",
    size: "60 × 14 ft",
    use: "Softball machine and baseball hitting",
    tone: "maroon" as const,
  },
] as const;

/** One row per rentable space. Lanes 3–4 book together as the fielding area. */
export const BOOKABLE_LANES = [
  { id: "1", name: "Lane 1 · Mound", group: "cage" as const, size: "75 × 14 ft" },
  { id: "2", name: "Lane 2 · Mound", group: "cage" as const, size: "75 × 14 ft" },
  { id: "3-4", name: "Lanes 3–4 · Fielding", group: "field" as const, size: "70 × 28 ft" },
  { id: "5", name: "Lane 5 · Machine", group: "cage" as const, size: "60 × 14 ft" },
  { id: "6", name: "Lane 6 · Hitting", group: "cage" as const, size: "60 × 14 ft" },
  { id: "7", name: "Lane 7 · Dual-use", group: "cage" as const, size: "60 × 14 ft" },
] as const;

export type BookableLaneId = (typeof BOOKABLE_LANES)[number]["id"];

export const PEOPLE = [
  {
    name: "Facility desk",
    role: "Cages, paid bookings, arriving today",
    phoneDisplay: "(918) 922-8114",
    tel: "+19189228114",
    action: "Call the desk",
    href: "tel:+19189228114",
  },
  {
    name: "Coach Steve",
    role: "Lessons, development, member access",
    phoneDisplay: "(918) 760-2719",
    tel: "+19187602719",
    action: "Text Coach Steve",
    href: "sms:+19187602719",
  },
] as const;

export const FIRST_VISIT = [
  {
    title: "Confirm your reservation",
    body: "The lane is yours when checkout says reserved — not when you pick a time. Nothing is booked until you confirm.",
  },
  {
    title: "Sign the annual waiver",
    body: "Parent or guardian signs for athletes under 18. One waiver covers the year.",
  },
  {
    title: "Know the door",
    body: "3804 S. Elm Pl., Suite A, Broken Arrow. Text the desk if you are late or the gate is locked.",
  },
  {
    title: "Bring the basics",
    body: "Turf or indoor shoes, water, and a helmet if you are hitting live.",
  },
] as const;

export const PAY_METHODS = [
  {
    id: "card",
    name: "Debit or credit",
    preferred: true,
    note: "Payment is required to confirm a booking. Call the front desk for help while card checkout is unavailable.",
  },
] as const;

export const FAQ = [
  {
    q: "Can I walk in without a reservation?",
    a: "Every hour is reserved in advance, so the lane is actually yours. Pick a live slot, check out, then show up ready to work.",
  },
  {
    q: "Why is a reserved hour $50?",
    a: "That is the one-off household rate for one cage. A monthly cage pass brings the hour down — All-Star is under $35 an hour with first pick of times.",
  },
  {
    q: "Are you open during the day?",
    a: "After school, on purpose. Monday–Friday 4–8 PM. Saturday–Sunday 1–8 PM, by reservation. Spring evaluations are November 14–15. November 14 uses Saturday morning hours — doors open at 8:45 AM for 5U.",
  },
  {
    q: "Can I rent more than one cage at the same time?",
    a: "Yes. Book one lane or several — same start time and duration — and pay for all of them in one checkout. Coaches often take two hitting lanes, or a lane plus the fielding area.",
  },
  {
    q: "Do you offer baseball and softball?",
    a: "Yes. Baseball and softball both train here. Lane 7 is the dual-use machine and hitting lane. Tell the coach your sport when you book, or text Coach Steve.",
  },
  {
    q: "I’m new. Where do I start?",
    a: "Want reps today? Reserve a cage. Want coaching? Start with an assessment — pitching 75 min / $149, hitting 60 min / $150. Private hours are $100 after that. Ordinary lessons and packages unlock after your coach completes your assessment. Monthly coaching is four sessions a month from $229.",
  },
  {
    q: "What if I need to cancel?",
    a: "Cancel 48 hours ahead for a full refund. Between 24 and 48 hours you receive a 50% refund. Inside 24 hours there is no refund. Same window for cages, lessons, packages, and the current month of a membership. You can stop auto-renew anytime.",
  },
] as const;

export const PROOF = [
  { label: "Est.", value: "2008" },
  { label: "Facility", value: "7 lanes" },
  { label: "Booking", value: "By reservation" },
  { label: "Tryouts", value: "Free evals" },
] as const;

export const SERVICES = [
  {
    n: "01",
    eyebrow: "Put in the reps",
    title: "Cage rentals",
    to: "/book",
    image: "/brand/facility.jpg",
    alt: "Indoor batting cages at Prospects",
  },
  {
    n: "02",
    eyebrow: "Build your game",
    title: "Private lessons",
    to: "/training",
    image: "/brand/training.jpg",
    alt: "Coach working with athletes at Prospects",
  },
  {
    n: "03",
    eyebrow: "Find your team",
    title: "Teams & tryouts",
    to: "/teams",
    image: "/brand/team.jpg",
    alt: "Prospects athletes and coach on the field",
  },
] as const;
