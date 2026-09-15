/** RAMP warm-ups. Coaching language matches the curriculum module. Do not rewrite. */

export type RampLetter = "R" | "A" | "M" | "P";
export type WarmupBand = "youth" | "developing" | "advanced";

export type WarmupStep = {
  letter: RampLetter;
  name: string;
  reps: string;
  why: string;
  play?: boolean;
};

export type WarmupPlan = {
  id: string;
  title: string;
  discipline: "Pitching" | "Hitting" | "Catching" | "Fielding";
  band: WarmupBand;
  sport?: "baseball" | "softball";
  minutes: number;
  principle: string;
  steps: WarmupStep[];
};

export const WARMUP_PRINCIPLES = {
  ramp: "The warm-up follows RAMP: Raise, Activate, Mobilize, Potentiate. Raise core temperature and heart rate. Activate the muscles the delivery depends on. Mobilize through dynamic range. Potentiate the nervous system with progressively higher-intent movement.",
  static:
    "Static stretching before throwing is the classic mistake. A single bout of static stretching reduces maximal strength by roughly five per cent and power by about two — small numbers that matter when you're asking for max intent. Short holds inside a full dynamic warm-up are fine; long holds in isolation are not.",
  youth:
    "Youth athletes need a shorter warm-up with more play — you're raising temperature and building movement vocabulary, and a game does that better than a lecture.",
  developing:
    "Developing athletes in the middle of a growth spurt need more Raise, because limb lengths changed since last month and the body genuinely needs to re-learn where its feet are.",
  advanced:
    "Advanced athletes need real potentiation: build-up sprints, lateral bounds, and a throwing progression that finishes at close to game intent.",
  finish:
    "Finish potentiation within about five minutes of the first real rep.",
  recovery:
    "Recovery is the other half. Blood flow beats rest for tissue quality — an easy bike, band work at low load, and mobility on the day after a high-intent outing does more than sitting still.",
} as const;

