import { PD_POLICY } from "@/lib/pd";
import { scorePitch, tciOf } from "./core-algorithms.js";
import type { BullpenPitch, DevelopmentData } from "./types";

const STEVE = "c-steve";
const HITTING = "c-hitting";

export const EMPTY_ATHLETE_ID = "a-empty";

export function seedDevelopment(): DevelopmentData {
  const data: DevelopmentData = {
    athletes: [
      {
        id: EMPTY_ATHLETE_ID,
        firstName: "Miles",
        lastName: "Harper",
        sport: "baseball",
        position: "RHP",
        throws: "R",
        bats: "R",
        birthDate: "2014-08-02",
        graduationYear: 2033,
        familyId: "f-harper",
        coachIds: [STEVE],
        opLevel: 0,
        assessmentComplete: false,
        school: "Wolf Creek Intermediate",
        city: "Broken Arrow, OK",
        notes: "",
        tags: ["no-assessment"],
      },
      {
        id: "a-9u",
        firstName: "Jett",
        lastName: "Calhoun",
        sport: "baseball",
        position: "RHP",
        throws: "R",
        bats: "R",
        birthDate: "2017-04-12",
        graduationYear: 2036,
        familyId: "f-calhoun",
        coachIds: [STEVE],
        opLevel: 1,
        assessmentComplete: true,
        school: "Country Lane",
        city: "Broken Arrow, OK",
        notes: "Nine years old. Fastball and changeup only.",
        tags: ["9u"],
      },
      {
        id: "a-softball",
        firstName: "Maya",
        lastName: "Ruiz",
        sport: "softball",
        position: "RHP",
        throws: "R",
        bats: "R",
        birthDate: "2012-03-19",
        graduationYear: 2030,
        familyId: "f-ruiz",
        coachIds: [STEVE],
        opLevel: 4,
        assessmentComplete: true,
        school: "Sequoyah Middle",
        city: "Broken Arrow, OK",
        notes: "Rise and change. No curve yet.",
        tags: ["softball"],
      },
      {
        id: "a-catcher",
        firstName: "Deacon",
        lastName: "Walsh",
        sport: "baseball",
        position: "C",
        throws: "R",
        bats: "R",
        birthDate: "2013-06-01",
        graduationYear: 2032,
        familyId: "f-walsh",
        coachIds: [HITTING],
        opLevel: 3,
        assessmentComplete: true,
        school: "Oologah",
        city: "Oologah, OK",
        notes: "Block and throw. Pop time is the constraint.",
        tags: ["catcher"],
      },
      {
        id: "a-spike",
        firstName: "Kane",
        lastName: "Briggs",
        sport: "baseball",
        position: "RHP",
        throws: "R",
        bats: "R",
        birthDate: "2011-11-20",
        graduationYear: 2030,
        familyId: "f-briggs",
        coachIds: [STEVE],
        opLevel: 4,
        assessmentComplete: true,
        school: "Union 8th",
        city: "Tulsa, OK",
        notes: "Threw a lot this week. Watch the spike.",
        tags: ["workload-spike"],
      },
      {
        id: "a-down",
        firstName: "Eli",
        lastName: "Navarro",
        sport: "baseball",
        position: "RHP",
        throws: "R",
        bats: "L",
        birthDate: "2010-02-08",
        graduationYear: 2029,
        familyId: "f-navarro",
        coachIds: [STEVE],
        opLevel: 5,
        assessmentComplete: true,
        school: "Bixby High",
        city: "Bixby, OK",
        notes: "Velo and command both sliding. Don't pile constraints.",
        tags: ["trending-down"],
      },
      {
        id: "a-full",
        firstName: "Ryder",
        lastName: "McCabe",
        sport: "baseball",
        position: "RHP",
        throws: "R",
        bats: "R",
        birthDate: "2009-05-14",
        graduationYear: 2028,
        familyId: "f-mccabe",
        coachIds: [STEVE],
        opLevel: 5,
        assessmentComplete: true,
        school: "Broken Arrow High",
        city: "Broken Arrow, OK",
        notes: "Full file. FB/CH/slider roles defined.",
        tags: ["full"],
      },
      {
        id: "a-hitter",
        firstName: "Quinn",
        lastName: "Hale",
        sport: "baseball",
        position: "SS / 2B",
        throws: "R",
        bats: "R",
        birthDate: "2011-09-03",
        graduationYear: 2030,
        familyId: "f-hale",
        coachIds: [HITTING],
        opLevel: 4,
        assessmentComplete: true,
        school: "North Intermediate",
        city: "Broken Arrow, OK",
        notes: "Contact over power this block.",
        tags: ["hitter"],
      },
      {
        id: "a-college",
        firstName: "Andre",
        lastName: "Pitts",
        sport: "baseball",
        position: "RHP",
        throws: "R",
        bats: "R",
        birthDate: "2006-01-22",
        graduationYear: 2024,
        familyId: "f-pitts",
        coachIds: [STEVE],
        opLevel: 7,
        assessmentComplete: true,
        school: "NSU",
        city: "Tahlequah, OK",
        notes: "College in-season. Command and recovery.",
        tags: ["college"],
      },
      {
        id: "a-remote",
        firstName: "Sage",
        lastName: "Nguyen",
        sport: "baseball",
        position: "LHP",
        throws: "L",
        bats: "L",
        birthDate: "2008-07-30",
        graduationYear: 2027,
        familyId: "f-nguyen",
        coachIds: [STEVE],
        opLevel: 6,
        assessmentComplete: true,
        school: "Owasso High",
        city: "Owasso, OK",
        notes: "Remote film. Rarely on site.",
        tags: ["remote"],
      },
    ],
    families: [
      { id: "f-harper", name: "Harper", parentName: "Dana Harper", email: "dana.harper@example.com", phone: "(918) 555-0101", athleteIds: [EMPTY_ATHLETE_ID] },
      { id: "f-calhoun", name: "Calhoun", parentName: "Brett Calhoun", email: "brett.calhoun@example.com", phone: "(918) 555-0102", athleteIds: ["a-9u"] },
      { id: "f-ruiz", name: "Ruiz", parentName: "Elena Ruiz", email: "elena.ruiz@example.com", phone: "(918) 555-0103", athleteIds: ["a-softball"] },
      { id: "f-walsh", name: "Walsh", parentName: "Pat Walsh", email: "pat.walsh@example.com", phone: "(918) 555-0104", athleteIds: ["a-catcher"] },
      { id: "f-briggs", name: "Briggs", parentName: "Chris Briggs", email: "chris.briggs@example.com", phone: "(918) 555-0105", athleteIds: ["a-spike"] },
      { id: "f-navarro", name: "Navarro", parentName: "Marisol Navarro", email: "marisol.navarro@example.com", phone: "(918) 555-0106", athleteIds: ["a-down"] },
      { id: "f-mccabe", name: "McCabe", parentName: "Heather McCabe", email: "heather.mccabe@example.com", phone: "(918) 555-0107", athleteIds: ["a-full"] },
      { id: "f-hale", name: "Hale", parentName: "Jordan Hale", email: "jordan.hale@example.com", phone: "(918) 555-0108", athleteIds: ["a-hitter"] },
      { id: "f-pitts", name: "Pitts", parentName: "Andre Pitts Sr.", email: "pitts.family@example.com", phone: "(918) 555-0109", athleteIds: ["a-college"] },
      { id: "f-nguyen", name: "Nguyen", parentName: "Kim Nguyen", email: "kim.nguyen@example.com", phone: "(918) 555-0110", athleteIds: ["a-remote"] },
    ],
    coaches: [
      { id: STEVE, name: "Coach Steve", email: "stevemccutcheon89@gmail.com", specialties: ["Pitching", "Arm care"], active: true },
      { id: HITTING, name: "Coach Lane", email: "lane@prospectsbaseball.club", specialties: ["Hitting", "Catching"], active: true },
    ],
    services: [
      { id: "s1", name: "New Pitcher Assessment", kind: "lesson", price: 149, minutes: 75 },
      { id: "s2", name: "Private Development 30", kind: "lesson", price: 60, minutes: 30 },
      { id: "s3", name: "Private Development 60", kind: "lesson", price: 100, minutes: 60 },
      { id: "s9", name: "Hitting Assessment", kind: "lesson", price: 129, minutes: 60 },
    ],
    packages: [
      { id: "p1", name: "4-Session Package (30 min)", credits: 4, price: 220 },
      { id: "p2", name: "4-Session Package (60 min)", credits: 4, price: 370 },
    ],
    memberships: [
      { id: "m1", name: "Development Membership", price: 219, detail: "Four 30s plus the system." },
      { id: "m2", name: "Performance Membership", price: 389, detail: "Four 60s plus video." },
    ],
    bookings: [
      { id: "b1", athleteId: "a-full", serviceId: "s3", date: "2026-09-16", time: "17:00", status: "paid", price: 100, coachId: STEVE },
      { id: "b2", athleteId: "a-9u", serviceId: "s2", date: "2026-09-17", time: "16:30", status: "paid", price: 60, coachId: STEVE },
      { id: "b3", athleteId: "a-spike", serviceId: "s3", date: "2026-09-12", time: "18:00", status: "paid", price: 100, coachId: STEVE },
      { id: "b4", athleteId: "a-softball", serviceId: "s3", date: "2026-09-18", time: "17:30", status: "paid", price: 100, coachId: STEVE },
      { id: "b5", athleteId: "a-remote", serviceId: "s3", date: "2026-09-15", time: "18:00", status: "unconfirmed", price: 45, coachId: STEVE },
    ],
    availability: [
      { id: "av1", coachId: STEVE, weekday: "Mon–Fri", window: "4:00–8:00 PM" },
      { id: "av2", coachId: STEVE, weekday: "Sat–Sun", window: "1:00–8:00 PM" },
      { id: "av3", coachId: HITTING, weekday: "Tue / Thu", window: "5:00–8:00 PM" },
    ],
    waitlist: [
      { id: "w1", athleteId: "a-hitter", serviceId: "s9", createdAt: "2026-09-10", preferredDay: "Tue", preferredTime: "17:00", status: "open" },
    ],
    leads: [
      { id: "ld1", name: "New 11U family", phone: "(918) 555-0199", source: "Google", status: "new" },
      { id: "ld2", name: "Owasso softball", phone: "(918) 555-0188", source: "Referral", status: "booked" },
    ],
    outings: [
      { id: "o1", athleteId: "a-full", date: "2026-09-05", opponent: "BA Tigers", ip: "5.0", k: 6, bb: 1, notes: "Slider was the put-away." },
      { id: "o2", athleteId: "a-down", date: "2026-09-06", opponent: "Union", ip: "3.1", k: 2, bb: 4, notes: "Fell behind. Velo down." },
      { id: "o3", athleteId: "a-spike", date: "2026-09-13", opponent: "Jenks", ip: "6.0", k: 7, bb: 2, notes: "Long outing on three days rest." },
      { id: "o4", athleteId: "a-softball", date: "2026-09-07", opponent: "Bixby", ip: "7.0", k: 9, bb: 1, notes: "Rise ball late." },
    ],
    workoutLog: [
      { id: "wo1", athleteId: "a-full", date: "2026-09-11", focus: "Lower half", rpe: 6, notes: "Med-ball rotational." },
      { id: "wo2", athleteId: "a-9u", date: "2026-09-10", focus: "Athletic throw", rpe: 4, notes: "Play catch. No mound." },
      { id: "wo3", athleteId: "a-catcher", date: "2026-09-09", focus: "Blocks", rpe: 5, notes: "12 dirt balls." },
    ],
    strengthLog: [
      { id: "st1", athleteId: "a-full", date: "2026-09-08", lift: "Trap bar DL", value: 275, unit: "lb" },
      { id: "st2", athleteId: "a-college", date: "2026-09-04", lift: "Rear-foot elevated split", value: 95, unit: "lb" },
      { id: "st3", athleteId: "a-hitter", date: "2026-09-07", lift: "Med-ball shot", value: 18, unit: "ft" },
    ],
    pointsLog: [
      { id: "pt1", athleteId: "a-full", date: "2026-09-11", points: 12, reason: "Bullpen + recap" },
      { id: "pt2", athleteId: "a-9u", date: "2026-09-10", points: 8, reason: "Catch play complete" },
      { id: "pt3", athleteId: "a-hitter", date: "2026-09-09", points: 10, reason: "Tee work filmed", activity: "film", status: "verified" },
      { id: "pt4", athleteId: "a-spike", date: "2026-09-13", points: 4, reason: "Outing logged", activity: "throwing", status: "verified" },
      { id: "pt5", athleteId: "a-full", date: "2026-09-14", points: 25, reason: "Throwing / skill day from your plan", activity: "throwing", status: "pending" },
      { id: "pt6", athleteId: "a-catcher", date: "2026-09-14", points: 25, reason: "Strength session completed", activity: "workout", status: "auto" },
      { id: "pt7", athleteId: "a-hitter", date: "2026-09-14", points: 5, reason: "Daily check-in logged", activity: "checkin", status: "auto" },
    ],
    scorecards: [
      {
        id: "sc1",
        athleteId: "a-full",
        date: "2026-08-20",
        categories: [
          { name: "Posture", score: 2 },
          { name: "Tempo", score: 2 },
          { name: "Separation", score: 1 },
          { name: "Direction", score: 2 },
          { name: "Glove side", score: 2 },
          { name: "Release", score: 2 },
        ],
        notes: "Separation is the one constraint.",
      },
      {
        id: "sc2",
        athleteId: "a-9u",
        date: "2026-08-28",
        categories: [
          { name: "Athletic throw", score: 2 },
          { name: "Stride", score: 1 },
          { name: "Finish", score: 2 },
        ],
        notes: "Keep it a throw. No pitching voice.",
      },
      {
        id: "sc3",
        athleteId: "a-catcher",
        date: "2026-08-15",
        categories: [
          { name: "Setup", score: 2 },
          { name: "Receive", score: 1 },
          { name: "Block", score: 2 },
          { name: "Throw", score: 1 },
        ],
        notes: "Pop time is the constraint.",
      },
    ],
    evaluations: [
      { id: "ev1", athleteId: "a-full", date: "2026-08-20", coachId: STEVE, summary: "Ready for a slider role. Don't add a fourth pitch.", grade: "On track" },
      { id: "ev2", athleteId: "a-down", date: "2026-09-01", coachId: STEVE, summary: "Fatigue pattern. Cut volume one week.", grade: "Watch" },
      { id: "ev3", athleteId: "a-softball", date: "2026-08-12", coachId: STEVE, summary: "Rise is a weapon. Changeup needs a lane.", grade: "On track" },
    ],
    lessons: [
      { id: "ls1", athleteId: "a-full", date: "2026-09-09", coachId: STEVE, focus: "Glove-side command", minutes: 60, notes: "20 down-and-glove. 14 strikes." },
      { id: "ls2", athleteId: "a-9u", date: "2026-09-08", coachId: STEVE, focus: "Balance hold", minutes: 30, notes: "Smiled the whole time." },
      { id: "ls3", athleteId: "a-hitter", date: "2026-09-07", coachId: HITTING, focus: "Opposite-field tee", minutes: 60, notes: "Barrel through the middle." },
      { id: "ls4", athleteId: "a-remote", date: "2026-09-03", coachId: STEVE, focus: "Remote film", minutes: 20, notes: "Sent rear-view only." },
    ],
    filmReviews: [
      { id: "fl1", athleteId: "a-full", date: "2026-09-09", title: "Open side, 9 Sep", notes: "Glove pulls late. Cue: hold the target." },
      { id: "fl2", athleteId: "a-remote", date: "2026-09-03", title: "Rear view bullpen", notes: "Direction is clean. Finish is early." },
      { id: "fl3", athleteId: "a-hitter", date: "2026-09-07", title: "Tee path", notes: "Contact point drifted forward." },
    ],
    interventions: [
      { id: "in1", athleteId: "a-full", date: "2026-08-20", constraint: "Hold glove through release", result: "Command jumped in the retest." },
      { id: "in2", athleteId: "a-down", date: "2026-09-01", constraint: "Cut Sunday catch to 25 throws", result: "Pending." },
    ],
    calibration: [
      { id: "cal1", athleteId: "a-full", date: "2026-09-09", metric: "TCI", target: 70, actual: 68 },
      { id: "cal2", athleteId: "a-college", date: "2026-09-02", metric: "FB command %", target: 60, actual: 63 },
    ],
    calibrationScores: [],
    policy: {
      freeCancelHours: PD_POLICY.freeCancelHours,
      partialRefundHours: PD_POLICY.partialRefundHours,
      lateCancelFeePct: PD_POLICY.lateCancelFeePct,
      noShowFeePct: PD_POLICY.noShowFeePct,
      newFamilyCredit: PD_POLICY.newFamilyCredit,
      rescheduleDaysNotice: PD_POLICY.rescheduleDaysNotice,
      reschedulesPerMonth: PD_POLICY.reschedulesPerMonth,
      verifyActivities: true,
    },
    coachPayouts: [
      { id: "po1", coachId: STEVE, serviceId: "s3", splitPct: 60 },
      { id: "po2", coachId: STEVE, serviceId: "s1", splitPct: 55 },
      { id: "po3", coachId: HITTING, serviceId: "s9", splitPct: 55 },
    ],
    coachOverrides: [
      { id: "ov1", coachId: STEVE, field: "private-60-split", value: "60" },
    ],
    benchmarks: [
      { id: "bm1", position: "RHP", ages: "13–14U", metric: "FB velo", p50: 68, p90: 76, unit: "mph" },
      { id: "bm2", position: "RHP", ages: "15–16U", metric: "FB velo", p50: 78, p90: 86, unit: "mph" },
      { id: "bm3", position: "RHP", ages: "8–10U", metric: "FB velo", p50: 48, p90: 55, unit: "mph" },
      { id: "bm4", position: "C", ages: "11–12U", metric: "Pop time", p50: 2.3, p90: 2.05, unit: "s" },
      { id: "bm5", position: "RHP", ages: "softball 14U", metric: "Rise velo", p50: 52, p90: 58, unit: "mph" },
    ],
    certifications: [
      { id: "ce1", athleteId: "a-full", name: "Perfect Game 16U", date: "2026-06-12" },
      { id: "ce2", athleteId: "a-college", name: "College physical", date: "2026-08-01" },
    ],
    auditLog: [
      { id: "au1", at: "2026-09-09T17:40:00Z", actor: "Coach Steve", action: "lesson.recap", detail: "Ryder McCabe glove-side command" },
      { id: "au2", at: "2026-09-13T21:00:00Z", actor: "Coach Steve", action: "workload.flag", detail: "Kane Briggs spike" },
    ],
    messages: [
      { id: "msg1", athleteId: "a-full", fromName: "Coach Steve", fromRole: "coach", body: "Slider is a strike pitch now. Don't chase a cutter this month.", createdAt: "2026-09-09", channel: "family" },
      { id: "msg1b", athleteId: "a-full", fromName: "Heather McCabe", fromRole: "parent", body: "We'll keep catch play to 25 on Thursday.", createdAt: "2026-09-10", channel: "family" },
      { id: "msg2", athleteId: "a-down", fromName: "Coach Steve", fromRole: "coach", body: "One constraint: recover. No new pitch.", createdAt: "2026-09-01", channel: "family" },
      { id: "msg2b", athleteId: "a-down", fromName: "Coach Steve", fromRole: "coach", body: "Private: do not mention the UCL concern to the athlete. Frame it as a workload cut.", createdAt: "2026-09-01", channel: "coach" },
      { id: "msg3", athleteId: "a-spike", fromName: "Coach Steve", fromRole: "coach", body: "Shut it down Thursday. Catch play only.", createdAt: "2026-09-14", channel: "family" },
    ],
    plans: [
      { id: "pl1", athleteId: "a-full", focus: "Glove-side FB", constraint: "Hold the target", status: "active" },
      { id: "pl2", athleteId: "a-9u", focus: "Athletic throw", constraint: "No mound until the throw is fun", status: "active" },
      { id: "pl3", athleteId: "a-softball", focus: "Changeup lane", constraint: "Same arm speed", status: "active" },
      { id: "pl4", athleteId: "a-catcher", focus: "Pop time", constraint: "Feet before arm", status: "active" },
      { id: "pl5", athleteId: "a-down", focus: "Recovery", constraint: "Volume cut 30%", status: "active" },
    ],
    diagnose: [
      { id: "dg1", athleteId: "a-full", finding: "Early glove pull. Command leaks arm side.", date: "2026-08-20" },
      { id: "dg2", athleteId: "a-down", finding: "Decel looks guarded. Ask arm feel daily.", date: "2026-09-01" },
      { id: "dg3", athleteId: "a-catcher", finding: "Throws across the body. Transfer is long.", date: "2026-08-15" },
    ],
    cohorts: [
      { id: "co1", name: "OP-1 · Learn to Throw", athleteIds: ["a-9u"] },
      { id: "co2", name: "OP-4 · Build the Pitcher", athleteIds: ["a-softball", "a-spike"] },
      { id: "co3", name: "OP-5 · Develop Weapons", athleteIds: ["a-full", "a-down"] },
      { id: "co4", name: "Hitting block", athleteIds: ["a-hitter", "a-catcher"] },
    ],
    gameIq: [
      { id: "iq1", athleteId: "a-full", date: "2026-09-05", situation: "2K, runner on 3rd", note: "Went slider. Right read." },
      { id: "iq2", athleteId: "a-college", date: "2026-09-02", situation: "3-1 to the 3-hole", note: "Challenged in. Got the grounder." },
    ],
    reportCards: [
      {
        id: "rc1",
        athleteId: "a-full",
        period: "August 2026",
        lines: [
          { label: "Command", mark: "B+" },
          { label: "Compete", mark: "A" },
          { label: "Recovery", mark: "B" },
        ],
      },
      {
        id: "rc2",
        athleteId: "a-9u",
        period: "August 2026",
        lines: [
          { label: "Athletic throw", mark: "A" },
          { label: "Listen", mark: "A" },
        ],
      },
    ],
    velocity: [
      { id: "v1", athleteId: "a-full", date: "2026-06-01", mph: 79 },
      { id: "v2", athleteId: "a-full", date: "2026-08-20", mph: 81 },
      { id: "v3", athleteId: "a-down", date: "2026-06-15", mph: 78 },
      { id: "v4", athleteId: "a-down", date: "2026-08-01", mph: 74 },
      { id: "v5", athleteId: "a-down", date: "2026-09-06", mph: 71 },
      { id: "v6", athleteId: "a-9u", date: "2026-08-28", mph: 49 },
      { id: "v7", athleteId: "a-softball", date: "2026-08-12", mph: 55 },
      { id: "v8", athleteId: "a-college", date: "2026-08-01", mph: 88 },
    ],
    goals: [
      { id: "g1", athleteId: "a-full", title: "Glove-side strikes", target: "60% in-zone glove", status: "open" },
      { id: "g2", athleteId: "a-9u", title: "Love throwing", target: "Leave smiling", status: "open" },
      { id: "g3", athleteId: "a-softball", title: "Changeup lane", target: "10 mph off rise", status: "open" },
      { id: "g4", athleteId: "a-down", title: "Get healthy", target: "Feel ≤ 3 for 10 days", status: "open" },
    ],
    arsenal: [
      { id: "ar1", athleteId: "a-full", pitch: "FB", role: "Establish in", velo: "81" },
      { id: "ar2", athleteId: "a-full", pitch: "CH", role: "Kill timing", velo: "72" },
      { id: "ar3", athleteId: "a-full", pitch: "SL", role: "Put-away", velo: "71" },
      { id: "ar4", athleteId: "a-softball", pitch: "Rise", role: "Primary", velo: "55" },
      { id: "ar5", athleteId: "a-softball", pitch: "Change", role: "Off-speed", velo: "46" },
      { id: "ar6", athleteId: "a-9u", pitch: "FB", role: "Only required", velo: "49" },
      { id: "ar7", athleteId: "a-college", pitch: "FB", role: "North/south", velo: "88" },
      { id: "ar8", athleteId: "a-college", pitch: "SL", role: "Two-strike", velo: "79" },
    ],
    pitchDesign: [
      { id: "pd1", athleteId: "a-full", pitch: "SL", cue: "Think gyro. Don't flip it." },
      { id: "pd2", athleteId: "a-softball", pitch: "Change", cue: "Same arm. Pronate late." },
      { id: "pd3", athleteId: "a-college", pitch: "FB", cue: "Ride up. Don't cut it." },
    ],
    skillPlans: [
      { id: "sk1", athleteId: "a-full", skill: "Command", drill: "Down and glove", dose: "20 pitches, chart it" },
      { id: "sk2", athleteId: "a-9u", skill: "Throw", drill: "Balance hold", dose: "3×8" },
      { id: "sk3", athleteId: "a-hitter", skill: "Path", drill: "Opposite-field tee", dose: "20 swings" },
      { id: "sk4", athleteId: "a-catcher", skill: "Transfer", drill: "Footwork before arm", dose: "12 throws" },
    ],
    warmups: [
      { id: "wu1", athleteId: "a-full", name: "J-band + plyo 1–2 lb", minutes: 12 },
      { id: "wu2", athleteId: "a-9u", name: "Move then play catch", minutes: 8 },
      { id: "wu3", athleteId: "a-college", name: "Full in-season prep", minutes: 18 },
    ],
    strengthSets: [
      { id: "ss1", athleteId: "a-full", date: "2026-09-08", exerciseId: "trap-bar", setNumber: 1, weight: 225, reps: 5, rpe: 6 },
      { id: "ss2", athleteId: "a-full", date: "2026-09-08", exerciseId: "trap-bar", setNumber: 2, weight: 255, reps: 5, rpe: 7 },
      { id: "ss3", athleteId: "a-full", date: "2026-09-08", exerciseId: "trap-bar", setNumber: 3, weight: 275, reps: 5, rpe: 8 },
      { id: "ss4", athleteId: "a-college", date: "2026-09-04", exerciseId: "rfess", setNumber: 3, weight: 95, reps: 6, rpe: 8 },
      { id: "ss5", athleteId: "a-hitter", date: "2026-09-07", exerciseId: "mb-rot", setNumber: 4, weight: 10, reps: 5, rpe: 7 },
    ],
    throwingAssignments: [
      { id: "ta1", athleteId: "a-full", templateId: "in-pit", dayType: "Command" },
      { id: "ta2", athleteId: "a-9u", templateId: "yth-pit", dayType: "Catch play" },
      { id: "ta3", athleteId: "a-down", templateId: "rtt-pit", dayType: "Return" },
      { id: "ta4", athleteId: "a-catcher", templateId: "cmd-cat", dayType: "Command" },
      { id: "ta5", athleteId: "a-softball", templateId: "in-pit", dayType: "Live" },
    ],
    bullpens: [
      { id: "bp1", athleteId: "a-full", date: "2026-09-09", pitches: 32, tci: 68, notes: "Glove-side set." },
      { id: "bp0", athleteId: "a-down", date: "2026-08-20", pitches: 30, tci: 62, notes: "Baseline before the slide." },
      { id: "bp2", athleteId: "a-down", date: "2026-09-04", pitches: 28, tci: 41, notes: "TCI dropped. Cut it." },
      { id: "bp3", athleteId: "a-college", date: "2026-09-02", pitches: 40, tci: 71, notes: "Live-ish." },
      { id: "bp4", athleteId: "a-softball", date: "2026-09-07", pitches: 36, tci: 64, notes: "Rise to change pairs." },
    ],
    workload: [
      { id: "wl1", athleteId: "a-spike", date: "2026-09-11", throws: 48, rpe: 5 },
      { id: "wl2", athleteId: "a-spike", date: "2026-09-12", throws: 90, rpe: 7 },
      { id: "wl3", athleteId: "a-spike", date: "2026-09-13", throws: 118, rpe: 8 },
      { id: "wl4", athleteId: "a-spike", date: "2026-09-14", throws: 40, rpe: 6 },
      { id: "wl5", athleteId: "a-full", date: "2026-09-11", throws: 32, rpe: 4 },
      { id: "wl6", athleteId: "a-full", date: "2026-09-13", throws: 25, rpe: 3 },
      { id: "wl7", athleteId: "a-down", date: "2026-09-10", throws: 20, rpe: 5 },
      { id: "wl8", athleteId: "a-9u", date: "2026-09-10", throws: 30, rpe: 3 },
    ],
    armCare: [
      { id: "ac1", athleteId: "a-full", date: "2026-09-14", feel: 2, notes: "Fresh." },
      { id: "ac2", athleteId: "a-spike", date: "2026-09-14", feel: 6, notes: "Heavy. No mound." },
      { id: "ac3", athleteId: "a-down", date: "2026-09-13", feel: 7, notes: "Guarded decelerating." },
      { id: "ac4", athleteId: "a-9u", date: "2026-09-10", feel: 1, notes: "Fine." },
    ],
    physicalTests: [
      { id: "ph1", athleteId: "a-full", date: "2026-08-20", test: "Broad jump", value: "8'2\"" },
      { id: "ph2", athleteId: "a-college", date: "2026-08-01", test: "10-yard sprint", value: "1.62s" },
      { id: "ph3", athleteId: "a-hitter", date: "2026-08-18", test: "Med-ball rotational", value: "22 ft" },
      { id: "ph4", athleteId: "a-catcher", date: "2026-08-15", test: "Pop time", value: "2.45s" },
    ],
    metrics: [
      { id: "mt1", athleteId: "a-full", name: "FB spin", value: "2100 rpm", date: "2026-08-20" },
      { id: "mt2", athleteId: "a-college", name: "FB IVB", value: "16.2 in", date: "2026-08-01" },
      { id: "mt3", athleteId: "a-softball", name: "Rise spin", value: "1180 rpm", date: "2026-08-12" },
    ],
    recruiting: [
      { athleteId: "a-full", gpa: "3.7", committed: "Uncommitted", video: "Open-side 16U" },
      { athleteId: "a-college", gpa: "3.2", committed: "NSU", video: "Fall bullpen" },
      { athleteId: "a-remote", gpa: "3.9", committed: "Uncommitted", video: "Rear-view only" },
    ],
    intake: [
      { athleteId: "a-9u", health: "Clear", goals: "Have fun throwing", complete: true },
      { athleteId: "a-full", health: "Clear", goals: "College looks", complete: true },
      { athleteId: "a-softball", health: "Clear", goals: "High school varsity", complete: true },
      { athleteId: "a-catcher", health: "Clear", goals: "Start at 13U", complete: true },
      { athleteId: "a-down", health: "Soreness last 10 days", goals: "Get healthy", complete: true },
    ],
    videos: [
      { id: "vid1", athleteId: "a-full", title: "Open side", date: "2026-09-09", angle: "1B line" },
      { id: "vid2", athleteId: "a-remote", title: "Rear view", date: "2026-09-03", angle: "Center" },
      { id: "vid3", athleteId: "a-hitter", title: "Tee path", date: "2026-09-07", angle: "Open side" },
    ],
    documents: [
      { id: "doc1", athleteId: "a-full", name: "Waiver 2026", kind: "waiver", date: "2026-08-01" },
      { id: "doc2", athleteId: "a-9u", name: "Waiver 2026", kind: "waiver", date: "2026-08-20" },
      { id: "doc3", athleteId: "a-college", name: "Physical", kind: "medical", date: "2026-08-01" },
    ],
    videoStandards: [
      { id: "vs1", title: "Open side", detail: "Camera on the first-base line, waist high, whole body in frame." },
      { id: "vs2", title: "Rear / center", detail: "Behind the mound, see the target and the finish." },
      { id: "vs3", title: "Hitting open side", detail: "See contact and the full finish. No vertical crop." },
    ],
  };
  return enrichSeed(data);
}

