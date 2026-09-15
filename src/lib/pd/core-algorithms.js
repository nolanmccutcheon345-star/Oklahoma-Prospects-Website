/**
 * Oklahoma Prospects — scoring engines.
 * Helpers below are identifiers the pasted engines close over (dates, height
 * parse, cohort metric series, scorecard keys). They are NOT replacements for
 * the published formulas that follow.
 */

import { slotsFor, timeMinutes, chicagoDate } from '../scheduling.ts';
import { coachAvailable } from '../commerce/availability.ts';
function NOW() { return new Date(); }

function inFromStr(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const m = s.match(/^(\d+)\s*['’]\s*(\d+(?:\.\d+)?)/) || s.match(/^(\d+)\s*ft\s*(\d+(?:\.\d+)?)/i);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fmtHeight(inches) {
  if (inches == null || !Number.isFinite(Number(inches))) return "—";
  const ft = Math.floor(inches / 12);
  const inn = Math.round((inches % 12) * 10) / 10;
  return ft + "'" + inn + '"';
}

function projectAdultHeight(a) {
  const f = a.frame || {};
  const h = inFromStr(f.height);
  const father = inFromStr(f.fatherHeight);
  const mother = inFromStr(f.motherHeight);
  if (h == null) return null;
  const female = a.sex === "F" || a.sport === "softball";
  let adult = null;
  if (father != null && mother != null) {
    adult = (father + mother) / 2 + (female ? -2.5 : 2.5);
  } else if (a.age >= 18) {
    adult = h;
  }
  if (adult == null) return { adult: null, growthLeft: null };
  return { adult, growthLeft: Math.max(0, adult - h) };
}

function quartile(arr, q) {
  const s = arr.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - pos) + s[hi] * (pos - lo);
}
function median(arr) {
  return quartile(arr, 0.5);
}

const COHORT_METRICS = [
  { key: "velo", label: "Fastball velocity", unit: "mph", series: (a) => (a.veloHistory || []).filter((x) => typeof x === "number") },
  { key: "tci", label: "Command index (TCI)", unit: "", series: (a) => (a.tciHistory || []).filter((x) => typeof x === "number") },
];

const PILLARS = [
  { key: "movement", label: "Movement" },
  { key: "timing", label: "Timing" },
  { key: "direction", label: "Direction" },
  { key: "release", label: "Release" },
];

const SCORECARD = [
  { key: "posture", pillar: "movement", label: "Posture" },
  { key: "balance", pillar: "movement", label: "Balance" },
  { key: "tempo", pillar: "timing", label: "Tempo" },
  { key: "sequence", pillar: "timing", label: "Sequence" },
  { key: "separation", pillar: "timing", label: "Separation" },
  { key: "stride", pillar: "direction", label: "Stride" },
  { key: "direction", pillar: "direction", label: "Direction" },
  { key: "glove", pillar: "direction", label: "Glove side" },
  { key: "slot", pillar: "release", label: "Arm slot" },
  { key: "finish", pillar: "release", label: "Finish / release" },
];

function pointsStatus(a) {
  const now = NOW();
  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  const startIso = start.toISOString().slice(0, 10);
  const earned = (a.pointsLog || [])
    .filter((p) => (p.date || "") >= startIso)
    .reduce((s, p) => s + (Number(p.points) || 0), 0);
  const target = 50;
  return { earned, target, met: earned >= target };
}

const CAL_DOMAINS = SCORECARD.map((s) => [s.key, s.label]);

const AGE_GROUPS = [
  { label: "Youth (8–12)", test: (a) => a.age >= 8 && a.age <= 12 },
  { label: "Developing (13–15)", test: (a) => a.age >= 13 && a.age <= 15 },
  { label: "Advanced (16+)", test: (a) => a.age >= 16 },
];
const MIN_SAMPLE = 8;

const TRACK_ALIASES = {
  velo: ["velo", "velocity", "speed", "mph", "rel_speed"],
  spin: ["spin", "rpm", "spinrate", "spin_rate"],
  ivb: ["ivb", "induced_vert", "vert_break", "vb"],
  hb: ["hb", "horz_break", "horizontal_break"],
  ext: ["ext", "extension", "release_extension"],
  height: ["height", "release_height", "rel_height"],
  type: ["type", "pitch_type", "pitch"],
};

function matchColumn(headers, key) {
  const aliases = (TRACK_ALIASES[key] || []).map((a) => a.toLowerCase().replace(/[\s_]+/g, ""));
  return headers.findIndex((h) => aliases.includes(String(h).toLowerCase().replace(/[\s_]+/g, "")));
}

function upcomingDates(n) {
  const start = new Date(chicagoDate()+"T12:00:00Z");
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(start.getTime());
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    out.push({ iso, label });
  }
  return out;
}