export const WARMUPS: WarmupPlan[] = [
  {
    id: "pit-youth",
    title: "Youth pitching — play first",
    discipline: "Pitching",
    band: "youth",
    sport: "baseball",
    minutes: 8,
    principle: WARMUP_PRINCIPLES.youth,
    steps: [
      { letter: "R", name: "Tag / shuttles", reps: "2 minutes of chase or 20 skips + 10 bear crawls", why: "A game raises temperature and builds movement vocabulary better than a lecture.", play: true },
      { letter: "A", name: "Athletic throws on a knee", reps: "8 each, easy", why: "The cuff turns on without a formal delivery. Youth do not get a band lecture." },
      { letter: "M", name: "World's greatest + hip openers", reps: "4 each side", why: "Short. Dynamic. No long static holds before they throw." },
      { letter: "P", name: "Play catch, then four rockers", reps: "Catch play 45 ft · 4 rocker throws", why: "The last warm-up throws should look like the first real pitch." },
    ],
  },
  {
    id: "pit-dev",
    title: "Developing pitching — rebalance after the spurt",
    discipline: "Pitching",
    band: "developing",
    sport: "baseball",
    minutes: 12,
    principle: WARMUP_PRINCIPLES.developing,
    steps: [
      { letter: "R", name: "Skip, shuffle, high knees, backpedal", reps: "20 each · extra Raise", why: "Limb lengths changed since last month. The body has to re-learn where its feet are." },
      { letter: "A", name: "Cuff + lead leg", reps: "8 YTW · 8 band ER · 6 split-stance marches each side", why: "Pitching activates cuff and lead leg before the arm path exists." },
      { letter: "M", name: "Bilateral rebalancing", reps: "6 single-leg RDL each side · 6 world's greatest each side", why: "After a growth spurt the two hips are not the same hip. Train both, every day." },
      { letter: "P", name: "Athletic throws → rockers → step-behinds", reps: "8 · 6 · 4", why: "Finish potentiation within about five minutes of the first real rep." },
    ],
  },
  {
    id: "pit-adv",
    title: "Advanced pitching — real potentiation",
    discipline: "Pitching",
    band: "advanced",
    sport: "baseball",
    minutes: 16,
    principle: WARMUP_PRINCIPLES.advanced,
    steps: [
      { letter: "R", name: "Build-up sprints", reps: "3 × 20 yd, walk back", why: "Advanced athletes need real potentiation, not a longer walk." },
      { letter: "A", name: "Cuff + lead-leg isometric", reps: "8 reverse throws · 8 ER · 20s split-stance hold each side", why: "Pitching activates cuff and lead leg. The hold is the block they will use." },
      { letter: "M", name: "T-spine + hip", reps: "6 openers each side · 6 sleeper stretch short holds", why: "Short holds inside a full dynamic warm-up are fine; long holds in isolation are not." },
      { letter: "P", name: "Lateral bounds + throwing ladder", reps: "4 bounds each way · 10 athletic · 8 rockers · 6 pull-downs", why: "A throwing progression that finishes at close to game intent. Watch the last few — they should look like the first real pitch." },
    ],
  },
  {
    id: "hit-youth",
    title: "Youth hitting — play, then a bat",
    discipline: "Hitting",
    band: "youth",
    sport: "baseball",
    minutes: 8,
    principle: WARMUP_PRINCIPLES.youth,
    steps: [
      { letter: "R", name: "Relay races / skip tag", reps: "2 minutes", why: "Play raises temperature. A 9-year-old does not need a foam roller speech.", play: true },
      { letter: "A", name: "Dead bug + glute bridge", reps: "6 each", why: "Anti-rotation in a shape they can feel." },
      { letter: "M", name: "Hip openers", reps: "4 each side", why: "Hips have to turn before a bat is in the hands." },
      { letter: "P", name: "Dry swings then tee", reps: "8 dry · 6 tee middle", why: "On-deck: five swings with a normal or light bat, never a donut." },
    ],
  },
  {
    id: "hit-dev",
    title: "Developing hitting — anti-rotation and hip rotators",
    discipline: "Hitting",
    band: "developing",
    minutes: 12,
    principle: "Hitting anti-rotation and hip rotators. Developing athletes get bilateral rebalancing after growth spurts.",
    steps: [
      { letter: "R", name: "Skip + carioca + open-closes", reps: "20 · 10 each way · 10", why: "More Raise. The feet moved since last month." },
      { letter: "A", name: "Pallof + clams", reps: "8 presses each side · 10 clams each side", why: "Anti-rotation so the pelvis can turn under a quiet torso. Hip rotators so it actually can." },
      { letter: "M", name: "90/90 + world's greatest both sides", reps: "6 each", why: "Bilateral. After a growth spurt one hip is not a proxy for the other." },
      { letter: "P", name: "Med-ball rotational then dry swings", reps: "5 each side · 8 dry", why: "Intent without a bat, then the bat." },
    ],
  },
  {
    id: "hit-adv",
    title: "Advanced hitting — potentiate the turn",
    discipline: "Hitting",
    band: "advanced",
    minutes: 14,
    principle: WARMUP_PRINCIPLES.advanced,
    steps: [
      { letter: "R", name: "Build-up skips + lateral bounds", reps: "2 × 20 yd · 4 each way", why: "Real potentiation." },
      { letter: "A", name: "Pallof hold + band hip rotator", reps: "12s hold each side · 8 each", why: "Anti-rotation and hip rotators before the first swing." },
      { letter: "M", name: "T-spine openers", reps: "6 each side", why: "The barrel cannot get there if the thorax cannot." },
      { letter: "P", name: "Med-ball · dry · tee outer third", reps: "6 each side · 6 dry · 8 oppo tee", why: "Finish within five minutes of the first real round. Never a donut." },
    ],
  },
  {
    id: "cat-youth",
    title: "Youth catching — get low through play",
    discipline: "Catching",
    band: "youth",
    minutes: 8,
    principle: WARMUP_PRINCIPLES.youth,
    steps: [
      { letter: "R", name: "Crab walks + frog hops", reps: "2 minutes", why: "Play gets them low. A lecture on adductor capacity does not.", play: true },
      { letter: "A", name: "Stance holds", reps: "3 × 10s", why: "Sit. Breathe. Stand." },
      { letter: "M", name: "Deep squat play", reps: "20s", why: "Heels down. Make it a game — who can sit longest." },
      { letter: "P", name: "Short hops then receives", reps: "8 hops · 8 receives", why: "Hands last." },
    ],
  },
  {
    id: "cat-dev",
    title: "Developing catching — Copenhagen and deep squat",
    discipline: "Catching",
    band: "developing",
    minutes: 12,
    principle: "Catching adds Copenhagen and a deep squat. Developing athletes get bilateral rebalancing after growth spurts.",
    steps: [
      { letter: "R", name: "Lateral shuffle + hip openers", reps: "20 shuffles · 6 openers each", why: "More Raise. The hips have a new length." },
      { letter: "A", name: "Copenhagen + deep squat hold", reps: "15s each side · 30s squat", why: "Adductor capacity and time in the hole. You cannot squat your way into a block." },
      { letter: "M", name: "Ankle rocks + 90/90 both sides", reps: "6 · 6", why: "Bilateral. Receiving is a two-hip problem after a spurt." },
      { letter: "P", name: "Short hops · receives · two blocks", reps: "10 · 8 · 4", why: "The last warm-up block should look like the first live one." },
    ],
  },
  {
    id: "cat-adv",
    title: "Advanced catching — holds then speed",
    discipline: "Catching",
    band: "advanced",
    minutes: 14,
    principle: WARMUP_PRINCIPLES.advanced,
    steps: [
      { letter: "R", name: "Lateral bounds + shuffle", reps: "4 each way · 20 yd", why: "Real potentiation into the hips." },
      { letter: "A", name: "Copenhagen + deep squat", reps: "25s each side · 40s squat", why: "Catching adds Copenhagen and a deep squat every session, not on sore days only." },
      { letter: "M", name: "Hip 90/90 + ankle", reps: "6 each", why: "Range before the first pop time." },
      { letter: "P", name: "Receives · blocks · two pops", reps: "10 edges · 6 blocks · 2 throws", why: "Finish close to game intent." },
    ],
  },
  {
    id: "sb-youth",
    title: "Youth softball — windmill play",
    discipline: "Pitching",
    band: "youth",
    sport: "softball",
    minutes: 8,
    principle: "Softball adds a windmill progression. Youth still use play.",
    steps: [
      { letter: "R", name: "Skip tag + circles", reps: "1 minute tag · 10 arm circles each way", why: "Play, then the circle.", play: true },
      { letter: "A", name: "Windmill circle, no ball", reps: "8", why: "Long arm. Brush the hip. No whip talk yet." },
      { letter: "M", name: "Hip openers", reps: "4 each side", why: "The drive leg has to move." },
      { letter: "P", name: "Walk-through circles then easy pitches", reps: "6 walk-throughs · 6 easy", why: "The last ones look like the first real pitch." },
    ],
  },
  {
    id: "sb-dev",
    title: "Developing softball — windmill progression",
    discipline: "Pitching",
    band: "developing",
    sport: "softball",
    minutes: 12,
    principle: "Softball adds a windmill progression: circle, walk-through, K-position. Developing athletes get bilateral rebalancing after growth spurts.",
    steps: [
      { letter: "R", name: "Skip + extra Raise", reps: "20 skips · 10 shuffles each way", why: "Growth spurts steal the map of the circle. Raise more." },
      { letter: "A", name: "Cuff + windmill circle", reps: "8 YTW · 8 unloaded circles", why: "Cuff first. Circle second. Weighted balls stay off a growing arm." },
      { letter: "M", name: "Single-leg RDL both sides + hip openers", reps: "6 each · 6 each", why: "Bilateral rebalancing. The drive leg and the stride leg both changed." },
      { letter: "P", name: "Walk-through · K-hold · easy rise", reps: "6 · 4 holds · 6 pitches", why: "The progression is the warm-up. Do not skip to the pitch." },
    ],
  },
  {
    id: "sb-adv",
    title: "Advanced softball — circle at intent",
    discipline: "Pitching",
    band: "advanced",
    sport: "softball",
    minutes: 14,
    principle: WARMUP_PRINCIPLES.advanced,
    steps: [
      { letter: "R", name: "Build-up sprints", reps: "3 × 20 yd", why: "Real potentiation." },
      { letter: "A", name: "Cuff + K-position holds", reps: "8 reverse throws · 6 K-holds", why: "The K is a position, not a pause in the pitch." },
      { letter: "M", name: "Drive-leg hip + T-spine", reps: "6 each", why: "Windmill velocity is the drive leg first." },
      { letter: "P", name: "Walk-throughs · pull-downs · two at game intent", reps: "6 · 4 · 2", why: "Finish at close to game intent. Watch the last two." },
    ],
  },
  {
    id: "fld-dev",
    title: "Fielding — feet then hands",
    discipline: "Fielding",
    band: "developing",
    minutes: 10,
    principle: "Footwork before a ball is hit. Developing athletes get both sides.",
    steps: [
      { letter: "R", name: "Skip + carioca", reps: "20 · 10 each way", why: "Raise through the feet." },
      { letter: "A", name: "Mini-band walks", reps: "8 each way", why: "Loud feet, quiet hands." },
      { letter: "M", name: "World's greatest both sides", reps: "6 each", why: "Bilateral. Angles are a two-hip problem." },
      { letter: "P", name: "Short hops · drop steps", reps: "8 · 4 each way", why: "Game speed, short distance." },
    ],
  },
];

export function warmupBandForAge(age: number): WarmupBand {
  if (age <= 12) return "youth";
  if (age <= 15) return "developing";
  return "advanced";
}
