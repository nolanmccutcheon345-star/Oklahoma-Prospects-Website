import type { EducationCourse } from "./education-types";

/** Verbatim course catalog. Do not rewrite. */
export const COURSES: EducationCourse[] = [
  { id: "pit-1", discipline: "Pitching", level: "Foundations", title: "Foundations of Pitching", hours: 6, modules: [
    "Delivery framework: what every efficient delivery shares and what is style",
    "Anatomy and physiology basics for the throwing shoulder and elbow",
    "Drill selection: matching the constraint to the athlete, not the drill to the coach",
    "Warm-up and recovery protocols by age band",
    "Throwing drills: rocker, step-behind, walking windup, constraint work",
    "Year-round programming: offseason, preseason, in-season, postseason",
    "Workload management and Pitch Smart limits",
    "Running the 60-minute assessment protocol",
  ] },
  { id: "pit-2", discipline: "Pitching", level: "Certification", title: "Pitching Data & Arsenal Certification", hours: 8, modules: [
    "Reading a pitch report: velocity, spin rate, spin efficiency, axis",
    "Movement profiles: induced vertical break, horizontal break, and what they mean",
    "Fastball identity: ride, run, sink, cut — classifying from the data",
    "Arsenal construction: which secondaries complement which fastball",
    "Release height, extension and approach angle",
    "Translating metrics into a training plan without chasing numbers",
    "Pitch design session structure and how to run one",
    "Charting TCI and turning command data into a plan",
  ] },
  { id: "hit-1", discipline: "Hitting", level: "Foundations", title: "Foundations of Hitting", hours: 6, modules: [
    "Swing framework: what transfers across every good hitter",
    "Sequencing: lower half, trunk, hands, barrel",
    "Drill selection by problem — barrel control, approach, power",
    "Tee, front toss, machine and live progressions",
    "Bat fitting and weighted implement basics",
    "Charting contact quality and swing decisions",
  ] },
  { id: "hit-2", discipline: "Hitting", level: "Certification", title: "Hitting Data Certification", hours: 8, modules: [
    "Exit velocity, launch angle and the damage window",
    "Bat speed, attack angle and swing efficiency from sensors",
    "Reading a batted-ball profile and building a plan from it",
    "Approach and swing-decision metrics",
    "Designing an at-bat: pitch recognition and count leverage",
  ] },
  { id: "cat-1", discipline: "Catching", level: "Foundations", title: "Foundations of Catching", hours: 5, modules: [
    "Stances: primary, secondary, and when each is used",
    "Receiving mechanics and the physics of stealing a strike",
    "Blocking progression and building the reflex",
    "Exchange and footwork to every base",
    "Managing a pitching staff and calling a game",
    "Catcher-specific arm care and lower-body maintenance",
  ] },
  { id: "cat-2", discipline: "Catching", level: "Certification", title: "Catching Data Certification", hours: 6, modules: [
    "Framing metrics: strike rate by zone edge",
    "Pop time decomposition: exchange, footwork, arm",
    "Blocking efficiency charting",
    "Game-calling analysis from film",
  ] },
  { id: "fld-1", discipline: "Fielding", level: "Foundations", title: "Foundations of Defense", hours: 5, modules: [
    "Infield footwork, angles and hop reading",
    "Outfield routes, first step and closing speed",
    "Exchange and throwing mechanics by position",
    "Double-play footwork and relay mechanics",
    "Situational defense and communication",
  ] },
  { id: "run-1", discipline: "Baserunning", level: "Foundations", title: "Foundations of Baserunning", hours: 4, modules: [
    "Primary and secondary leads by base",
    "Reading pitcher tells and first-move timing",
    "Stealing: jump, acceleration and slide technique",
    "Reading balls in the dirt and on contact",
    "First-to-third and scoring from second decision rules",
  ] },
];