function openSlots(availability, bookings, coachId, d, duration = 30) {
  const iso = d && (d.iso || d.date || d);
  return slotsFor(iso,duration).filter(slot=>coachAvailable(availability,coachId,iso,slot.value,duration))
    .filter(slot=>!(bookings||[]).some(b=>{
      if(b.date!==iso || b.coachId!==coachId || ['cancelled','unconfirmed','waitlist'].includes(b.status))return false;
      const start=timeMinutes(b.time),length=b.minutes||b.duration||(b.serviceId==='s1'?75:b.serviceId==='s9'?60:60);
      return timeMinutes(slot.value)<start+length && timeMinutes(slot.value)+duration>start;
    })).map(slot=>slot.value);
}

// Oklahoma Prospects — core algorithms.
// PASTE THESE VERBATIM. They cannot be re-derived from a description.


/* ===== Acklam inverse normal ===== */
function invNorm(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/* ===== Velocity potential model ===== */
function velocityPotential(a) {
  const sport = a.sport === "softball" ? "softball" : "baseball";
  const f = a.frame || {};
  const cur = a.veloHistory && a.veloHistory.length ? a.veloHistory[a.veloHistory.length - 1] : null;
  const h = inFromStr(f.height);
  const proj = projectAdultHeight(a);
  const drivers = [];
  const missing = [];
  if (h == null) missing.push("height");
  if (!f.weight) missing.push("weight");
  if (!f.fatherHeight || !f.motherHeight) missing.push("parent heights");
  if (cur == null) missing.push("a current velocity reading");
  const kpi = (a.strengthLog || []).slice(-1)[0] || {};
  const m = a.metrics || {};
  const cmjRatio = f.cmjLoaded && f.cmjUnloaded ? Number(f.cmjLoaded) / Number(f.cmjUnloaded) : null;
  const sprintRatio = f.sprint10 && f.sprint30 ? Number(f.sprint10) / Number(f.sprint30) : null;
  if (!cmjRatio) missing.push("loaded + unloaded CMJ");
  if (!sprintRatio) missing.push("10m and 30m sprint splits");

  let ceiling = null, method = "", ci = 4, floor = null;
  if (a.age >= 18 && h != null && cmjRatio && sprintRatio) {
    const kmh = 53.22 + 0.21 * (h * 2.54) + 14.3 * cmjRatio + 75.03 * sprintRatio;
    ceiling = kmh * 0.621371;
    method = "Adult field-test model (height, CMJ ratio, sprint ratio)";
    ci = 3.6;
    drivers.push({ label: "Height", value: fmtHeight(h), effect: `${(0.21 * 2.54 * 0.621371).toFixed(2)} mph per inch` });
    drivers.push({ label: "Loaded:unloaded CMJ ratio", value: cmjRatio.toFixed(2), effect: "Higher ratio = more force under load" });
    drivers.push({ label: "10m:30m sprint ratio", value: sprintRatio.toFixed(3), effect: "Transitional acceleration" });
  } else if (cur != null && h != null) {
    // Developmental: hold mechanics constant, project age and frame forward using published per-unit effects.
    const yearsToMature = Math.max(0, Math.min(6, 18 - a.age));
    const heightGain = proj && proj.growthLeft != null ? proj.growthLeft : 0;
    const ageGain = 1.5 * yearsToMature;
    const htGain = 1.2 * heightGain;
    // Mechanical headroom: separation (+2.6 max) and stride length (+1.9 per 10% of height) are coachable, so they're
    // credited only in proportion to how much room the movement score says is left.
    const mechRoom = a.movementScore != null ? Math.max(0, (85 - a.movementScore) / 85) : 0.5;
    const sepGain = 2.6 * mechRoom;
    const strideGain = 1.9 * mechRoom;
    ceiling = cur + ageGain + htGain + sepGain + strideGain;
    floor = cur + ageGain * 0.6 + htGain * 0.7;
    method = "Developmental model (age, projected frame, coachable mechanics)";
    ci = 5;
    drivers.push({ label: "Maturation", value: `${yearsToMature.toFixed(1)} yr to 18`, effect: `+${ageGain.toFixed(1)} mph`, note: "1.5 mph per year of age, holding everything else constant" });
    drivers.push({ label: "Projected growth", value: heightGain ? `+${heightGain.toFixed(1)}"` : "—", effect: `+${htGain.toFixed(1)} mph`, note: "1.2 mph per inch of height" });
    drivers.push({ label: "Hip-shoulder separation", value: `${Math.round(mechRoom * 100)}% room left`, effect: `+${sepGain.toFixed(1)} mph`, note: "2.6 mph available; coachable" });
    drivers.push({ label: "Stride length", value: `${Math.round(mechRoom * 100)}% room left`, effect: `+${strideGain.toFixed(1)} mph`, note: "1.9 mph per 10% of height; coachable" });
  }
  // Physical levers that aren't in the primary equation but have published correlations — shown as upside, not added.
  const levers = [];
  if (kpi.lmj) levers.push({ label: "Lateral-to-medial jump", value: `${kpi.lmj}"`, note: "The most consistent lower-body correlate of throwing velocity." });
  if (kpi.mbRot) levers.push({ label: "Rotational med-ball throw", value: `${kpi.mbRot} ft`, note: "Tracks throwing and bat velocity." });
  if (kpi.trapBar && f.weight) levers.push({ label: "Relative strength", value: `${(kpi.trapBar / Number(f.weight)).toFixed(2)}× bodyweight`, note: "Trap bar strength correlates with sprint speed (r ≈ 0.74)." });
  if (m.sixty) levers.push({ label: "60-yard dash", value: `${m.sixty}s`, note: "Whole-body power expression." });
  return { current: cur, ceiling, floor: floor ?? (ceiling != null ? ceiling - ci : null), ci, method, drivers, levers, missing, proj, sport };
}

/* ===== Pitch Smart rest ===== */
function restRequired(age, pitches) {
  const p = Number(pitches) || 0;
  const band = REST_RULES.find((r) => age >= r.ages[0] && age <= r.ages[1]) || REST_RULES[0];
  const step = band.steps.find(([max]) => p <= max);
  return step ? step[1] : 4;
}

/* ===== ACWR workload ===== */
function loadStats(loadHistory) {
  if (!loadHistory || loadHistory.length === 0) return { acuteAvg: 0, chronicAvg: 0, acwr: 0, band: "Not enough data", tone: "neutral" };
  const acute = loadHistory.slice(-7);
  const chronic = loadHistory.slice(-28);
  const acuteAvg = acute.reduce((a, b) => a + b, 0) / acute.length;
  const chronicAvg = chronic.reduce((a, b) => a + b, 0) / chronic.length;
  const acwr = chronicAvg ? Number((acuteAvg / chronicAvg).toFixed(2)) : 0;
  let band, tone;
  if (!chronicAvg) { band = "Not enough data"; tone = "neutral"; }
  else if (acwr > 1.5) { band = "High risk — workload spiking too fast"; tone = "warn"; }
  else if (acwr > 1.3) { band = "Caution — trending up quickly"; tone = "amber"; }
  else if (acwr < 0.7) { band = "Undertrained — load dropped off"; tone = "neutral"; }
  else { band = "Sweet spot"; tone = "good"; }
  return { acuteAvg: Number(acuteAvg.toFixed(1)), chronicAvg: Number(chronicAvg.toFixed(1)), acwr, band, tone };
}

/* ===== Cohort benchmarking ===== */
function buildCohort(data, athlete, metricKey, { sessions = 6, ageTol = 2, startTol = 8 } = {}) {
  const m = COHORT_METRICS.find((x) => x.key === metricKey);
  const mine = m.series(athlete);
  if (mine.length < 1) return { status: "no-baseline", metric: m };
  const myStart = mine[0];
  const peers = data.athletes.filter((a) => !a.archived && a.id !== athlete.id
    && Math.abs(a.age - athlete.age) <= ageTol
    && m.series(a).length >= sessions);
  const matched = peers.filter((a) => Math.abs(m.series(a)[0] - myStart) <= startTol);
  if (matched.length < 3) return { status: "thin", metric: m, found: matched.length, needed: 3, myStart, mine };
  const deltas = matched.map((a) => { const s = m.series(a); return s[Math.min(sessions - 1, s.length - 1)] - s[0]; });
  const myDelta = mine.length > 1 ? mine[mine.length - 1] - myStart : null;
  const beat = myDelta == null ? null : Math.round((deltas.filter((d) => d < myDelta).length / deltas.length) * 100);
  return {
    status: "ok", metric: m, n: matched.length, myStart, myDelta, myCurrent: mine[mine.length - 1],
    med: median(deltas), q1: Number(quartile(deltas, 0.25).toFixed(1)), q3: Number(quartile(deltas, 0.75).toFixed(1)),
    min: Math.min(...deltas), max: Math.max(...deltas), sessions,
    improved: Math.round((deltas.filter((d) => d > 0).length / deltas.length) * 100),
    percentileOfPeers: beat,
  };
}

/* ===== PDI scorecard ===== */
function pdiFrom(scores) {
  if (!scores) return null;
  const byPillar = {};
  PILLARS.forEach((p) => {
    const rows = SCORECARD.filter((s) => s.pillar === p.key && scores[s.key] != null);
    byPillar[p.key] = rows.length ? Math.round((rows.reduce((s, r) => s + scores[r.key], 0) / (rows.length * 3)) * 100) : null;
  });
  const scored = SCORECARD.filter((s) => scores[s.key] != null);
  const index = scored.length ? Math.round((scored.reduce((s, r) => s + scores[r.key], 0) / (scored.length * 3)) * 100) : null;
  return { index, byPillar, completeness: Math.round((scored.length / SCORECARD.length) * 100) };
}

/* ===== Fastball classification ===== */
function classifyFastball(ivb, hb, hand) {
  const v = Number(ivb), h = Number(hb);
  if (isNaN(v) || isNaN(h)) return null;
  const ah = Math.abs(h);
  if (h < -3 && v >= 11) return "Cut";
  if (v >= 16 && ah < 9) return "Ride";
  if (v < 10 && h > 12) return "Sink";
  if (h > 11 && v >= 10) return "Run";
  if (v >= 16) return "Ride";
  if (v < 10) return "Sink";
  return "Neutral";
}

/* ===== Churn risk ===== */
function churnRisk(family, data) {
  const athletes = data.athletes.filter((a) => family.athleteIds.includes(a.id) && !a.archived);
  if (!athletes.length) return null;
  const signals = [];
  let score = 0;

  const bookings = (data.bookings || []).filter((b) => athletes.some((a) => a.id === b.athleteId) && b.status !== "Cancelled");
  const future = bookings.filter((b) => new Date(`${b.date}T12:00:00`) >= NOW());
  if (!future.length) { score += 35; signals.push({ label: "Nothing on the calendar", detail: "No upcoming session booked.", fix: "Offer two specific times this week — an open question gets ignored, a concrete slot gets answered." }); }

  const completed = bookings.filter((b) => b.status === "Completed");
  const recent = completed.filter((b) => (NOW() - new Date(`${b.date}T12:00:00`)) / 864e5 <= 21);
  if (completed.length && !recent.length) { score += 25; signals.push({ label: "No session in 3 weeks", detail: `Last completed session was ${completed[completed.length - 1]?.dateLabel || "a while ago"}.`, fix: "Call, don't email. Three weeks is usually a scheduling problem or a quiet complaint." }); }

  const cancels = (data.bookings || []).filter((b) => athletes.some((a) => a.id === b.athleteId) && b.status === "Cancelled").length;
  if (cancels >= 2) { score += 15; signals.push({ label: `${cancels} cancellations`, detail: "Repeated cancellations usually precede a quiet exit.", fix: "Ask directly whether the time slot still works — most of the time it doesn't." }); }

  const plan = family.plan || {};
  if (plan.type === "package" && plan.lessonCredits > 0) {
    score += 10; signals.push({ label: `${plan.lessonCredits} unused credits`, detail: "Paid for and not used — the most common precursor to a refund request.", fix: "Book the remaining sessions for them now and send the schedule." });
  }
  if (plan.type === "none" || !plan.type) { score += 20; signals.push({ label: "No active plan", detail: "Paying lesson to lesson, if at all.", fix: "The development membership is the conversation — they're already getting a fraction of the system." }); }

  athletes.forEach((a) => {
    const pts = pointsStatus(a);
    const weeksMissed = (a.pointsLog || []).length === 0 ? 2 : (!pts.met ? 1 : 0);
    if (weeksMissed >= 2) { score += 15; signals.push({ label: `${a.name.split(" ")[0]} isn't doing the between-lesson work`, detail: "No activity logged at all.", fix: "Disengaged athletes quit before disengaged parents do. Ask the athlete, not the parent." }); }
    else if (!pts.met && pts.earned > 0) { score += 5; signals.push({ label: `${a.name.split(" ")[0]} short on weekly points`, detail: `${pts.earned} of ${pts.target}.`, fix: "Shrink the assignment until it gets done. A completed small plan beats an ignored big one." }); }
    if (!a.reportCard) { score += 10; signals.push({ label: `${a.name.split(" ")[0]} never got a baseline`, detail: "No assessment on file, so there's nothing to show progress against.", fix: "Families cancel when they can't see progress. Get the assessment done." }); }
  });

  const level = score >= 55 ? "high" : score >= 30 ? "watch" : null;
  return level ? { level, score, signals, family, athletes } : null;
}

/* ===== Required rest table ===== */
const REST_RULES = [
  { ages: [7, 12], steps: [[20, 0], [35, 1], [50, 2], [65, 3], [999, 4]] },
  { ages: [13, 14], steps: [[20, 0], [35, 1], [50, 2], [65, 3], [999, 4]] },
  { ages: [15, 18], steps: [[30, 0], [45, 1], [60, 2], [75, 3], [999, 4]] },
  { ages: [19, 22], steps: [[30, 0], [45, 1], [60, 2], [75, 3], [999, 4]] },
];

/* ===== Tier gating ===== */
const FEATURE_MIN_TIER = {
  profile: "development", video: "development", drills: "development", schedule: "development",
  tracking: "development", reassessment: "development", strength: "development",
  videoReview: "performance", pitchDesign: "performance", gameTracking: "performance", priority: "performance",
  film: "elite", monthlyReport: "elite", access: "elite",
};

/* ===== Points + weekly target ===== */
const POINT_VALUES = [
  { key: "throwing", label: "Throwing / skill day from your plan", points: 25, icon: "Target" },
  { key: "workout", label: "Strength session completed", points: 25, icon: "Dumbbell" },
  { key: "warmup", label: "Full warm-up before training", points: 10, icon: "Activity" },
  { key: "mobility", label: "Stretching / mobility session", points: 10, icon: "Activity" },
  { key: "drill", label: "Assigned drill block at home", points: 15, icon: "BookOpen" },
  { key: "checkin", label: "Daily check-in logged", points: 5, icon: "CheckCircle2" },
  { key: "armcare", label: "Arm care / recovery work", points: 10, icon: "Shield" },
  { key: "film", label: "Watched your own film", points: 15, icon: "Video" },
];

/* ===== Intervention stats ===== */
function interventionStats(data, { coachId, constraint, band } = {}) {
  const rows = (data.interventions || []).filter((i) =>
    (!coachId || i.coachId === coachId) && (!constraint || i.constraint === constraint) && (!band || i.band === band));
  const by = {};
  rows.forEach((r) => {
    const k = r.method || "unspecified";
    by[k] = by[k] || { method: k, n: 0, retained: 0, deltaSum: 0, deltaN: 0 };
    by[k].n++;
    if (r.outcome === "Retained") by[k].retained++;
    if (r.preScore != null && r.postScore != null) { by[k].deltaSum += r.postScore - r.preScore; by[k].deltaN++; }
  });
  return Object.values(by).map((x) => ({ ...x,
    retainRate: Math.round((x.retained / x.n) * 100),
    avgDelta: x.deltaN ? Number((x.deltaSum / x.deltaN).toFixed(1)) : null,
  })).sort((a, b) => b.retainRate - a.retainRate);
}

/* ===== Calibration result ===== */
function calibrationResult(scores, truth) {
  const diffs = CAL_DOMAINS.map(([k]) => scores[k] == null ? null : Math.abs(scores[k] - truth[k])).filter((x) => x != null);
  if (!diffs.length) return null;
  const exact = diffs.filter((d) => d === 0).length;
  const within1 = diffs.filter((d) => d <= 1).length;
  const off2 = diffs.filter((d) => d >= 2).length;
  const meanAbs = Number((diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(2));
  const status = off2 >= 3 ? "retrain" : off2 >= 1 ? "review" : within1 === diffs.length ? "aligned" : "review";
  return { exact, within1, off2, total: diffs.length, meanAbs, status };
}

/* ===== Outcome stats (public claims) ===== */
function outcomeStats(data) {
  const out = [];
  AGE_GROUPS.forEach((g) => {
    const pool = data.athletes.filter((a) => !a.archived && g.test(a));
    const veloGains = pool.filter((a) => (a.veloHistory || []).length >= 2).map((a) => a.veloHistory[a.veloHistory.length - 1] - a.veloHistory[0]).filter((v) => !isNaN(v));
    const tciGains = pool.filter((a) => (a.tciHistory || []).length >= 2).map((a) => a.tci - a.tciHistory[0]).filter((v) => !isNaN(v));
    if (veloGains.length >= MIN_SAMPLE) {
      const avg = veloGains.reduce((s, v) => s + v, 0) / veloGains.length;
      if (avg > 0) out.push({ group: g.label, metric: "velocity", value: `+${avg.toFixed(1)} mph`, n: veloGains.length, label: `${g.label} pitchers gained an average of ${avg.toFixed(1)} mph` });
    }
    if (tciGains.length >= MIN_SAMPLE) {
      const avg = tciGains.reduce((s, v) => s + v, 0) / tciGains.length;
      if (avg > 0) out.push({ group: g.label, metric: "command", value: `+${Math.round(avg)}`, n: tciGains.length, label: `${g.label} pitchers improved command index by ${Math.round(avg)} points` });
    }
  });
  const all = data.athletes.filter((a) => !a.archived);
  const improved = all.filter((a) => (a.tciHistory || []).length >= 2 && a.tci > a.tciHistory[0]).length;
  const measured = all.filter((a) => (a.tciHistory || []).length >= 2).length;
  return { rows: out, improvedPct: measured >= MIN_SAMPLE ? Math.round((improved / measured) * 100) : null, measured };
}

/* ===== CSV tracking parser ===== */
function parseTrackingCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "That file has no data rows." };
  const split = (l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const headers = split(lines[0]);
  const cols = Object.fromEntries(Object.keys(TRACK_ALIASES).map((k) => [k, matchColumn(headers, k)]));
  if (cols.velo < 0) return { error: `No velocity column found. Looked for: ${TRACK_ALIASES.velo.join(", ")}. Columns in your file: ${headers.slice(0, 8).join(", ")}${headers.length > 8 ? "…" : ""}` };
  const pitches = [];
  const skipped = [];
  lines.slice(1).forEach((l, i) => {
    const c = split(l);
    const num = (idx) => { if (idx < 0) return null; const v = Number(c[idx]); return isNaN(v) ? null : v; };
    const velo = num(cols.velo);
    if (velo == null || velo < 20 || velo > 110) { skipped.push({ row: i + 2, why: velo == null ? "no velocity" : `velocity ${velo} out of range` }); return; }
    pitches.push({ velo, spin: num(cols.spin), ivb: num(cols.ivb), hb: num(cols.hb), ext: num(cols.ext),
      height: num(cols.height), type: cols.type >= 0 ? (c[cols.type] || "").trim() : "" });
  });
  if (!pitches.length) return { error: "No usable rows — every row was missing a plausible velocity." };
  const byType = {};
  pitches.forEach((p) => { const t = p.type || "Unspecified"; (byType[t] = byType[t] || []).push(p); });
  const agg = (arr, k) => { const v = arr.map((x) => x[k]).filter((x) => x != null); return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) : null; };
  return {
    pitches, skipped, headers,
    count: pitches.length,
    maxVelo: Math.max(...pitches.map((p) => p.velo)),
    avgVelo: Number((pitches.reduce((s, p) => s + p.velo, 0) / pitches.length).toFixed(1)),
    byType: Object.entries(byType).map(([type, arr]) => ({ type, n: arr.length,
      avgVelo: agg(arr, "velo"), maxVelo: Math.max(...arr.map((x) => x.velo)),
      spin: agg(arr, "spin"), ivb: agg(arr, "ivb"), hb: agg(arr, "hb") })),
  };
}

