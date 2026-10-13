import { trainingDrills, type TrainingDrill } from "./training-catalog";
import type { LessonSport, LessonDiscipline } from "./lesson-templates";
export type DevelopmentProgram = {
  id: string;
  version: string;
  name: string;
  sport: LessonSport;
  discipline: LessonDiscipline;
  minAge: number;
  minimumSkill: number;
  objective: string;
  baseline: string;
  equipment: string;
  phases: { name: string; drillIds: string[]; checkpoint: string; regression: string }[];
  frequency: string;
  recovery: string;
  completion: string;
  next: string;
  keywords: string[];
};
// Authored specialty sequences are coaching drafts, never automatically prescribed.
// Dates organize practice; coach-observed checkpoints unlock each subsequent phase.
type Spec = [
  string,
  LessonDiscipline,
  string,
  number,
  number,
  string,
  string,
  string[],
  string[],
  string,
];
const shared: Spec[] = [
  [
    "contact",
    "Hitting",
    "Balanced contact foundation",
    5,
    0,
    "Repeat centered contact while finishing in balance",
    "Record centered contacts and balanced finishes separately at one tee height",
    ["hitting-1,hitting-2", "hitting-3,hitting-4", "hitting-7,hitting-21", "hitting-1,hitting-4"],
    [
      "Comfortable stance and repeatable landing",
      "Reach the contact point without leaning",
      "Adjust to a named height or lane while retaining balance",
      "Repeat the initial tee task under the same conditions",
    ],
    "stance balance contact beginner",
  ],
  [
    "timing",
    "Hitting",
    "Load, rhythm and moving-ball timing",
    8,
    1,
    "Prepare on time without rushing the swing",
    "Compare tee rhythm with protected gentle front toss; record early/on-time/late",
    [
      "hitting-9,hitting-10",
      "hitting-2,hitting-11",
      "hitting-11,hitting-12",
      "hitting-10,hitting-11",
    ],
    [
      "Maintain rhythm without a ball",
      "Begin the load before the gentle feed",
      "Make a take/swing choice without losing rhythm",
      "Repeat the same feed speed and distance for comparison",
    ],
    "timing rhythm load late early",
  ],
  [
    "barrel",
    "Hitting",
    "Barrel control across locations",
    8,
    1,
    "Adjust contact point to location while maintaining a controlled swing",
    "Record centered contacts separately for inside, middle and outside tee locations",
    ["hitting-3,hitting-4", "hitting-5,hitting-6", "hitting-7,hitting-8", "hitting-4,hitting-5"],
    [
      "Find a comfortable middle contact point",
      "Demonstrate location-specific contact points",
      "Respond to one location change at a time",
      "Compare contact under identical tee locations",
    ],
    "barrel location contact accuracy",
  ],
  [
    "decisions",
    "Hitting",
    "Strike-zone recognition and decisions",
    8,
    1,
    "Separate a good swing decision from the contact result",
    "Record strike/ball calls without swinging; agree on a clearly marked zone",
    [
      "hitting-13,hitting-20",
      "hitting-12,hitting-14",
      "hitting-11,hitting-15",
      "hitting-13,hitting-14",
    ],
    [
      "Explain the selected zone and reset routine",
      "State an approach before a count-based task",
      "Keep a sound decision when a familiar feed is added",
      "Compare correct decisions at the same feed conditions",
    ],
    "recognition zone chase decisions count",
  ],
  [
    "situations",
    "Hitting",
    "Situational offense and two-strike approach",
    11,
    2,
    "Explain and execute an offensive choice for the stated count and runners",
    "Coach records the athlete explanation before judging the contact outcome",
    [
      "hitting-14,hitting-16",
      "hitting-15,hitting-21",
      "hitting-16,hitting-18",
      "hitting-14,hitting-16",
    ],
    [
      "Name outs, runners and an appropriate target",
      "Demonstrate one approved two-strike adjustment",
      "Choose between familiar contact and supervised short-game tasks",
      "Repeat equivalent situations and compare decisions independently of hits",
    ],
    "situational two-strike runner approach",
  ],
  [
    "power",
    "Hitting",
    "Controlled swing efficiency before bat-speed work",
    13,
    2,
    "Retain landing, sequence and centered contact as intent is individually adjusted",
    "Document comfortable-effort contact and available bat-speed measurement; missing radar stays missing",
    ["hitting-2,hitting-9", "hitting-10,hitting-3", "hitting-4,hitting-11", "hitting-3,hitting-4"],
    [
      "Land without drifting",
      "Coordinate load and turn without forcing range",
      "Retain contact quality at a coach-approved intent",
      "Compare the same bat, ball and measurement setup; no speed gain is promised",
    ],
    "power bat speed sequence strength",
  ],
  [
    "receive",
    "Catching",
    "Receiving setup and glove control",
    5,
    0,
    "Receive safe soft feeds without lunging",
    "Record secure receptions and comfortable stance resets on gentle central feeds",
    [
      "catching-1,catching-2",
      "catching-3,catching-4",
      "catching-5,catching-17",
      "catching-3,catching-20",
    ],
    [
      "Reset in a comfortable fitted stance",
      "Present the glove before the feed",
      "Move to a called location without reaching late",
      "Compare secure catches and posture on identical feeds",
    ],
    "receiving stance glove catcher",
  ],
  [
    "block",
    "Catching",
    "Blocking, recovery and ball location",
    8,
    1,
    "Keep a soft blocked ball in front and locate it before recovery",
    "Observe dry block posture before counting foam-ball blocks",
    [
      "catching-11,catching-12",
      "catching-13,catching-14",
      "catching-14,catching-15",
      "catching-12,catching-13",
    ],
    [
      "Use protected posture without discomfort",
      "Move into the ball path before settling",
      "Locate the ball before a controlled recovery",
      "Repeat central and lateral foam feeds under matched conditions",
    ],
    "blocking lateral passed ball recovery",
  ],
  [
    "transfer",
    "Catching",
    "Transfer, footwork and throwing preparation",
    8,
    1,
    "Secure the ball before a balanced transfer and direction change",
    "Observe glove-to-hand transfers and dry alignment; throwing volume reviewed separately",
    [
      "catching-6,catching-8",
      "catching-7,catching-9",
      "catching-9,catching-10",
      "catching-6,catching-8",
    ],
    [
      "Find a repeatable grip without rushing",
      "Align feet after a secure feed",
      "Choose the correct turn for the named base",
      "Compare clean transfers and aligned finishes; speed is secondary",
    ],
    "transfer throw footwork pop time",
  ],
  [
    "manage",
    "Catching",
    "Catcher communication and game management",
    11,
    2,
    "Communicate the plan and responsibilities before the play",
    "Ask the athlete to describe count, runners and defensive responsibility",
    [
      "catching-17,catching-19",
      "catching-16,catching-18",
      "catching-15,catching-19",
      "catching-17,catching-20",
    ],
    [
      "Use a clear shared call",
      "Demonstrate a safe foul-ball or tag position",
      "Explain pitch selection and passed-ball responsibilities",
      "Coach reassesses communication in equivalent game situations",
    ],
    "game calling communication catcher awareness",
  ],
  [
    "infield",
    "Fielding",
    "Infield approach and glove fundamentals",
    5,
    0,
    "Arrive balanced and gather an easy ground ball securely",
    "Record clean gathers from slow rolls on a level surface",
    [
      "fielding-1,fielding-2",
      "fielding-3,fielding-4",
      "fielding-5,fielding-6",
      "fielding-2,fielding-9",
    ],
    [
      "Reset ready position before each roll",
      "Move the feet toward forehand and backhand rolls",
      "Gather before transferring into dry target alignment",
      "Compare clean gathers and choices under the initial roll speed",
    ],
    "infield ground glove forehand backhand",
  ],
  [
    "outfield",
    "Fielding",
    "Outfield reads, routes and tracking",
    8,
    1,
    "Choose an efficient first step and safe route before catching",
    "Record first-step choices from coach pointing cues before adding soft tosses",
    [
      "fielding-13,fielding-14",
      "fielding-15,fielding-16",
      "fielding-14,fielding-20",
      "fielding-13,fielding-15",
    ],
    [
      "Turn under control without crossing into another lane",
      "Track a soft ball from a known direction",
      "Communicate priority before taking the route",
      "Compare first-step decisions and catches at matched distances",
    ],
    "outfield route fly tracking first step",
  ],
  [
    "position",
    "Fielding",
    "Base-specific footwork and transfers",
    8,
    1,
    "Match footwork to the base and intended target",
    "Observe dry base approach and clean glove-to-hand transfer",
    [
      "fielding-5,fielding-11",
      "fielding-10,fielding-12",
      "fielding-7,fielding-19",
      "fielding-11,fielding-10",
    ],
    [
      "Locate the base without looking away from the feed",
      "Demonstrate feed and receiving footwork at walking speed",
      "Decide whether to hold or use a familiar transfer",
      "Repeat the same position-specific task with clean alignment",
    ],
    "position double play first base transfer",
  ],
  [
    "defense",
    "Fielding",
    "Relays, backups and defensive decisions",
    11,
    2,
    "State the responsibility and target before moving",
    "Use a field diagram to record correct responsibilities for runners and outs",
    [
      "fielding-17,fielding-18",
      "fielding-19,fielding-20",
      "fielding-9,fielding-17",
      "fielding-18,fielding-19",
    ],
    [
      "Align a relay and identify the backup",
      "Give an audible priority call",
      "Respond to one changed runner or out condition",
      "Reassess the same situations without coach prompting",
    ],
    "relay cutoff backup situational defense",
  ],
  [
    "throwing",
    "Fielding",
    "Position-player throwing preparation",
    8,
    1,
    "Build a secure grip and aligned transfer within a reviewed throwing schedule",
    "Record readiness, recent throwing and dry transfer quality before any catch play",
    [
      "fielding-5,fielding-6",
      "fielding-11,fielding-17",
      "fielding-19,fielding-6",
      "fielding-5,fielding-19",
    ],
    [
      "Demonstrate a comfortable dry transfer",
      "Align the body to a broad target",
      "Choose a suitable target and hold when the play is unavailable",
      "Coach reassesses dry mechanics and separately approves the existing throwing plan",
    ],
    "throwing catch play direction arm preparation",
  ],
  [
    "movement",
    "Strength/Speed",
    "Foundational movement and balance",
    5,
    0,
    "Control a supported squat, hinge and balance task",
    "Record comfortable range and balance duration without external loading",
    [
      "strengthspeed-1,strengthspeed-6",
      "strengthspeed-2,strengthspeed-4",
      "strengthspeed-14,strengthspeed-16",
      "strengthspeed-1,strengthspeed-6",
    ],
    [
      "Use a stable support and comfortable range",
      "Keep control through the hinge and split stance",
      "Coordinate walking rhythm and a balanced stop",
      "Repeat original range and balance tasks without forcing depth",
    ],
    "movement coordination balance beginner",
  ],
  [
    "strength",
    "Strength/Speed",
    "Bodyweight strength and postural control",
    8,
    1,
    "Maintain breathing and control in approved bodyweight movements",
    "Observe unweighted technique and record comfortable repetitions without testing a maximum",
    [
      "strengthspeed-1,strengthspeed-3",
      "strengthspeed-4,strengthspeed-9",
      "strengthspeed-7,strengthspeed-10",
      "strengthspeed-1,strengthspeed-3",
    ],
    [
      "Demonstrate stable squat and wall push-up",
      "Control a split stance and bridge without holding breath",
      "Maintain trunk position during a short support task",
      "Compare technique at the original support height; loading needs qualified review",
    ],
    "strength bodyweight upper lower posture",
  ],
  [
    "trunk",
    "Strength/Speed",
    "Trunk control and rotational movement",
    8,
    1,
    "Move limbs while controlling comfortable trunk position",
    "Observe supported limb reaches and comfortable rotation range",
    [
      "strengthspeed-8,strengthspeed-13",
      "strengthspeed-7,strengthspeed-9",
      "strengthspeed-10,strengthspeed-13",
      "strengthspeed-8,strengthspeed-7",
    ],
    [
      "Breathe through a small controlled movement",
      "Avoid excessive trunk movement during a reach",
      "Rotate only through comfortable range",
      "Compare original tasks with equal support and range",
    ],
    "trunk rotation core stability",
  ],
  [
    "speed",
    "Strength/Speed",
    "Acceleration posture and controlled stopping",
    8,
    1,
    "Coordinate an initial step and decelerate within a clear lane",
    "Observe march rhythm and walking stops; timing only if the same method is available",
    [
      "strengthspeed-14,strengthspeed-15",
      "strengthspeed-16,strengthspeed-19",
      "strengthspeed-17,strengthspeed-19",
      "strengthspeed-14,strengthspeed-16",
    ],
    [
      "Maintain rhythm without rushing",
      "Stop within the agreed space at comfortable speed",
      "Respond to a simple cue with control",
      "Compare initial-step quality under identical cue and surface conditions",
    ],
    "speed acceleration agility reaction",
  ],
  [
    "landing",
    "Strength/Speed",
    "Landing control before explosive training",
    8,
    1,
    "Absorb a low controlled movement with stable alignment",
    "Observe a small snap-down without jumping before approving any impact progression",
    [
      "strengthspeed-6,strengthspeed-18",
      "strengthspeed-4,strengthspeed-16",
      "strengthspeed-18,strengthspeed-17",
      "strengthspeed-6,strengthspeed-18",
    ],
    [
      "Hold a stable supported balance",
      "Control a split stance and stop",
      "Repeat low-amplitude landing posture without collapse",
      "Reassess original control; no automatic jump height or external load increase",
    ],
    "explosive landing power deceleration",
  ],
  [
    "mobility",
    "Strength/Speed",
    "Mobility and recovery awareness",
    5,
    0,
    "Identify comfortable movement and communicate fatigue",
    "Record comfortable ankle, shoulder and trunk movement without forced range",
    [
      "strengthspeed-12,strengthspeed-20",
      "strengthspeed-11,strengthspeed-13",
      "strengthspeed-5,strengthspeed-14",
      "strengthspeed-12,strengthspeed-20",
    ],
    [
      "Explain the stop signal and readiness",
      "Move through comfortable unforced range",
      "Coordinate light movement without increased symptoms",
      "Recheck the original range and readiness; this is not rehabilitation",
    ],
    "mobility recovery arm care durability",
  ],
];
const pitching: Record<LessonSport, Spec[]> = {
  baseball: [
    [
      "pitch-foundation",
      "Pitching",
      "Beginner overhand preparation",
      5,
      0,
      "Build readiness, target awareness and easy dry rhythm",
      "Record understanding of the stop signal, target and dry balance",
      [
        "baseball-foundation-3,baseball-foundation-2",
        "baseball-foundation-1,baseball-foundation-2",
        "baseball-foundation-1,baseball-foundation-3",
        "baseball-foundation-2,baseball-foundation-1",
      ],
      [
        "Explain readiness and target",
        "Rehearse comfortable rhythm without throwing",
        "Repeat the preparation without prompts",
        "Coach reassesses readiness before separate throwing approval",
      ],
      "pitching beginner preparation",
    ],
    [
      "direction",
      "Pitching",
      "Delivery rhythm and direction",
      8,
      1,
      "Maintain comfortable rhythm toward a broad target",
      "Coach observes easy delivery and direction; record all throws in total workload",
      [
        "academy-d1,academy-d3",
        "academy-d2,academy-d19",
        "academy-d8,academy-d3",
        "academy-d1,academy-d19",
      ],
      [
        "Find comfortable rhythm",
        "Land toward the selected target without forced positions",
        "Transfer direction into approved catch play",
        "Compare direction and comfort at the initial distance",
      ],
      "pitching stride direction mechanics delivery",
    ],
    [
      "command",
      "Pitching",
      "Fastball command and location",
      11,
      2,
      "Improve target intent and location tracking at approved effort",
      "Record intended and actual locations with existing 3×3 TCI; missing charts stay missing",
      [
        "academy-d11,academy-d12",
        "academy-d3,academy-d11",
        "academy-d11,academy-d12",
        "academy-d11,academy-d16",
      ],
      [
        "State the target and record misses honestly",
        "Use one observed direction cue",
        "Retain target intent when locations vary",
        "Repeat equivalent target conditions and compare location distributions",
      ],
      "command accuracy glove-side fastball target",
    ],
    [
      "competitive",
      "Pitching",
      "Competitive sequencing and reassessment",
      15,
      3,
      "Make an appropriate pitch decision without chasing velocity",
      "Review a recent chart and an observed familiar pitch repertoire before selecting sequences",
      [
        "academy-d12,academy-d16",
        "academy-d15,academy-d20",
        "academy-d14,academy-d16",
        "academy-d11,academy-d16",
      ],
      [
        "Explain familiar pitch choices",
        "Compare only pitches already approved for this athlete",
        "Execute a scenario within preapproved workload",
        "Reassess decisions and command with matched conditions; no new pitch is prescribed automatically",
      ],
      "advanced sequence pitch design competition",
    ],
  ],
  softball: [
    [
      "pitch-foundation",
      "Pitching",
      "Beginner windmill coordination",
      5,
      0,
      "Coordinate a comfortable underhand circle and balanced finish",
      "Observe dry circle and readiness before any ball release",
      [
        "softballpitching-1,softballpitching-6",
        "softballpitching-3,softballpitching-7",
        "softballpitching-4,softballpitching-8",
        "softballpitching-1,softballpitching-7",
      ],
      [
        "Rehearse a comfortable circle",
        "Find a balanced stride and finish",
        "Connect circle and stride without forcing speed",
        "Repeat the dry baseline before coach approves throwing",
      ],
      "windmill beginner circle pitching",
    ],
    [
      "release",
      "Pitching",
      "Windmill drive, rhythm and release",
      8,
      1,
      "Connect stride and circle to a comfortable release",
      "Observe underhand close release and record comfort; volume includes all pitching",
      [
        "softballpitching-2,softballpitching-3",
        "softballpitching-4,softballpitching-9",
        "softballpitching-5,softballpitching-7",
        "softballpitching-2,softballpitching-5",
      ],
      [
        "Release comfortably at short range",
        "Coordinate rhythm without forcing the circle",
        "Finish in balance toward a broad target",
        "Compare releases under the same distance and effort",
      ],
      "drive release circle stride softball mechanics",
    ],
    [
      "command",
      "Pitching",
      "Windmill location and reset routine",
      11,
      2,
      "Choose a location and reset consistently after a miss",
      "Record target intent and actual outcome at comfortable approved effort",
      [
        "softballpitching-10,softballpitching-5",
        "softballpitching-11,softballpitching-12",
        "softballpitching-15,softballpitching-16",
        "softballpitching-5,softballpitching-20",
      ],
      [
        "Agree on clear targets with catcher",
        "Plan high/low and inside/outside locations",
        "Retain routine after one changed target",
        "Compare equivalent location samples without chasing volume",
      ],
      "command softball accuracy location control",
    ],
    [
      "competitive",
      "Pitching",
      "Windmill game choices and familiar movement",
      15,
      3,
      "Select familiar approved pitches for count and runners",
      "Coach documents the current repertoire and checks readiness and recent pitching workload",
      [
        "softballpitching-13,softballpitching-14",
        "softballpitching-17,softballpitching-16",
        "softballpitching-18,softballpitching-19",
        "softballpitching-13,softballpitching-20",
      ],
      [
        "Explain the count-based choice",
        "Rehearse only an already learned approved changeup",
        "Finish ready for the defensive responsibility",
        "Compare choices and location under equivalent scenarios",
      ],
      "advanced softball movement selection competition",
    ],
  ],
};
const idOf = (id: string) =>
  id.startsWith("academy-") || id.startsWith("baseball-") ? id : `training-${id}`;