function chartPitches(
  rows: Array<[number, number, number, number, boolean?]>,
): BullpenPitch[] {
  return rows.map(([ir, ic, ar, ac, nc]) => {
    const intent = { row: ir, col: ic };
    const actual = { row: ar, col: ac, ...(nc ? { noncompetitive: true } : {}) };
    return { intent, actual, score: scorePitch(intent, actual) };
  });
}

function isoDaysAgo(n: number) {
  const d = new Date("2026-09-14T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function enrichSeed(data: DevelopmentData): DevelopmentData {
  for (const row of data.athletes) {
    if (row.id === "a-full") {
      row.sex = "M";
      row.movementScore = 62;
      row.frame = { height: "5'11\"", weight: 175, fatherHeight: "6'1\"", motherHeight: "5'5\"" };
    }
    if (row.id === "a-college") {
      row.sex = "M";
      row.movementScore = 78;
      row.frame = {
        height: "6'2\"",
        weight: 205,
        fatherHeight: "6'0\"",
        motherHeight: "5'7\"",
        cmjLoaded: 32,
        cmjUnloaded: 28,
        sprint10: 1.62,
        sprint30: 4.1,
      };
    }
    if (row.id === "a-down") {
      row.sex = "M";
      row.movementScore = 58;
      row.frame = { height: "5'10\"", weight: 160, fatherHeight: "5'11\"", motherHeight: "5'4\"" };
    }
    if (row.id === "a-remote") {
      row.sex = "M";
      row.movementScore = 70;
      row.frame = { height: "6'0\"", weight: 180, fatherHeight: "6'2\"", motherHeight: "5'6\"" };
    }
    if (row.id === "a-hitter") {
      row.sex = "M";
      row.movementScore = 64;
      row.frame = { height: "5'9\"", weight: 155, fatherHeight: "5'11\"", motherHeight: "5'5\"" };
    }
    if (row.id === "a-spike") {
      row.sex = "M";
      row.movementScore = 60;
      row.frame = { height: "5'10\"", weight: 168, fatherHeight: "6'0\"", motherHeight: "5'5\"" };
    }
    if (row.id === "a-softball") {
      row.sex = "F";
      row.movementScore = 66;
      row.frame = { height: "5'6\"", weight: 130, fatherHeight: "5'10\"", motherHeight: "5'4\"" };
    }
    if (row.id === "a-9u") {
      row.sex = "M";
      row.movementScore = 40;
      row.frame = { height: "4'8\"", weight: 72, fatherHeight: "5'11\"", motherHeight: "5'5\"" };
    }
  }

  const planByFamily: Record<string, DevelopmentData["families"][number]["plan"]> = {
    "f-harper": { type: "none", lessonCredits: 0 },
    "f-calhoun": { type: "development", lessonCredits: 2, lessons: 4, remote: 0, tier: "development" },
    "f-ruiz": { type: "performance", lessonCredits: 1, lessons: 4, remote: 1, tier: "performance" },
    "f-walsh": { type: "development", lessonCredits: 3, lessons: 4, remote: 0, tier: "development" },
    "f-briggs": { type: "package", lessonCredits: 3 },
    "f-navarro": { type: "none", lessonCredits: 0 },
    "f-mccabe": { type: "performance", lessonCredits: 2, lessons: 4, remote: 1, tier: "performance" },
    "f-hale": { type: "development", lessonCredits: 1, lessons: 4, remote: 0, tier: "development" },
    "f-pitts": { type: "elite", lessonCredits: 1, lessons: 4, remote: 4, tier: "elite" },
    "f-nguyen": { type: "remote", lessonCredits: 0, remote: 4 },
  };
  for (const family of data.families) {
    family.plan = planByFamily[family.id] ?? { type: "none", lessonCredits: 0 };
  }

  data.policy.rescheduleDaysNotice = PD_POLICY.rescheduleDaysNotice;
  data.policy.reschedulesPerMonth = PD_POLICY.reschedulesPerMonth;
  data.policy.verifyActivities = true;
  const hale = data.families.find((row) => row.id === "f-hale");
  if (hale) hale.leaderboardOptOut = true;

  const extraVelo: DevelopmentData["velocity"] = [
    { id: "v9", athleteId: "a-full", date: "2026-03-10", mph: 76 },
    { id: "v10", athleteId: "a-full", date: "2026-04-12", mph: 77 },
    { id: "v11", athleteId: "a-full", date: "2026-05-08", mph: 78 },
    { id: "v11b", athleteId: "a-full", date: "2026-07-01", mph: 80 },
    { id: "v12", athleteId: "a-down", date: "2026-03-20", mph: 78 },
    { id: "v13", athleteId: "a-down", date: "2026-04-22", mph: 77 },
    { id: "v14", athleteId: "a-down", date: "2026-05-18", mph: 76 },
    { id: "v15", athleteId: "a-remote", date: "2026-03-01", mph: 78 },
    { id: "v16", athleteId: "a-remote", date: "2026-04-01", mph: 79 },
    { id: "v17", athleteId: "a-remote", date: "2026-05-01", mph: 80 },
    { id: "v18", athleteId: "a-remote", date: "2026-06-01", mph: 81 },
    { id: "v19", athleteId: "a-remote", date: "2026-07-15", mph: 82 },
    { id: "v20", athleteId: "a-remote", date: "2026-08-20", mph: 83 },
    { id: "v21", athleteId: "a-hitter", date: "2026-03-12", mph: 72 },
    { id: "v22", athleteId: "a-hitter", date: "2026-04-16", mph: 73 },
    { id: "v23", athleteId: "a-hitter", date: "2026-05-14", mph: 74 },
    { id: "v24", athleteId: "a-hitter", date: "2026-06-18", mph: 75 },
    { id: "v25", athleteId: "a-hitter", date: "2026-07-20", mph: 76 },
    { id: "v26", athleteId: "a-hitter", date: "2026-08-22", mph: 77 },
  ];
  data.velocity = [...extraVelo, ...data.velocity];

  const outing = data.outings.find((row) => row.id === "o3");
  if (outing) outing.pitches = 118;
  const o1 = data.outings.find((row) => row.id === "o1");
  if (o1) o1.pitches = 78;
  const o2 = data.outings.find((row) => row.id === "o2");
  if (o2) o2.pitches = 62;

  data.bookings.push({
    id: "b-kane-rest",
    athleteId: "a-spike",
    serviceId: "s3",
    date: "2026-09-16",
    time: "17:00",
    status: "paid",
    price: 100,
    coachId: "c-steve",
  });
  data.bookings.push({
    id: "b6",
    athleteId: "a-full",
    serviceId: "s3",
    date: "2026-09-09",
    time: "17:00",
    status: "completed",
    price: 100,
    coachId: "c-steve",
    payout: "unpaid",
  });
  data.bookings.push({
    id: "b7",
    athleteId: "a-down",
    serviceId: "s3",
    date: "2026-08-12",
    time: "17:00",
    status: "completed",
    price: 100,
    coachId: "c-steve",
    payout: "paid",
  });
  data.bookings.push({
    id: "b-harper-in",
    athleteId: EMPTY_ATHLETE_ID,
    serviceId: "s1",
    date: "2026-09-16",
    time: "16:00",
    status: "paid",
    price: 149,
    coachId: STEVE,
    payout: "unpaid",
  });
  data.bookings.push({
    id: "b-10d",
    athleteId: "a-full",
    serviceId: "s3",
    date: "2026-09-24",
    time: "17:00",
    status: "paid",
    price: 100,
    coachId: STEVE,
  });
  data.bookings.push({
    id: "b-harper-out",
    athleteId: EMPTY_ATHLETE_ID,
    serviceId: "s1",
    date: "2026-09-24",
    time: "17:00",
    status: "paid",
    price: 149,
    coachId: STEVE,
    payout: "unpaid",
  });

  const ryderChart = chartPitches([
    [1, 1, 1, 1],
    [1, 3, 1, 2],
    [2, 1, 2, 1],
    [3, 3, 3, 3],
    [1, 1, 1, 3],
    [2, 2, 2, 2],
    [3, 1, 2, 1],
    [1, 3, 0, 3],
    [2, 3, 2, 3],
    [3, 2, 3, 2],
    [1, 2, 1, 2],
    [2, 1, 3, 1],
    [3, 3, 3, 2],
    [1, 1, 4, 1],
    [2, 2, 2, 2],
    [3, 1, 3, 1],
  ]);
  const ryderPen = data.bullpens.find((row) => row.id === "bp1");
  if (ryderPen) {
    ryderPen.chart = ryderChart;
    ryderPen.tci = tciOf(ryderChart.map((p) => ({ ...p, score: p.score ?? 0 })));
  }

  for (let i = 27; i >= 0; i--) {
    const date = isoDaysAgo(i);
    const existing = data.workload.find((row) => row.athleteId === "a-spike" && row.date === date);
    if (existing) continue;
    const spike = i <= 6;
    data.workload.push({
      id: `wl-k-${date}`,
      athleteId: "a-spike",
      date,
      throws: spike ? 90 : 30,
      rpe: spike ? 7 : 4,
    });
  }
  for (let i = 27; i >= 0; i--) {
    const date = isoDaysAgo(i);
    if (data.workload.some((row) => row.athleteId === "a-down" && row.date === date)) continue;
    data.workload.push({
      id: `wl-e-${date}`,
      athleteId: "a-down",
      date,
      throws: i <= 10 ? 12 : 35,
      rpe: 4,
    });
  }

  data.metrics.push({
    id: "mt4",
    athleteId: "a-college",
    name: "FB HB",
    value: "8.1 in",
    date: "2026-08-01",
  });
  data.strengthLog.push({
    id: "st4",
    athleteId: "a-full",
    date: "2026-09-08",
    lift: "Lateral-to-medial jump",
    value: 18,
    unit: "in",
  });
  data.strengthLog.push({
    id: "st5",
    athleteId: "a-full",
    date: "2026-09-08",
    lift: "Rotational med-ball throw",
    value: 22,
    unit: "ft",
  });

  const methods = [
    { method: "constraint drill", n: 12, retain: 9, delta: 6, band: "advanced", coachId: STEVE },
    { method: "verbal cue", n: 11, retain: 6, delta: 3, band: "advanced", coachId: STEVE },
    { method: "grip", n: 5, retain: 2, delta: 1, band: "developing", coachId: STEVE },
    { method: "setup", n: 8, retain: 5, delta: 2, band: "youth", coachId: STEVE },
    { method: "tempo", n: 4, retain: 3, delta: 4, band: "developing", coachId: HITTING },
    { method: "intent", n: 6, retain: 2, delta: 1, band: "advanced", coachId: HITTING },
  ];
  let n = 0;
  for (const row of methods) {
    for (let i = 0; i < row.n; i++) {
      n += 1;
      const retained = i < row.retain;
      data.interventions.push({
        id: `in-x-${n}`,
        athleteId: row.coachId === HITTING ? "a-hitter" : "a-full",
        date: `2026-0${(i % 8) + 1}-12`,
        constraint: row.method,
        result: retained ? "Kept." : "Dropped.",
        coachId: row.coachId,
        method: row.method,
        outcome: retained ? "Retained" : "Discarded",
        band: row.band,
        preScore: 60,
        postScore: retained ? 60 + row.delta : 60 - 1,
      });
    }
  }

  data.calibrationScores = [
    {
      id: "cs1",
      caseId: "case-15u-rhp",
      coachId: STEVE,
      at: "2026-09-10",
      scores: { posture: 1, direction: 2, stride: 2, separation: 1, slot: 2, balance: 2 },
    },
    {
      id: "cs2",
      caseId: "case-15u-rhp",
      coachId: HITTING,
      at: "2026-09-10",
      scores: { posture: 1, direction: 2, stride: 3, separation: 1, slot: 2, balance: 2 },
    },
    {
      id: "cs3",
      caseId: "case-13u-lhp",
      coachId: STEVE,
      at: "2026-09-11",
      scores: { posture: 1, direction: 1, stride: 1, separation: 1, slot: 2, balance: 1 },
    },
    {
      id: "cs4",
      caseId: "case-13u-lhp",
      coachId: HITTING,
      at: "2026-09-11",
      scores: { posture: 3, direction: 3, stride: 2, separation: 3, slot: 3, balance: 2 },
    },
    {
      id: "cs5",
      caseId: "case-16u-rhh",
      coachId: STEVE,
      at: "2026-09-12",
      scores: { posture: 2, direction: 2, stride: 1, separation: 1, slot: 2, balance: 1 },
    },
    {
      id: "cs6",
      caseId: "case-16u-rhh",
      coachId: HITTING,
      at: "2026-09-12",
      scores: { posture: 2, direction: 2, stride: 2, separation: 2, slot: 0, balance: 2 },
    },
  ];

  return data;
}
