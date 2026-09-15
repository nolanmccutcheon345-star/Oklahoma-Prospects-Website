export type ThrowGoal = "Command" | "Velocity" | "In-Season" | "Return to Throw" | "Youth";
export type ThrowDayType =
  | "Off"
  | "Recovery"
  | "Catch play"
  | "Command"
  | "Velocity"
  | "Mound"
  | "Live"
  | "Return";

export type ThrowDay = {
  type: ThrowDayType;
  throws: string;
  intent: string;
  notes: string;
};

export type ThrowTemplate = {
  id: string;
  name: string;
  discipline: "Pitching" | "Hitting" | "Catching" | "Fielding";
  goal: ThrowGoal;
  blurb: string;
  days: ThrowDay[];
};

export const THROWING_PLANS: ThrowTemplate[] = [
  {
    id: "cmd-pit",
    name: "Command block — pitchers",
    discipline: "Pitching",
    goal: "Command",
    blurb: "Location is the work. Velocity stays in the tank. Every throw has a called target.",
    days: [
      { type: "Recovery", throws: "0 high-intent · 8–12 minutes easy bike or walk", intent: "Blood flow, not a catch", notes: "Blood flow beats rest for tissue quality." },
      { type: "Catch play", throws: "25–35", intent: "Easy, long to compact", notes: "No mound. Athletic throws count." },
      { type: "Command", throws: "30–40 called", intent: "Sub-max, every pitch has a cell", notes: "Score it. A bullpen that is not scored is catch play in a fancy shirt." },
      { type: "Mound", throws: "25–35", intent: "Game tempo, still commanded", notes: "Nine-box or quadrants. No velocity chasing." },
      { type: "Off", throws: "0", intent: "Off", notes: "Off is a day type. Put it on the calendar." },
    ],
  },
  {
    id: "vel-pit",
    name: "Velocity block — offseason only",
    discipline: "Pitching",
    goal: "Velocity",
    blurb: "Velocity work belongs in the offseason, not in April. Power volume on the floor, intent in short bursts on dirt.",
    days: [
      { type: "Recovery", throws: "0", intent: "Cuff + bike", notes: "The day after intent is blood flow and range, not rest." },
      { type: "Catch play", throws: "30–40", intent: "Build the arm, not the ego", notes: "Pull-downs only if the arm is quiet." },
      { type: "Velocity", throws: "16–24 high-intent", intent: "Short, hard, stopped when the number drops", notes: "Stop when output drops, not when the set ends." },
      { type: "Command", throws: "20 called, sub-max", intent: "Keep the strike", notes: "Velocity without a strike is batting practice for the other team." },
      { type: "Off", throws: "0", intent: "Off", notes: "Do not sneak a 'light' pen on an off day." },
    ],
  },
  {
    id: "in-pit",
    name: "In-season pitcher",
    discipline: "Pitching",
    goal: "In-Season",
    blurb: "The season is the test, not the training block. Command continues; velocity chasing stops. Two lifts a week at most.",
    days: [
      { type: "Live", throws: "Game pitches — log them", intent: "The outing", notes: "Game pitches, bullpens, and high-intent throwing all count." },
      { type: "Recovery", throws: "0–20 easy", intent: "Flush", notes: "Easy bike, band work at low load, mobility. The day after a start." },
      { type: "Catch play", throws: "20–30", intent: "Athletic, short", notes: "No mound until required rest is clear." },
      { type: "Command", throws: "20–25 called", intent: "Shape and location only", notes: "A 'light' 40-pitch bullpen on Monday after 70 on Saturday is not rest." },
      { type: "Off", throws: "0", intent: "Off", notes: "Defend it to the parent." },
    ],
  },
  {
    id: "rtt-pit",
    name: "Return to throw",
    discipline: "Pitching",
    goal: "Return to Throw",
    blurb: "Capacity before output. Nothing above RPE 7. Health status outranks the goal that got them hurt.",
    days: [
      { type: "Return", throws: "15–20 at 45 ft", intent: "RPE ≤ 5", notes: "If feel is 4+ the next morning, you do not advance." },
      { type: "Return", throws: "20–25 at 60 ft", intent: "RPE ≤ 6", notes: "Same slot, same tempo. No breaking balls until the fastball is boring." },
      { type: "Catch play", throws: "25–30", intent: "RPE ≤ 6", notes: "Long toss only when 60 ft is quiet for a week." },
      { type: "Command", throws: "20 sub-max, flat ground", intent: "RPE ≤ 7", notes: "Mound is a privilege. It is not the next day by default." },
      { type: "Off", throws: "0", intent: "Off", notes: "Two off days a week, not one." },
    ],
  },
  {
    id: "yth-pit",
    name: "Youth thrower",
    discipline: "Pitching",
    goal: "Youth",
    blurb: "Play. Fastball and changeup. No velocity program. Leave wanting one more throw.",
    days: [
      { type: "Catch play", throws: "20–30", intent: "Play catch", notes: "If they ask to stop, you already went too long." },
      { type: "Command", throws: "16–20, big targets", intent: "Quadrants, not nine-box", notes: "Younger athletes lose intent when the target gets too small too soon." },
      { type: "Mound", throws: "Only if the throw is fun", intent: "Fastball / change", notes: "No aggressive velocity program. No pitch-design discussion." },
      { type: "Off", throws: "0", intent: "Play something else", notes: "A 9-year-old does not need a throwing calendar that looks like college." },
    ],
  },
  {
    id: "cmd-hit",
    name: "Hitting — barrel work week",
    discipline: "Hitting",
    goal: "Command",
    blurb: "Command of the barrel. Tee and toss have a job. Live is a test, not the workout.",
    days: [
      { type: "Catch play", throws: "Arm care only", intent: "Easy", notes: "Hitters still throw. Ten minutes, not a pen." },
      { type: "Command", throws: "Tee + toss 40–50 swings", intent: "One constraint", notes: "Opposite-field-only counts as the constraint if that's the miss." },
      { type: "Live", throws: "20–30 swings", intent: "The test", notes: "Do not add a second constraint because live looked messy." },
      { type: "Off", throws: "0", intent: "Off", notes: "The body needs a day that is not a round." },
    ],
  },
  {
    id: "in-hit",
    name: "In-season hitter",
    discipline: "Hitting",
    goal: "In-Season",
    blurb: "Games are the volume. Training is short and specific.",
    days: [
      { type: "Live", throws: "Game ABs", intent: "The game", notes: "Log them. A tournament is not a free week in the cage." },
      { type: "Command", throws: "20–25 swings", intent: "One round, one job", notes: "On-deck: five swings with a normal or light bat, never a donut." },
      { type: "Recovery", throws: "0", intent: "Blood flow", notes: "Lower half and tissue, not extra batting practice." },
      { type: "Off", throws: "0", intent: "Off", notes: "Off." },
    ],
  },
  {
    id: "cmd-cat",
    name: "Catching — receive and throw",
    discipline: "Catching",
    goal: "Command",
    blurb: "Receiving volume first. Pops are a dose, not a personality.",
    days: [
      { type: "Catch play", throws: "Exchange ladder 50–75, no throw", intent: "Hands", notes: "Most catchers cut a tenth in the exchange. Arm strength is last." },
      { type: "Command", throws: "30 receives · 10 blocks · 6 pops", intent: "Quality", notes: "Stop pops when the feet get loud." },
      { type: "Live", throws: "Pen or game", intent: "Call it and receive it", notes: "The live day is not extra pops after." },
      { type: "Recovery", throws: "0–10 easy", intent: "Hips and tissue", notes: "Deep squat and Copenhagen stay in. Extra throws do not." },
      { type: "Off", throws: "0", intent: "Off", notes: "Knees need the day." },
    ],
  },
  {
    id: "rtt-cat",
    name: "Return to throw — catchers",
    discipline: "Catching",
    goal: "Return to Throw",
    blurb: "Receive first. Blocks second. Throws last, and only when the arm is boring.",
    days: [
      { type: "Return", throws: "Receives only", intent: "RPE ≤ 5", notes: "No pops. No blocks in the dirt until the mitt is quiet." },
      { type: "Return", throws: "Receives + 6 dry exchanges", intent: "RPE ≤ 6", notes: "Still no throw to second." },
      { type: "Catch play", throws: "10–12 easy throws", intent: "RPE ≤ 6", notes: "Short. If the next morning talks, you rewind." },
      { type: "Off", throws: "0", intent: "Off", notes: "Two offs. Not negotiable." },
    ],
  },
];

export const DAY_TYPES: ThrowDayType[] = [
  "Off",
  "Recovery",
  "Catch play",
  "Command",
  "Velocity",
  "Mound",
  "Live",
  "Return",
];
