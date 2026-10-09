import { useState } from 'react';
import { ROSTER_CONSENT_TEXT, ROSTER_CONSENT_VERSION } from '@/lib/roster-consent';
import { saveTeamRosterConsent } from '@/lib/teams/store';
import type { Player } from '@/lib/teams/types';
import { Button } from '@/components/ui/button';

export function TeamRosterConsentForm({teamId,player,baseRev,onSaved}:{teamId:string;player:Player;baseRev:number;onSaved:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <section className="mt-4 grid gap-3" aria-label="Team agreement public roster consent">
    <h3 className="text-xl">Team agreement: public roster consent</h3>
    <p>{ROSTER_CONSENT_TEXT}</p>
    {player.rosterConsent?.version===ROSTER_CONSENT_VERSION ? <p role="status">Agreed by {player.rosterConsent.signedBy} on {new Date(player.rosterConsent.signedAt).toLocaleDateString('en-US',{timeZone:'America/Chicago'})}.</p> :
      <form className="grid gap-3" onSubmit={async e=>{
        e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);
        setBusy(true);setError('');
        try {if(f.get('consent')!=='on')throw new Error('Please agree before signing.');
          await saveTeamRosterConsent({data:{teamId,playerId:player.id,baseRev,signerName:String(f.get('signerName')||''),consent:true}});onSaved();
        } catch(e){setError(e instanceof Error?e.message:'Consent did not save.');}finally{setBusy(false);}
      }}>
        <label>Parent or legal guardian’s full legal name<input name="signerName" required maxLength={120}/></label>
        <label className="flex items-start gap-3"><input name="consent" type="checkbox" required/>I am this player’s parent or legal guardian. I have read and agree to the public roster consent above.</label>
        <Button disabled={busy} type="submit">{busy?'Saving…':'Sign public roster consent'}</Button>
      </form>}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