export const developmentPrograms: DevelopmentProgram[] = (
  ["baseball", "softball"] as const
).flatMap((sport) => {
  const specs = [...shared, ...pitching[sport]];
  if (sport === "softball")
    specs.push([
      "short-game",
      "Hitting",
      "Softball slap footwork and short game",
      8,
      1,
      "Control legal box footwork and a supervised short-game choice",
      "Observe dry crossover and protected bunt setup before any live feed",
      [
        "hitting-19,hitting-17",
        "hitting-18,hitting-19",
        "hitting-16,hitting-18",
        "hitting-19,hitting-17",
      ],
      [
        "Stay balanced inside the box",
        "Demonstrate protected hand position",
        "Explain when the short-game choice fits",
        "Recheck footwork and contact separately",
      ],
      "slap slapping bunt short game",
    ]);
  return specs.map(
    ([
      key,
      discipline,
      name,
      minAge,
      minimumSkill,
      objective,
      baseline,
      sequences,
      checks,
      keywords,
    ]) => {
      const phases = sequences.map((s, i) => ({
        name: [
          "Observe and establish",
          "Control and repeat",
          "Apply and vary",
          "Reassess and decide",
        ][i],
        drillIds: s.split(",").map(idOf),
        checkpoint: checks[i],
        regression: `Return to ${sequences[Math.max(0, i - 1)]
          .split(",")
          .map(idOf)
          .map((id) => trainingDrills.find((d) => d.id === id)?.name || id)
          .join(" and ")} at the previously comfortable constraint; review dose again.`,
      }));
      return {
        id: `${sport}-${key}`,
        version: "2026-10-13.3",
        name: `${sport === "baseball" ? "Baseball" : "Softball"} — ${name}`,
        sport,
        discipline,
        minAge: Math.max(
          minAge,
          ...phases
            .flatMap((p) => p.drillIds)
            .map((id) => trainingDrills.find((d) => d.id === id)!.minAge),
        ),
        minimumSkill: Math.max(
          minimumSkill,
          ...phases
            .flatMap((p) => p.drillIds)
            .map((id) => trainingDrills.find((d) => d.id === id)!.minimumSkill),
        ),
        objective,
        baseline,
        phases,
        equipment: [
          ...new Set(
            phases
              .flatMap((p) => p.drillIds)
              .map((id) => trainingDrills.find((d) => d.id === id)?.equipment)
              .filter(Boolean),
          ),
        ].join("; "),
        frequency:
          "Coach selects 1–3 practice days per week after reviewing games, lessons, other plans and family availability. Fewer sessions or a pause may be appropriate.",
        recovery:
          discipline === "Pitching"
            ? sport === "baseball"
              ? "Review baseball game-pitch counts, required rest, other throwing and league rules before scheduling. Dry practice does not authorize throwing."
              : "Review windmill pitching and other throwing separately with a qualified softball coach. Baseball pitch-count limits are not validated softball limits."
            : "Use comfortable, supervised practice and individualized rest. Stop for pain, unusual fatigue or loss of technique. Loading and speed do not increase automatically.",
        completion: `Coach documents whether the athlete meets: ${checks[3]}. Compare with the recorded baseline, report limitations, and explicitly complete or revise.`,
        next: `Maintain the comfortable skill or select a reviewed specialty addressing the next observed limitation. Regress to the earlier task when control is lost.`,
        keywords: keywords.split(" "),
      };
    },
  );
});
export function compatibleProgram(
  p: DevelopmentProgram,
  sport: LessonSport,
  age: number,
  skill: number,
  library: TrainingDrill[] = trainingDrills,
) {
  return (
    p.sport === sport &&
    p.minAge <= age &&
    p.minimumSkill <= skill &&
    p.phases.every((phase) =>
      phase.drillIds.every((id) => {
        const d = library.find((d) => d.id === id);
        return !!d && d.sports.includes(sport) && d.minAge <= age && d.minimumSkill <= skill;
      }),
    )
  );
}