/* ===== Auto-schedule plan ===== */
function scheduleSessionsForPlan(data, coachId, sessionsNeeded, remoteNeeded) {
  const dates = upcomingDates(98); // ~14 weeks of runway to find enough real open slots
  const provisional = [];
  for (const d of dates) {
    if (provisional.length >= sessionsNeeded) break;
    const slots = openSlots(data.availability, [...(data.bookings || []), ...provisional], coachId, d);
    if (slots.length) provisional.push({ coachId, date: d.iso, dateLabel: d.label, time: slots[0] });
  }
  const remoteReviews = [];
  if (remoteNeeded > 0) {
    const spacing = Math.max(1, Math.floor(dates.length / remoteNeeded));
    for (let i = 0; i < remoteNeeded; i++) remoteReviews.push({ dueDate: dates[Math.min(dates.length - 1, i * spacing + 5)].label });
  }
  return { booked: provisional, remoteReviews, short: provisional.length < sessionsNeeded };
}

/* ===== Plan execution steps ===== */
function planExecutionSteps(membership, athlete) {
  if (!membership) return [];
  const steps = [];
  const needsBaseline = !athlete.reportCard;
  if (needsBaseline) steps.push({ id: "assess", label: "Run the New Pitcher Assessment before the first plan session — nothing else on this list works without a baseline.", when: "Before session 1" });
  const n = membership.lessons || 0;
  for (let i = 1; i <= n; i++) {
    const isFirst = i === 1 && !needsBaseline;
    const isLast = i === n;
    steps.push({
      id: `s${i}`,
      when: `Week ${i}`,
      label: isFirst ? `Session ${i}: confirm P1 from the last assessment, build the first drill block around it.`
        : isLast ? `Session ${i}: retest whatever P1 was this month against session 1's number before writing the roadmap update.`
        : `Session ${i}: progress P1, log the tracker (TCI, hitting or catching) so the trend has a real point on it.`,
    });
  }
  if (membership.remote > 0) steps.push({ id: "video", when: "Ongoing", label: `Complete ${membership.remote} remote video review${membership.remote > 1 ? "s" : ""} across the month — these are graded work, not a formality.` });
  if (membership.tier === "performance" || membership.tier === "elite") steps.push({ id: "reassess", when: "End of month", label: "Retest the command or movement scorecard under the same conditions as last time." });
  if (membership.tier === "elite") {
    steps.push({ id: "film", when: "Once this month", label: "Complete the monthly game-film review — ask the family for an inning." });
    steps.push({ id: "design", when: "As needed", label: "Pitch design session if the arsenal has room to grow this month." });
  }
  steps.push({ id: "report", when: "End of month", label: membership.tier === "elite" ? "Publish the detailed monthly roadmap update." : "Publish the monthly progress update to the family." });
  return steps;
}

