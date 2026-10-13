import { DRILLS } from "./content/drills";
import type { LessonDiscipline, LessonSport } from "./lesson-templates";
export const TRAINING_VERSION = "2026-10-13.2";
export const skillBands = ["beginner", "developing", "intermediate", "advanced", "elite"] as const;
export const approaches = ["foundations", "targeted skill", "game performance"] as const;
export const ageBand = (age: number) =>
  age < 8
    ? "5–7"
    : age < 11
      ? "8–10"
      : age < 13
        ? "11–12"
        : age < 15
          ? "13–14"
          : age < 19
            ? "15–18"
            : "19+";
export const safetySources = [
  {
    name: "MLB / USA Baseball Pitch Smart — baseball workload and rest",
    url: "https://www.mlb.com/pitch-smart/pitching-guidelines",
  },
  {
    name: "American Academy of Pediatrics — youth sports injury prevention",
    url: "https://www.healthychildren.org/English/health-issues/injuries-emergencies/sports-injuries/Pages/Sports-Injuries-Treatment.aspx",
  },
  {
    name: "Nationwide Children’s — baseball and softball injury prevention",
    url: "https://www.nationwidechildrens.org/family-resources-education/700childrens/2017/01/injury-prevention-in-softball-and-baseball",
  },
];
export type TrainingDrill = {
  id: string;
  version: string;
  name: string;
  discipline: LessonDiscipline;
  sports: LessonSport[];
  purpose: string;
  equipment: string;
  steps: string[];
  cue: string;
  correction: string;
  regression: string;
  progression: string;
  measure: string;
  minimumSkill: number;
  minAge: number;
  supervision: string;
  safety: string;
  dose: string;
  review: "qualified coach review required";
  provenance: string;
  demoUrl: string | null;
};
// Each row defines a distinct task/constraint. Shared baseball/softball field skills retain one ID.
// Original academy copy remains in content/drills.ts; this catalog does not silently rewrite it.
type Row = [string, string, string, string, string];
const rows: Record<string, Row[]> = {
  Hitting: [
    [
      "Balanced tee contact",
      "Repeat controlled contact",
      "Bat, tee, net",
      "Place a tee in a clear hitting lane. Set a balanced stance, swing at comfortable effort, and hold the finish.",
      "Balanced contacts / attempts",
    ],
    [
      "Front-foot landing rehearsal",
      "Stabilize the landing before swinging",
      "Bat, floor marker",
      "Rehearse the stride without swinging. Land softly at the marker, pause, then return to the starting stance.",
      "Controlled landings / attempts",
    ],
    [
      "Contact-point check",
      "Learn an appropriate contact location",
      "Bat, tee, net",
      "Adjust the tee to a coach-selected contact point. Make a slow rehearsal, check reach, then take controlled swings.",
      "Centered contacts / attempts",
    ],
    [
      "Middle-lane tee",
      "Direct contact through the middle",
      "Bat, tee, net, target",
      "Mark a middle lane on a net. Use tee swings and record balls entering that lane.",
      "Middle-lane hits / attempts",
    ],
    [
      "Outer-third tee",
      "Cover an outside location",
      "Bat, tee, net",
      "Move the tee to the outer third at a comfortable reach. Send the ball toward the opposite-field target without stepping across.",
      "Target hits / attempts",
    ],
    [
      "Inner-third tee",
      "Create room for an inside pitch",
      "Bat, tee, net",
      "Place the tee on the inner third. Rehearse room for the hands, then swing without crowding the plate.",
      "Clean contacts / attempts",
    ],
    [
      "Height-change tee",
      "Adjust to different strike heights",
      "Bat, adjustable tee, net",
      "Alternate two comfortable strike heights. Reset posture before each swing and track contact by height.",
      "Contact by height",
    ],
    [
      "Two-tee choice",
      "Prepare for location variation",
      "Bat, two tees, net",
      "Set two tees safely apart. Coach names one before the athlete sets up; hit only that ball and reset.",
      "Correct choices / attempts",
    ],
    [
      "Pause-and-go load",
      "Separate preparation from rushing",
      "Bat, tee, net",
      "Load gently, pause in balance, then swing at a tee ball. Return to a full reset between attempts.",
      "Balanced starts / attempts",
    ],
    [
      "Rhythm step",
      "Coordinate a small stride with swing timing",
      "Bat, tee, net",
      "Coach gives a steady verbal rhythm. Rehearse a small stride and controlled swing on that rhythm.",
      "On-time contacts / attempts",
    ],
    [
      "Short front toss",
      "Transfer tee contact to a moving ball",
      "Bat, helmet, screen, soft balls",
      "Adult feeds gentle front toss from behind a protective screen. Athlete tracks each ball and swings only when ready.",
      "Contact / swings",
    ],
    [
      "Take-or-swing call",
      "Practice a decision before action",
      "Bat, helmet, screen, soft balls",
      "Coach calls take or swing before a gentle toss. Athlete obeys the call and holds position on takes.",
      "Correct decisions / tosses",
    ],
    [
      "Zone recognition",
      "Recognize strikes without swinging",
      "Helmet, protected feeder, soft balls",
      "Watch gentle feeds without a bat. Call strike or ball and discuss uncertain locations after each short set.",
      "Correct calls / feeds",
    ],
    [
      "Count approach",
      "Choose a plan for a count",
      "Bat, tee, net",
      "Coach names a count before a tee swing. Athlete explains a simple approach, then performs one controlled swing.",
      "Approach explanation and contact",
    ],
    [
      "Two-strike contact",
      "Practice a coach-selected contact adjustment",
      "Bat, tee, net",
      "Use a tee and a two-strike scenario. Try one small coach-selected adjustment and compare contact with the baseline.",
      "Contact before / after",
    ],
    [
      "Runner-advance target",
      "Connect a target to a game situation",
      "Bat, tee, net, target",
      "Name runners and outs. Athlete chooses a safe target on the net and explains the purpose before swinging.",
      "Decision and target outcomes",
    ],
    [
      "Bunt angle rehearsal",
      "Set a safe bunt angle without live pitching",
      "Bat, helmet, foam ball",
      "Coach demonstrates protected finger placement. With a stationary foam ball, rehearse bat angle and balanced positioning.",
      "Safe setup / attempts",
    ],
    [
      "Soft toss bunt",
      "Control a gentle bunt",
      "Bat, helmet, screen, foam balls",
      "After safe grip approval, use gentle protected feeds. Direct the foam ball into a marked short lane.",
      "Lane contacts / attempts",
    ],
    [
      "Softball slap footwork",
      "Learn footwork separately from contact",
      "Floor markers, bat held by adult",
      "For softball only, coach marks the box and rehearses a controlled crossover without a ball or swing. Reset inside the legal box.",
      "Balanced legal steps / attempts",
    ],
    [
      "Pre-pitch reset",
      "Build a repeatable preparation routine",
      "Bat, tee, net",
      "Step out safely, breathe, choose a target, then step in and take one tee swing. Repeat the same preparation.",
      "Routine completed / attempts",
    ],
    [
      "Name-the-target tee",
      "Connect a named target to controlled contact",
      "Bat, tee, net with two targets",
      "Coach names one of two targets before each tee swing. Athlete points to it, swings at comfortable effort, and checks the outcome before resetting.",
      "Named-target contacts / attempts",
    ],
  ],
  Catching: [
    [
      "Ready stance check",
      "Find a comfortable receiving stance",
      "Fitted catcher protection",
      "Set a balanced stance with a visible target. Rise and reset between brief holds; avoid forced depth.",
      "Comfortable resets",
    ],
    [
      "Target presentation",
      "Present a quiet visible target",
      "Glove, protection",
      "Partner points to a target location. Catcher sets the mitt there before any feed, then relaxes and resets.",
      "Accurate presentations",
    ],
    [
      "Soft-ball receiving",
      "Receive gently without lunging",
      "Foam balls, glove, protection",
      "Partner gently flips foam balls to the middle. Receive, hold briefly, and reset the glove.",
      "Secure catches / feeds",
    ],
    [
      "High-low receiving",
      "Adjust the target to height",
      "Foam balls, glove, protection",
      "Alternate gentle high and low feeds within a comfortable range. Move the body into balance before catching.",
      "Secure catches by height",
    ],
    [
      "Side-to-side receiving",
      "Move to receive lateral feeds",
      "Foam balls, glove, protection",
      "Use predictable gentle feeds left and right. Move the feet rather than reaching beyond balance.",
      "Balanced catches / feeds",
    ],
    [
      "Glove-to-hand transfer",
      "Secure a throwing grip",
      "Ball, glove",
      "Stand upright. Move a stationary ball from glove to throwing hand, show the grip, and reset without throwing.",
      "Clean transfers / attempts",
    ],
    [
      "Transfer from feed",
      "Link receiving with exchange",
      "Foam balls, glove",
      "Receive an easy standing flip, transfer to a grip, then stop. Keep eyes up and check grip only after the rep.",
      "Clean transfers / catches",
    ],
    [
      "Throwing footwork dry",
      "Organize feet before throwing",
      "Floor markers, glove",
      "Without a ball, move from a comfortable stance into a throwing position toward a marked target. Stop in balance.",
      "Balanced footwork / attempts",
    ],
    [
      "Pivot to second dry",
      "Align the feet for a target",
      "Markers, glove",
      "Use a second-base target marker. Rehearse a controlled pivot without a throw, then check alignment.",
      "Aligned finishes",
    ],
    [
      "Third-base turn dry",
      "Choose a clear throwing lane",
      "Markers, glove",
      "Coach indicates a third-base target. Rehearse a safe turn and foot placement without a throw or nearby batter.",
      "Clear-lane choices",
    ],
    [
      "Block posture rehearsal",
      "Learn protected blocking positioning",
      "Full protection, soft mat",
      "Coach checks fitted gear. Rehearse a comfortable blocking shape without a ball, then return to the stance.",
      "Controlled resets",
    ],
    [
      "Center foam block",
      "Keep a gentle ball in front",
      "Full protection, foam balls",
      "From close controlled feeds, coach rolls foam balls centrally. Block softly and locate the ball before rising.",
      "Balls kept in front / feeds",
    ],
    [
      "Lateral block footwork",
      "Move behind a ball path",
      "Full protection, markers",
      "Coach points left or right. Move behind the indicated path and rehearse the block without a ball.",
      "Correct paths / calls",
    ],
    [
      "Block-and-find",
      "Recover the ball after a block",
      "Full protection, foam balls",
      "Use a gentle central foam feed. After blocking, locate the ball, gather it, and stand without throwing.",
      "Secure recoveries",
    ],
    [
      "Passed-ball approach",
      "Approach a stationary ball safely",
      "Full protection, foam ball",
      "Place a foam ball behind the stance. Turn, approach under control, gather, and look toward a marked target.",
      "Controlled gathers",
    ],
    [
      "Foul-ball turn",
      "Turn and locate before moving",
      "Protection, foam ball",
      "Coach points to a stationary elevated target. Practice a safe turn and locating it without a live pop-up or collision.",
      "Correct first turns",
    ],
    [
      "Communication call",
      "Make a clear defensive call",
      "Field diagram",
      "Coach gives a bunt or pop-up situation. Catcher identifies responsibility and speaks a clear call.",
      "Correct calls / situations",
    ],
    [
      "Tag positioning dry",
      "Set a safe tag position",
      "Foam ball, glove, base marker",
      "Without a runner, set beside the base lane and rehearse a controlled tag. Keep the running lane clear.",
      "Safe positions",
    ],
    [
      "Pitch-plan conversation",
      "Explain a count-based choice",
      "Field diagram",
      "Discuss count, runners, and a familiar pitch. Athlete explains a target and backup plan without throwing.",
      "Reasoned choices",
    ],
    [
      "Receiving review",
      "Observe one receiving cue",
      "Existing authorized video or coach observation",
      "Watch one observed repetition. Name one cue, repeat a gentle feed, and compare balance and control.",
      "Before / after observation",
    ],
  ],
  Fielding: [
    [
      "Ready-position reset",
      "Prepare before the ball moves",
      "Glove, foam ball",
      "Coach signals ready. Athlete settles into a comfortable athletic position and resets after each signal.",
      "Timely ready positions",
    ],
    [
      "Two-hand roll gather",
      "Secure a predictable ground ball",
      "Glove, soft balls",
      "Partner rolls slowly on a smooth surface. Move behind the ball, gather with control, and stand without a throw.",
      "Clean gathers / rolls",
    ],
    [
      "Forehand roll",
      "Move behind a forehand ball",
      "Glove, soft balls",
      "Use gentle rolls slightly to the glove side. Move the feet into range, gather out front, and reset.",
      "Clean forehands / rolls",
    ],
    [
      "Backhand roll",
      "Rehearse a comfortable backhand",
      "Glove, soft balls",
      "Coach rolls gently within reach on the backhand side. Rehearse glove angle and foot position before increasing distance.",
      "Clean backhands / rolls",
    ],
    [
      "Funnel to grip",
      "Connect gathering and grip",
      "Ball, glove",
      "Start with a stationary ball in the glove. Bring it toward the center, transfer to a grip, and stop without throwing.",
      "Secure grips / attempts",
    ],
    [
      "Shuffle to target dry",
      "Align feet after fielding",
      "Glove, markers",
      "After a pretend gather, shuffle toward a target and finish balanced in a throwing position without a ball.",
      "Aligned finishes",
    ],
    [
      "Slow-roll approach",
      "Control approach speed",
      "Glove, soft balls",
      "Roll an easy slow ball. Approach under control, gather, and stop with secure possession before any throw.",
      "Controlled gathers",
    ],
    [
      "Short-hop read",
      "Read a predictable bounce",
      "Glove, foam balls",
      "Coach supplies gentle predictable foam short hops from a safe distance. Track the bounce and gather without stabbing.",
      "Secure gathers / feeds",
    ],
    [
      "Left-right choice",
      "React to a direction signal",
      "Glove, markers",
      "Coach points left or right before rolling gently. Athlete moves to the lane, gathers, and resets.",
      "Correct first steps",
    ],
    [
      "Double-play feed dry",
      "Rehearse a short underhand feed",
      "Foam ball, target",
      "From a stationary gather, make a gentle short underhand feed to a clear target. Keep feet moving under control.",
      "Accurate feeds / attempts",
    ],
    [
      "Base approach",
      "Find the base with eyes up",
      "Base marker, glove",
      "Approach a base marker slowly, set a safe foot position, and show the glove target without a runner.",
      "Controlled base setups",
    ],
    [
      "First-base footwork",
      "Receive without blocking a runner",
      "Base marker, glove, foam ball",
      "Coach identifies a safe receiving position alongside the lane. Rehearse footwork then add an easy foam feed.",
      "Safe catches / feeds",
    ],
    [
      "Outfield drop step",
      "Turn before moving back",
      "Cones",
      "Coach points over either shoulder. Open the hips, take a controlled drop step, and stop at a cone.",
      "Correct first steps",
    ],
    [
      "Outfield angle route",
      "Choose an efficient approach",
      "Cones, stationary ball",
      "Place a ball at an angle. Athlete points out a route, moves at controlled speed, gathers, and stops.",
      "Route choices",
    ],
    [
      "Two-hand fly tracking",
      "Track a gentle descending ball",
      "Foam ball, glove",
      "Adult tosses a small gentle arc into a clear lane. Track the ball, move underneath, and secure it without diving.",
      "Secure catches / attempts",
    ],
    [
      "Sun-awareness positioning",
      "Recognize visibility limits",
      "Glove, field markers",
      "Discuss the light direction without looking at the sun. Rehearse a safe adjustment and calling when a ball is not visible.",
      "Safe decisions",
    ],
    [
      "Cutoff alignment",
      "Align a relay target",
      "Field diagram, cones",
      "Mark outfielder, cutoff, and base locations. Athlete moves into line and gives a clear target without throwing.",
      "Correct alignments",
    ],
    [
      "Backup responsibility",
      "Choose the correct backup",
      "Field diagram",
      "Coach names a base and runner situation. Athlete points to a backup position and explains the responsibility.",
      "Correct assignments",
    ],
    [
      "Hold-or-throw choice",
      "Avoid rushed unnecessary throws",
      "Field diagram, glove",
      "Coach gives outs and runner locations. Athlete chooses hold or target and explains the decision before a dry rehearsal.",
      "Correct decisions",
    ],
    [
      "Communication priority",
      "Call and yield on shared balls",
      "Cones, glove",
      "Two athletes walk into separate marked lanes on an adult signal. Practice clear calls and yielding without a live ball.",
      "Clear calls and safe yielding",
    ],
  ],
  "Strength/Speed": [
    [
      "Chair squat",
      "Control a basic squat",
      "Stable chair",
      "Stand in front of a stable chair, sit gently, and stand without rushing. Use a comfortable depth.",
      "Controlled repetitions",
    ],
    [
      "Hip-hinge wall reach",
      "Learn hip movement without load",
      "Wall, clear floor",
      "Stand a short comfortable distance from a wall. Move the hips back to touch it while maintaining an easy posture.",
      "Controlled hinges",
    ],
    [
      "Wall push-up",
      "Control a pushing pattern",
      "Stable wall",
      "Place hands on a wall and step back a comfortable distance. Bend and straighten the arms without sagging or pain.",
      "Controlled repetitions",
    ],
    [
      "Supported split stance",
      "Find balance in split stance",
      "Stable support",
      "Hold a stable support lightly. Set a comfortable split stance, make a shallow bend, and return under control.",
      "Balanced repetitions",
    ],
    [
      "Calf raise",
      "Control ankle movement",
      "Stable support",
      "Hold support lightly, rise onto the forefeet comfortably, pause, and lower slowly.",
      "Controlled repetitions",
    ],
    [
      "Single-leg balance",
      "Practice steady balance",
      "Clear floor, nearby support",
      "Stand on one foot near support for a brief coach-set interval. Reset before balance deteriorates.",
      "Steady seconds",
    ],
    [
      "Bird-dog reach",
      "Coordinate opposite limbs",
      "Mat",
      "From hands and knees, reach one arm and opposite leg within a comfortable range. Return without twisting.",
      "Controlled reaches",
    ],
    [
      "Dead-bug heel tap",
      "Maintain trunk control",
      "Mat",
      "Lie on the back with bent knees. Slowly lower one heel to the floor and return while breathing normally.",
      "Controlled taps",
    ],
    [
      "Bridge hold",
      "Control hip extension",
      "Mat",
      "Lie on the back, knees bent, and lift the hips comfortably. Hold briefly while breathing, then lower.",
      "Controlled seconds",
    ],
    [
      "Side support from knees",
      "Build lateral trunk control",
      "Mat",
      "With bent knees and forearm support, lift the hips a comfortable amount. Hold briefly without pain or breath-holding.",
      "Controlled seconds each side",
    ],
    [
      "Scapular wall slide",
      "Rehearse comfortable shoulder motion",
      "Wall",
      "Stand comfortably by a wall and slide the arms within a pain-free range. Do not force contact or overhead reach.",
      "Comfortable repetitions",
    ],
    [
      "Ankle rock",
      "Explore comfortable ankle movement",
      "Stable support",
      "Hold support and slowly move a bent knee forward over a planted foot within comfort. Return and compare sides.",
      "Comfortable repetitions",
    ],
    [
      "Open-book rotation",
      "Explore gentle trunk rotation",
      "Mat",
      "Lie on one side with knees comfortably bent. Open the top arm and trunk within comfort, then return slowly.",
      "Comfortable repetitions",
    ],
    [
      "March rhythm",
      "Coordinate arms and legs",
      "Clear lane",
      "March through a short lane at comfortable speed with opposite arm and leg action. Stop in balance.",
      "Coordinated steps",
    ],
    [
      "Wall acceleration posture",
      "Rehearse a start posture",
      "Stable wall",
      "Lean lightly into a stable wall, maintain a straight comfortable line, and rehearse slow alternating marches.",
      "Controlled steps",
    ],
    [
      "Walk-in stop",
      "Decelerate under control",
      "Cones, non-slip surface",
      "Walk toward a cone and stop over several controlled steps. Hold balance before returning.",
      "Balanced stops",
    ],
    [
      "Lateral shuffle",
      "Move sideways without crossing",
      "Cones, clear surface",
      "Shuffle a short coach-set lane at comfortable speed. Keep feet apart and finish in balance.",
      "Controlled passes",
    ],
    [
      "Snap-down landing",
      "Learn a quiet balanced landing",
      "Clear non-slip surface",
      "Rise gently onto toes and settle into an athletic stance without jumping high. Hold balance and reset.",
      "Quiet balanced landings",
    ],
    [
      "Reaction start",
      "Respond to a simple signal",
      "Cones, clear lane",
      "On an adult signal, take a few controlled quick steps toward a cone. Leave ample stopping distance and recover fully.",
      "Correct starts / signals",
    ],
    [
      "Movement recovery check",
      "Recognize readiness changes",
      "Training log",
      "Before and after a short familiar activity, record comfort and effort. Explain whether to continue, reduce, or stop.",
      "Readiness observations",
    ],
  ],
  SoftballPitching: [
    [
      "Dry underhand circle",
      "Rehearse comfortable arm motion",
      "Clear lane",
      "Without a ball, make a smooth familiar underhand circle. Stop if range feels forced.",
      "Comfortable circles",
    ],
    [
      "Underhand close release",
      "Feel an easy underhand release",
      "Softball, clear target",
      "From a coach-selected close distance, make easy underhand releases toward a broad target. Reset between attempts.",
      "Target outcomes",
    ],
    [
      "Stride-line dry",
      "Organize stride direction",
      "Floor line",
      "Without a ball, rehearse a familiar delivery along a line. Finish balanced without forcing stride length.",
      "Balanced landings",
    ],
    [
      "Circle-stride connection",
      "Coordinate familiar movements",
      "Clear lane",
      "Rehearse the underhand circle and a small comfortable stride without a ball. Pause only after the finish.",
      "Coordinated repetitions",
    ],
    [
      "Release target",
      "Choose a specific target",
      "Softball, catcher protection",
      "With coach-approved volume and distance, call a broad target before each easy familiar pitch.",
      "Target hits / pitches",
    ],
    [
      "Pre-pitch breath",
      "Establish a calm routine",
      "Ball, clear lane",
      "Breathe normally, name a target, and rehearse the familiar delivery dry. Repeat the same routine.",
      "Routine completions",
    ],
    [
      "Balance finish",
      "Check the end position",
      "Clear lane",
      "Perform a dry familiar delivery and hold the finish briefly. Reduce speed if balance is lost.",
      "Balanced finishes",
    ],
    [
      "Foot-placement check",
      "Repeat a comfortable start",
      "Foot markers",
      "Coach marks a legal comfortable starting position. Set up, rehearse dry, and reset without forcing alignment.",
      "Consistent setups",
    ],
    [
      "Tempo rehearsal",
      "Find repeatable rhythm",
      "Clear lane",
      "Coach counts a comfortable rhythm while the athlete rehearses a dry underhand motion. Keep tempo easy.",
      "Repeatable rhythm",
    ],
    [
      "Catcher target conversation",
      "Agree on target and readiness",
      "Field diagram",
      "Pitcher and catcher agree on a target and a stop signal before any throwing. Explain both back to the coach.",
      "Clear agreements",
    ],
    [
      "High-low target plan",
      "Separate location intention",
      "Target diagram",
      "Point to high and low target areas, explain the intended location, then rehearse dry. Add throws only with reviewed dose.",
      "Correct target calls",
    ],
    [
      "Inside-outside target plan",
      "Separate lateral location intention",
      "Target diagram",
      "Name inside or outside relative to a batter, point to the corresponding target, and rehearse the routine dry.",
      "Correct target calls",
    ],
    [
      "Count-based selection",
      "Choose a familiar pitch for a count",
      "Field diagram",
      "Coach names the count. Athlete selects only a familiar coach-approved pitch and explains the target without throwing.",
      "Reasoned choices",
    ],
    [
      "Runner-awareness routine",
      "Check the situation before delivery",
      "Field diagram",
      "Name outs, runners, and relevant softball runner timing. Rehearse checking the situation before a dry delivery.",
      "Correct situation checks",
    ],
    [
      "Reset after a miss",
      "Recover attention after an error",
      "Target diagram",
      "Coach describes a missed target. Athlete names a neutral reset cue, breathes, and chooses the next target.",
      "Reset routine completed",
    ],
    [
      "Called-target sequence",
      "Repeat intention across a short sequence",
      "Softball, protected catcher",
      "After workload review, coach calls a short target sequence. Record intended and actual locations without adding make-up pitches.",
      "Target outcomes by sequence",
    ],
    [
      "Familiar changeup rehearsal",
      "Compare an already-taught pitch",
      "Clear lane",
      "Only after instructor approval, dry-rehearse an already familiar changeup grip and motion. Do not introduce a new pitch unsupervised.",
      "Coach-observed routine",
    ],
    [
      "Fielding-ready finish",
      "Prepare after the delivery",
      "Foam ball, glove",
      "Rehearse a dry delivery, settle into fielding-ready position, then gather a gently rolled foam ball without throwing.",
      "Ready transitions",
    ],
    [
      "Bunt decision rehearsal",
      "Choose responsibility after contact",
      "Field diagram",
      "Coach names a bunt situation. Pitcher identifies responsibility and a safe target, then walks through footwork without throwing.",
      "Correct decisions",
    ],
    [
      "Command comparison",
      "Compare like-for-like target attempts",
      "Softball, target, log",
      "Coach sets a small approved sample. Record targets, rest, repeat the same conditions only if ready, and compare without chasing scores.",
      "Observed target outcomes",
    ],
  ],
};
const build = (key: string, r: Row, i: number): TrainingDrill => ({
  id: `training-${key.toLowerCase().replace(/[^a-z]/g, "")}-${i + 1}`,
  version: TRAINING_VERSION,
  name: r[0],
  discipline: (key === "SoftballPitching" ? "Pitching" : key) as LessonDiscipline,
  sports:
    key === "SoftballPitching" || r[0].startsWith("Softball")
      ? ["softball"]
      : ["baseball", "softball"],
  purpose: r[1],
  equipment: r[2],
  steps: r[3].split(/(?<=\.) /),
  cue: r[1],
  correction:
    "If balance, control or understanding is lost, stop, demonstrate once, and use the easier version.",
  regression:
    "Rehearse slowly without a ball, bat swing or external load; simplify to one movement or decision.",
  progression:
    "After the coach observes consistent control, change one constraint (target, decision or movement speed); never increase workload automatically.",
  measure: r[4],
  minimumSkill: /sequence|changeup|slap|bunt|strike/.test(r[0].toLowerCase()) ? 1 : 0,
  minAge: 5,
  supervision:
    "Adult supervision; a qualified instructor must review technique, space, equipment and individual dose before assignment.",
  safety:
    "Stop for pain, unusual fatigue or loss of technique. Tell a guardian and coach. Do not resume painful activity until appropriately reviewed.",
  dose: "Coach must specify repetitions/time, sets and rest for this athlete after reviewing all team, lesson and home workload.",
  review: "qualified coach review required",
  provenance:
    "Academy draft authored for coach review; safety references inform guardrails, not validation of this drill.",
  demoUrl: null,
});
export const trainingDrills: TrainingDrill[] = [
  ...(
    [
      [
        "Dry overhand rhythm",
        "Coordinate an easy throwing rehearsal",
        "Clear lane",
        "With no ball, rehearse a comfortable overhand throwing movement at slow speed. Stop in balance and reset.",
        "Balanced rehearsals",
      ],
      [
        "Baseball target routine",
        "Name a target before preparing",
        "Target diagram",
        "Point to a broad target, state the intended location, and rehearse the setup without throwing. Reset after each choice.",
        "Clear target intentions",
      ],
      [
        "Ready-to-throw conversation",
        "Recognize readiness and stop signals",
        "Training log",
        "Before any throwing, tell the adult about other practice, fatigue or discomfort. Explain the stop signal and rehearse it without a ball.",
        "Readiness checks explained",
      ],
    ] as Row[]
  ).map((r, i) => ({
    ...build("SoftballPitching", r, i),
    id: `baseball-foundation-${i + 1}`,
    sports: ["baseball"] as LessonSport[],
  })),
  ...Object.entries(rows).flatMap(([key, list]) => list.map((r, i) => build(key, r, i))),
  ...DRILLS.filter((d) => d.discipline === "Pitching" && !/Fatigue/.test(d.name)).map((d, i) => ({
    ...build(
      "SoftballPitching",
      [
        d.name,
        d.solves,
        "Baseball, appropriate protected target",
        d.setup,
        "Coach-observed control and target outcomes",
      ],
      i,
    ),
    id: `academy-${d.id}`,
    sports: ["baseball"] as LessonSport[],
    minimumSkill: Math.max(0, Math.min(...d.levels) - 1),
    minAge: d.levels[0] >= 4 ? 13 : 8,
    cue: d.cues.join("; "),
    correction: d.watch.join("; "),
    provenance: `Existing academy drill ${d.id}; original copy retained. Individual workload and technique require qualified review.`,
  })),
];
export const programFamilies = [
  ...(["baseball", "softball"] as const).flatMap((sport) =>
    (["Pitching", "Hitting", "Catching", "Fielding", "Strength/Speed"] as const).map(
      (discipline) => ({
        id: `${sport}:${discipline}`,
        sport,
        discipline,
        name: `${sport === "baseball" ? "Baseball" : "Softball"} ${discipline} development`,
        phases: [
          "Baseline and comfortable control",
          "Repeat the chosen skill",
          "Vary one constraint",
          "Reassess under comparable conditions",
        ],
        prerequisites:
          "Current age, skill review, goal, equipment, availability and total workload; qualified instructor approval.",
        completion:
          "Coach compares the agreed baseline and target, reviews adherence and comfort, then explicitly completes or revises the program.",
      }),
    ),
  ),
];
