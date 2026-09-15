import type { DiagnosticSymptom, Discipline } from "./types";

/** Verbatim coaching copy. Do not rewrite. */
export const DIAGNOSTICS: Record<Discipline, DiagnosticSymptom[]> = {
  Pitching: [
    { symptom: "Misses arm side, ball runs away from the target", causes: [
      { cause: "Rotating early — the chest opens before the front foot lands", confirm: "Film open side. At foot strike the chest should still face third base (RHP). If it's square to the plate, this is it.", fix: "Hip-shoulder separation holds, then rocker throws. Constrain, don't cue.", drills: ["d18", "d1"], cue: "Show the hitter your back pocket longer" },
      { cause: "Late arm — hand isn't up at foot strike", confirm: "Pause the video at foot strike. Ball should be above the elbow, facing away. If the hand is still below shoulder height, the arm is late.", fix: "Pivot pickoffs to isolate arm timing, then step-behinds to rebuild rhythm.", drills: ["d17", "d4"], cue: "Get the ball up on time" },
      { cause: "Stride lands closed, throwing across the body", confirm: "Chalk a line from the rubber to the target. Watch where the front foot lands relative to it.", fix: "Two-plate direction drill until landing in the lane is automatic.", drills: ["d19", "d3"], cue: "Land where you look" }] },
    { symptom: "Misses glove side, ball cuts or sails that way", causes: [
      { cause: "Head pulls off the target at release", confirm: "Film front on. Watch the head from release to finish — it should stay quiet and pointed at the target.", fix: "Nine-box with a still-head constraint; call the cell out loud before each pitch.", drills: ["d11", "d13"], cue: "Nose to the target through release" },
      { cause: "Getting around the ball instead of through it", confirm: "Watch the fastball's shape. Cut on a four-seam usually means the hand is outside the ball at release.", fix: "Grip and release work before touching mechanics — this is rarely a body problem.", drills: ["d15", "d7"], cue: "Thumb down, through the inside of the ball" }] },
    { symptom: "Velocity is below where the athlete's size and strength suggest", causes: [
      { cause: "No hip-shoulder separation — hips and chest turn together", confirm: "Open-side film. If the belt buckle and chest reach the plate at the same time, there's no stretch to use.", fix: "Separation holds, then med-ball rotational throws at full intent.", drills: ["d18", "h7"], cue: "Hips first, chest late" },
      { cause: "Soft front leg — knee keeps drifting through release", confirm: "Watch the lead knee from foot strike to release. It should stop and straighten, not continue forward.", fix: "Split-position throws and lead-leg constraint work, plus posting strength in the weight room.", drills: ["d9", "d10"], cue: "Post it — chest over a firm front side" },
      { cause: "Passive delivery, no momentum down the mound", confirm: "Compare a step-behind throw to a normal one. If step-behinds jump noticeably, momentum is the missing piece.", fix: "Step-behinds and continuous-motion throws to build controlled momentum.", drills: ["d4", "d6"], cue: "Move down the mound, not down into it" }] },
    { symptom: "Command falls apart late in an outing", causes: [
      { cause: "Conditioning and workload, not mechanics", confirm: "Chart velocity and arm slot across a long bullpen. A drop in both late is fatigue, not a flaw.", fix: "Fatigue command testing, and check the acute:chronic workload ratio before adding anything.", drills: ["d21"], cue: "Same routine, same tempo, every pitch" },
      { cause: "Tempo speeds up under pressure", confirm: "Time the delivery early vs late in the session. Rushing shows up as a shorter lift and a quicker gather.", fix: "Rhythm work with a count, plus a rehearsed reset routine.", drills: ["d5", "d6"], cue: "Lift on one, land on three" }] },
    { symptom: "Secondary pitch gets identified out of the hand", causes: [
      { cause: "Different release point or arm speed than the fastball", confirm: "Film from behind and compare the two releases frame by frame at the same tunnel point.", fix: "Tunnel pairs — fastball and secondary back to back to the same point.", drills: ["d20"], cue: "Same window, same arm speed" }] },
  ],
  Hitting: [
    { symptom: "Late on fastballs, fouling them straight back or behind", causes: [
      { cause: "Timing — the load starts too late", confirm: "Film and check when the front heel lifts relative to the pitcher's release. Late heel means late everything.", fix: "Step-and-hit and machine timing work. Fix timing before touching the swing.", drills: ["h3", "h4"], cue: "Start earlier, not faster" },
      { cause: "Long swing — hands cast away from the body", confirm: "Overhead or open-side film. Watch whether the hands travel away from the torso before the barrel turns.", fix: "Top-hand/bottom-hand isolation and connection work.", drills: ["h1", "h4"], cue: "Hands inside the ball" }] },
    { symptom: "Weak ground balls to the pull side", causes: [
      { cause: "Barrel rolling over — top hand takes over early", confirm: "Check contact point. Rollover almost always means contact happened too deep with the barrel already turning.", fix: "Opposite-field-only rounds. The target does the coaching; no cue needed.", drills: ["h6", "h1"], cue: "Palm up, palm down through contact" },
      { cause: "Front hip flies open", confirm: "Film front on. If the belt buckle faces the pitcher before contact, the front side has left early.", fix: "Oppo tee work plus hip-lead constraint drills.", drills: ["h6", "h2"], cue: "Stay closed with the front side" }] },
    { symptom: "Can't cover the outer third", causes: [
      { cause: "Pulling off the ball", confirm: "Chart contact by pitch location. If everything away is weak or missed, the front side is leaving.", fix: "Opposite-field rounds where only hard oppo contact counts.", drills: ["h6"], cue: "Let it travel, hit the inside of the ball" }] },
    { symptom: "Chases pitches out of the zone", causes: [
      { cause: "No plan before the pitch", confirm: "Ask what they were hunting before the round. If they can't answer, this is it.", fix: "Called-zone front toss where taking the right pitch scores like a hit.", drills: ["h8", "h9"], cue: "Have a plan, take is a win" },
      { cause: "Late recognition", confirm: "Call-out drill — if they can't name the pitch before deciding, recognition is the constraint.", fix: "Naming drills with mixed pitch types.", drills: ["h9"], cue: "Name it early" }] },
    { symptom: "Bat speed plateaued despite getting stronger", causes: [
      { cause: "Arms-only swing — no sequence to use the strength", confirm: "Open-side film: do the hips start before the hands, or together?", fix: "Rotational med-ball throws and hips-lead tee work before any bat-speed program.", drills: ["h7", "h5"], cue: "Hips lead, hands late" }] },
  ],
  Catching: [
    { symptom: "Borderline strikes getting called balls", causes: [
      { cause: "Glove is still moving away from the zone when it stops", confirm: "Film from the umpire's view. Watch where the glove stops, not where it catches.", fix: "Bare-hand edge series, one edge at a time — they don't transfer to each other.", drills: ["c20", "c1"], cue: "Beat it to the spot, then work it back" },
      { cause: "Body drifts to the pitch", confirm: "Watch the head and torso. Any lean toward the ball takes the strike with it.", fix: "Stance holds and quiet-body receiving reps.", drills: ["c20"], cue: "Quiet body, quiet mitt" }] },
    { symptom: "Balls in the dirt getting past", causes: [
      { cause: "Standing up out of the block to find the ball", confirm: "Film the block. If the chest comes up before the ball is dead, that's it.", fix: "Blocking progression with random locations and real spin.", drills: ["c22", "c3"], cue: "Chin down, stay down until it's dead" }] },
    { symptom: "Pop time slower than the arm should produce", causes: [
      { cause: "Slow exchange, not a weak arm", confirm: "Time the exchange in isolation. Most catchers lose a tenth or two here before the arm matters.", fix: "Timed exchange ladder, 50 to 75 reps a session.", drills: ["c21", "c4"], cue: "Ball to the ear, never look at the transfer" },
      { cause: "Extra footwork steps", confirm: "Film from above and count steps. Two clean beats three fast.", fix: "Jab-replace footwork dry, then at speed.", drills: ["c5"], cue: "Hips to the bag in two" }] },
  ],
  Fielding: [
    { symptom: "Booting routine ground balls", causes: [
      { cause: "Feet, not hands — arriving flat-footed with no rhythm", confirm: "Watch the approach, not the glove. No right-left before fielding means no adjustment available.", fix: "Short-hop volume plus rhythm work into the ball.", drills: ["f20", "f22"], cue: "Right-left-field, work out front" },
      { cause: "Fielding on the heels, letting the ball play them", confirm: "Check where contact happens relative to the front foot. Behind it means the ball won.", fix: "Short-hop gauntlet, bare hand first.", drills: ["f20"], cue: "Go get it" }] },
    { symptom: "Bad routes in the outfield, balls falling behind", causes: [
      { cause: "First step forward on anything over the head", confirm: "Film from behind. A false step forward costs two steps you never recover.", fix: "Drop-step reaction drill until it's automatic.", drills: ["f21"], cue: "Open the hips, don't backpedal" }] },
    { symptom: "Slow or inaccurate throws after fielding", causes: [
      { cause: "Exchange, not arm strength", confirm: "Time glove-to-glove rather than measuring arm velocity.", fix: "Transfer and release work; do-or-die reps on the run.", drills: ["f22", "f3"], cue: "Throw through the target" }] },
  ],
};