/* ===== Reschedule policy gate ===== */
function canReschedule(booking, family, data) {
  const p = data.policy;
  const days = (new Date(`${booking.date}T12:00:00`) - NOW()) / 864e5;
  if (days < p.rescheduleDaysNotice) {
    return { ok: false, reason: `Inside the ${p.rescheduleDaysNotice}-day window`, detail: `This session is ${days < 1 ? "less than a day" : `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`} away. Changes need ${p.rescheduleDaysNotice} days' notice so the slot can be re-offered. Call us if something genuinely unavoidable has come up.` };
  }
  const month = NOW().toISOString().slice(0, 7);
  const used = (data.bookings || []).filter((b) => family.athleteIds.includes(b.athleteId) && b.rescheduledMonth === month).length;
  if (used >= p.reschedulesPerMonth) {
    return { ok: false, reason: "Monthly limit reached", detail: `Your plan includes ${p.reschedulesPerMonth} reschedule${p.reschedulesPerMonth === 1 ? "" : "s"} a month and you've used ${used}. The limit resets on the 1st. You can still cancel under the normal policy.` };
  }
  return { ok: true, remaining: p.reschedulesPerMonth - used };
}

/* ===== TCI engine (scoring + index) ===== */
// 4 DOT · 3 QUALITY MISS · 2 CONTROL · 1 COMPETITIVE BALL · 0 NONCOMPETITIVE
const SCORE_LABELS = { 4: "Dot", 3: "Quality miss", 2: "Control", 1: "Competitive ball", 0: "Noncompetitive" };
const scorePitch = (intent, actual) => {
  if (actual.noncompetitive) return 0;
  const inZone = actual.row >= 1 && actual.row <= 3 && actual.col >= 1 && actual.col <= 3;
  if (!inZone) return 1;
  const d = Math.max(Math.abs(actual.row - intent.row), Math.abs(actual.col - intent.col));
  return d === 0 ? 4 : d === 1 ? 3 : 2;
};
const tciOf = (pitches) => pitches.length ? Math.round((pitches.reduce((s, p) => s + p.score, 0) / (pitches.length * 4)) * 100) : 0;


