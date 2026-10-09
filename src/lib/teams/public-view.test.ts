import test from "node:test";
import assert from "node:assert/strict";
import {sampleClub} from "./seed";
import {parseClubSave} from "./contracts";
import {publicTeamsView, playerStatsView, canReadTeamStats, aggregateTeamStats, teamCoaches} from "./public-view";

test("public team view publishes names, coaches and totals without individual stats or private records", () => {
  const club=sampleClub(); club._demo=false;
  const team=club.teams[0], p=team.roster[0];
  p.stats={ab:10,h:4,hr:1}; p.emergency.notes="secret medical";
  p.publicProfile.enabled=false;
  const publicTeam=publicTeamsView(club).find(t=>t.id===team.id)!;
  assert(publicTeam.players.some(row=>row.name===p.name));
  assert.deepEqual(Object.keys(publicTeam.players[0]).sort(),["id","name","number"]);
  const json=JSON.stringify(publicTeam);
  for(const secret of [p.parents[0].email,"secret medical","feeLock","familyId","coachEmail","backgroundCheck"]) assert(!json.includes(secret), secret);
  assert.equal(publicTeam.record.w, team.record.w);
  assert.equal(publicTeam.stats.hr, team.roster.filter(p=>!p.withdrawn).reduce((s,p)=>s+(p.stats.hr||0),0));
  assert.deepEqual(publicTeamsView({...club,_demo:true}),[]);
  team.closed=true; assert(!publicTeamsView(club).some(t=>t.id===team.id));
});

test("team members can read teammate stats, unrelated and former members cannot; detail is stats only", () => {
  const club=sampleClub(), team=club.teams[0], other=club.teams[1];
  const own=team.roster[0], teammate=team.roster[1];
  own.familyId="isolated-household"; own.parents=[{...own.parents[0],email:"isolated-parent@example.invalid"}];
  const parent={role:"parent",email:own.parents[0].email,familyId:own.familyId};
  assert(canReadTeamStats(team,parent));
  const detail=playerStatsView(team,teammate.id,parent);
  assert.deepEqual(detail.stats,teammate.stats);
  assert.deepEqual(Object.keys(detail).sort(),["id","name","number","stats","teamId","teamName"]);
  assert(canReadTeamStats(team,{role:"player",email:own.email||"member@example.invalid",familyIds:[own.familyId]}));
  assert(canReadTeamStats(team,{role:"coach",email:team.coachEmail.toUpperCase()}));
  assert(!canReadTeamStats(team,{role:"coach",email:other.coachEmail}));
  assert.throws(()=>playerStatsView(team,teammate.id,{role:"parent",email:"outsider@example.invalid"}));
  assert.throws(()=>playerStatsView(team,other.roster[0].id,parent),/not found/);
  own.withdrawn=true; assert(!canReadTeamStats(team,parent));
  team.closed=true; assert(!canReadTeamStats(team,{role:"coach",email:team.coachEmail}));
});

test("deduplicate head/staff coach and compute weighted team average", () => {
  const team=sampleClub().teams[0];
  assert.equal(teamCoaches(team).filter(c=>c.name===team.headCoach).length,1);
  team.roster=team.roster.slice(0,2);
  team.roster[0].stats={ab:10,h:4,avg:.4};team.roster[1].stats={ab:90,h:9,avg:.1};
  assert.equal(aggregateTeamStats(team).avg,.13);
});

test("club saves preserve uploaded coach profiles and multiple seasons", () => {
  const club=sampleClub(), team=club.teams[0];
  team.seasons=["Spring 2027","Summer 2027"];team.seasonLabel=team.seasons.join(" & ");
  team.headCoachBio="Head coach bio";team.headCoachPhoto="data:image/png;base64,YQ==";
  team.staff[0].bio="Assistant bio";team.staff[0].photo="data:image/webp;base64,Yg==";
  const saved=parseClubSave({club,baseRev:club._rev});
  assert.deepEqual(saved.club.teams[0].seasons,team.seasons);
  assert.equal(saved.club.teams[0].staff[0].bio,"Assistant bio");
});
