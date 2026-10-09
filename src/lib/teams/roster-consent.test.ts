import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleClub } from './seed';
import { recordTeamRosterConsent } from './roster-consent';
import { publicTeamView } from './public-view';
import { parseClubSave } from './contracts';
import { waiverInput } from '../portal-contracts';
import { WAIVER_TEXT, WAIVER_VERSION } from '../waiver-content';
import { ROSTER_CONSENT_TEXT } from '../roster-consent';

test('parent roster consent preserves signed financial agreements and stays private',()=>{
  const club=sampleClub(),team=club.teams[0],player=team.roster[0],agreement=structuredClone(player.agreement);
  const input={teamId:team.id,playerId:player.id,signerName:'Parent Guardian',consent:true as const};
  const viewer={role:'parent',email:'parent@example.com',familyIds:[player.familyId]};
  for(const invalid of [{...viewer,role:'player'},{...viewer,role:'coach'},{...viewer,familyIds:['other']}])
    assert.throws(()=>recordTeamRosterConsent(club,input,invalid),/parent or legal guardian/);
  recordTeamRosterConsent(club,input,viewer,new Date('2026-10-09T21:00:00Z'));
  assert.deepEqual(player.agreement,agreement);
  const reloaded=JSON.parse(JSON.stringify(club));
  assert.equal(parseClubSave({club:reloaded,baseRev:club._rev}).club.teams[0].roster[0].rosterConsent?.text,ROSTER_CONSENT_TEXT);
  assert.equal(reloaded.teams[0].roster[0].rosterConsent.signedAt,'2026-10-09T21:00:00.000Z');
  const publicView=JSON.stringify(publicTeamView(team));
  assert.ok(publicView.includes(player.name));
  assert.ok(!publicView.includes(viewer.email));
  assert.ok(!publicView.includes('Parent Guardian'));
});
test('new annual waiver requires explicit roster consent and saves owner-approved wording',()=>{
  const input={athleteId:'a',adultName:'Parent',adultPhone:'555-1234',participantType:'minor',emergencyName:'Parent',emergencyPhone:'555-1234',signerName:'Parent',relationship:'parent',consent:true};
  assert.equal(waiverInput.safeParse(input).success,false);
  assert.equal(waiverInput.safeParse({...input,rosterConsent:false}).success,false);
  assert.equal(waiverInput.safeParse({...input,rosterConsent:true}).success,true);
  assert.ok(WAIVER_TEXT.includes(ROSTER_CONSENT_TEXT));
  assert.equal(WAIVER_VERSION,'facility-2026-10-09');
  assert.ok(!WAIVER_TEXT.includes('Oklahoma Prospects'));
});