/* ===== Age bands ===== */
const BANDS = [
  { key: "youth", label: "Youth (8–12)", pitches: "15–20", intent: "sub-max, athletic", note: "Big targets, games, and reps. Every block is shorter and there is more movement than talk. Velocity is never the objective." },
  { key: "developing", label: "Developing (13–15)", pitches: "20–28", intent: "moderate to full", note: "Growth spurts change timing month to month. Re-check tempo and direction before adding load; introduce one secondary pitch at a time." },
  { key: "advanced", label: "Advanced (16+)", pitches: "25–35", intent: "full", note: "Individualized around P1. Technology is used when available, and every session ends with a number to retest against." },
];



const TIER_RANK = { development: 1, performance: 2, elite: 3 };
function planHasFeature(tier, feature) {
  const min = FEATURE_MIN_TIER[feature];
  if (!min) return false;
  return (TIER_RANK[tier] || 0) >= (TIER_RANK[min] || 0);
}

export {
  NOW,
  inFromStr,
  fmtHeight,
  projectAdultHeight,
  quartile,
  median,
  COHORT_METRICS,
  PILLARS,
  SCORECARD,
  pointsStatus,
  CAL_DOMAINS,
  AGE_GROUPS,
  MIN_SAMPLE,
  TRACK_ALIASES,
  matchColumn,
  upcomingDates,
  openSlots,
  invNorm,
  velocityPotential,
  restRequired,
  loadStats,
  buildCohort,
  pdiFrom,
  classifyFastball,
  churnRisk,
  REST_RULES,
  FEATURE_MIN_TIER,
  POINT_VALUES,
  interventionStats,
  calibrationResult,
  outcomeStats,
  parseTrackingCsv,
  scheduleSessionsForPlan,
  planExecutionSteps,
  canReschedule,
  SCORE_LABELS,
  scorePitch,
  tciOf,
  BANDS,
  TIER_RANK,
  planHasFeature,
};
