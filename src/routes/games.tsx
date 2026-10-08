import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB } from "@/lib/club";
import { pageHead } from "@/lib/seo";
import { getPublicGames, getAdminGames, saveGame } from "@/lib/games-api";
import { videoEmbedUrl, type GameEventInput, type PublicGameEvent } from "@/lib/games-contracts";
import { gamesCalendarEvent } from "@/lib/games-calendar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CirclePlay, Clapperboard, Radio, ShieldCheck, Trophy, Users } from "lucide-react";

type GamesView = "watch" | "schedule" | "scores" | "replays" | "teams";
const VIEWS: {id:GamesView;label:string}[] = [
 {id:"watch",label:"Watch"},
 {id:"schedule",label:"Schedule"},
 {id:"scores",label:"Scores"},
 {id:"replays",label:"Replays"},
 {id:"teams",label:"Teams"},
];
// Do not inject ?view=watch into a clean /games URL; this caused a 307 redirect.
const validView = (value:unknown):GamesView|undefined => VIEWS.find(v=>v.id===value)?.id;
const description = "Prospects baseball and softball game schedules, live scores, results and approved live or replay video. All games appear here only after staff publication.";

export const Route = createFileRoute("/games")({
 head: () => pageHead("/games", "Games · Schedules, scores & video", description, false),
 validateSearch: (s:Record<string,unknown>) => ({
  view:validView(s.view),
  game:typeof s.game==="string" && /^[0-9a-f-]{36}$/.test(s.game) ? s.game : undefined,
 }),
 loader: async () => {
  try {
   return {games:await getPublicGames(),loaded:true};
  } catch(error) {
   // Keep the site accessible without claiming a failed feed contains no games.
   // Never log customer details or raw database/connection error messages.
   console.error("[games] Public feed unavailable", error instanceof Error ? error.name : "unknown");
   return {games:[] as PublicGameEvent[],loaded:false};
  }
 },
 component: GamesPage,
});

function GameStatus({game}:{game:PublicGameEvent}){
 const live=game.status==="live";
 return <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",live?"border-maroon bg-maroon text-fg-inverse":"border-line bg-paper-2 text-muted")}>
  {live?<><Radio className="mr-1 size-3" aria-hidden="true"/> Live score</>:game.status}
 </span>;
}
function GameCard({game}:{game:PublicGameEvent}){
 return <article className="rounded-2xl bg-paper p-5 shadow-border">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <p className="text-xs font-bold tracking-[0.12em] text-maroon uppercase">{game.sport} · {game.ageGroup||"Prospects"}</p>
   <GameStatus game={game}/>
  </div>
  <h3 className="mt-3 font-display text-2xl font-bold uppercase">{game.teamName} <span className="text-muted">vs</span> {game.opponent}</h3>
  {game.status==="live" || game.status==="final" ? <p className="mt-2 text-3xl font-extrabold tabular-nums" aria-label={`${game.teamName} ${game.ourRuns}, ${game.opponent} ${game.oppRuns}`}>
    {game.ourRuns} <span className="text-muted">–</span> {game.oppRuns}
    {game.inning?<span className="ml-3 align-middle text-sm font-medium text-muted">{game.inning}</span>:null}
  </p>:null}
  <p className="mt-3 text-sm text-muted"><CalendarDays className="mr-1 inline size-4" aria-hidden="true"/> {game.date} · {game.startTime} CT{game.venue?` · ${game.venue}`:""}</p>
  <div className="mt-4 flex flex-wrap gap-2">
    <Button asChild size="sm" variant="outlineDark">
      <Link to="/games" search={{view:game.videoId?"watch":"schedule",game:game.id}}>Game details</Link>
    </Button>
    {game.videoId ? <Button asChild size="sm" variant="maroon"><Link to="/games" search={{view:"watch",game:game.id}}>{game.videoKind==="live"?"Watch stream":"Watch video"}</Link></Button> : null}
    <a className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm font-semibold underline"
      href={"data:text/calendar;charset=utf-8,"+encodeURIComponent(gamesCalendarEvent(game))}
      download={"prospects-game-"+game.id+".ics"}>Add to calendar</a>
  </div>
 </article>;
}
function VideoPlayer({game}:{game:PublicGameEvent}){
 const [start,setStart]=useState(false);
 useEffect(()=>setStart(false),[game.id,game.videoId]);
 if(!game.videoId || game.videoKind==="none")return <p className="rounded-xl bg-paper-2 p-5 text-muted">No approved video has been published for this game. Scores and schedules remain available here.</p>;
 return <div className="overflow-hidden rounded-2xl bg-ink text-fg-inverse">
  {!start?<div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
    <CirclePlay className="size-12 text-powder" aria-hidden="true"/>
    <h3 className="text-xl font-bold">{game.videoKind==="live"?"Watch live coverage":game.videoKind==="highlight"?"Watch highlights":"Watch game replay"}</h3>
    <p className="max-w-md text-sm text-fg-soft">Video is provided by YouTube. Playback loads only after you choose to watch.</p>
    <Button variant="maroon" onClick={()=>setStart(true)}>Load video</Button>
  </div>:<div className="aspect-video"><iframe
   src={videoEmbedUrl(game.videoId)}
   title={`${game.teamName} vs ${game.opponent} · ${game.videoKind}`}
   allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
   allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
   className="h-full w-full border-0"
  /></div>}
 </div>;
}

function GamesPage(){
 const initial=Route.useLoaderData();
 const {view:requestedView,game:gameId}=Route.useSearch();
 const view:GamesView=requestedView??"watch";
 const [games,setGames]=useState<PublicGameEvent[]>(initial.games);
 const [hasLoaded,setHasLoaded]=useState(initial.loaded);
 const [loadError,setLoadError]=useState(!initial.loaded);
 useEffect(()=>{
  let alive=true;
  // Read-only scoreboard refresh; no cameras, accounts or payment requests.
  const update=()=>void getPublicGames().then(rows=>{if(alive){setGames(rows);setHasLoaded(true);setLoadError(false);}}).catch(()=>{if(alive)setLoadError(true);});
  const timer=setInterval(update,30000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 const active=games.find(g=>g.id===gameId);
 const selected=view==="watch" ? games.filter(g=>g.status==="live" || (g.videoId && g.videoKind==="live"))
  :view==="schedule" ? games.filter(g=>g.status==="scheduled"||g.status==="live")
  :view==="scores" ? games.filter(g=>g.status==="final" || g.status==="live")
  :view==="replays" ? games.filter(g=>g.videoId && (g.videoKind==="replay"||g.videoKind==="highlight"))
  :games;
 const teams=[...new Map(games.map(g=>[`${g.sport}:${g.teamName}`,{sport:g.sport,name:g.teamName,age:g.ageGroup}])).values()];
 return <main id="main">
  <PageHero eyebrow={CLUB.name} title="Games" accent="All in one place." image="/brand/team.jpg"
    copy="Game schedules, live scores, final results and approved video for our baseball and softball teams."/>
  <section className="mx-auto max-w-3xl px-5 py-8">
    <nav aria-label="Games views" className="grid grid-cols-5 gap-1 rounded-xl bg-paper-2 p-1 sm:gap-2">
     {VIEWS.map(item=><Link key={item.id} to="/games" search={{view:item.id,game:undefined}}
      aria-current={!gameId&&view===item.id?"page":undefined}
      className={cn("flex min-h-12 items-center justify-center rounded-lg px-1 text-center text-[0.68rem] font-semibold no-underline sm:text-sm",!gameId&&view===item.id?"bg-maroon text-fg-inverse":"text-ink hover:bg-paper")}>
      {item.label}</Link>)}
    </nav>
    {loadError && hasLoaded?<p role="status" className="mt-4 rounded-lg border border-line p-3 text-sm">Scores could not refresh. The latest loaded information remains on screen.</p>:null}
    {active ? <div className="mt-7 space-y-5">
      <Link to="/games" search={{view,game:undefined}} className="inline-flex min-h-11 items-center font-semibold underline">← All games</Link>
      <GameCard game={active}/>
      <VideoPlayer game={active}/>
      <p className="text-sm text-muted">Times are Central Time. Scores are entered by Prospects staff and may update during play. The game feed refreshes approximately every 30 seconds.</p>
     </div>:
     <div className="mt-7">
      <div className="flex items-center gap-2">
        {view==="watch"?<Radio className="size-5 text-maroon"/>:view==="schedule"?<CalendarDays className="size-5 text-maroon"/>:view==="scores"?<Trophy className="size-5 text-maroon"/>:view==="replays"?<Clapperboard className="size-5 text-maroon"/>:<Users className="size-5 text-maroon"/>}
        <h2 className="text-3xl">{VIEWS.find(v=>v.id===view)?.label}</h2>
      </div>
      {!hasLoaded && games.length===0 ? <GamesUnavailable/> : view==="teams" ? teams.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{teams.map(t=><div key={t.sport+":"+t.name} className="rounded-xl bg-paper-2 p-5 shadow-border">
       <p className="text-xs font-bold text-maroon uppercase">{t.sport} · {t.age||"Prospects"}</p>
       <h3 className="mt-2 font-display text-2xl">{t.name}</h3>
       <p className="mt-2 text-sm text-muted">Team shown because a published game is available.</p>
      </div>)}</div> : <EmptyGames/> :
       selected.length ? <div className="mt-5 grid gap-4">{selected.map(g=><GameCard key={g.id} game={g}/>)}</div> : <EmptyGames/>}
     </div>}
  </section>
  <section className="bg-paper-2 px-5 py-8"><div className="mx-auto max-w-3xl">
   <h2 className="text-2xl">Our game-day hub</h2>
   <p className="mt-2 text-sm text-muted">This Games experience is part of Prospects Sports Academy. It builds on Coach Steve's Prospects Live concept. Games, videos and teams appear only after verified staff publication.</p>
   <p className="mt-3 text-sm text-muted">Looking for tryouts? <Link to="/tryouts" className="font-semibold underline">Register for baseball or softball</Link>.</p>
  </div></section>
  <GamesStudio/>
 </main>;
}
function GamesUnavailable(){
 return <div className="mt-5 rounded-2xl border border-line bg-paper-2 p-7" role="status">
  <h3 className="text-xl font-bold">Games are temporarily unavailable.</h3>
  <p className="mt-2 text-muted">Schedules, scores and approved videos could not load. Please check back shortly. No unverified game information is being shown.</p>
 </div>;
}
function EmptyGames(){
 return <div className="mt-5 rounded-2xl border border-line bg-paper-2 p-7">
  <h3 className="text-xl font-bold">Nothing published here yet.</h3>
  <p className="mt-2 text-muted">Check back when Prospects staff posts confirmed games, scores or approved video. No sample games or unverified streaming links are shown.</p>
 </div>;
}
function initialGame():GameEventInput{
 return {id:"",revision:0,sport:"Baseball",ageGroup:"",teamName:"",opponent:"",date:"",startTime:"",venue:"",
  status:"draft",ourRuns:0,oppRuns:0,inning:"",videoId:"",videoKind:"none",mediaApproved:false,published:false};
}
const formClass="min-h-11 w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink";
function GamesStudio(){
 const {user}=useCurrentUserState();
 const [allowed,setAllowed]=useState(false);
 const [games,setGames]=useState<GameEventInput[]>([]);
 const [editing,setEditing]=useState<GameEventInput>(initialGame());
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let alive=true;
  setAllowed(false);setGames([]);
  if(!user)return;
  void getAdminGames().then(rows=>{if(alive){setAllowed(true);setGames(rows);}}).catch(()=>{if(alive)setAllowed(false);});
  return()=>{alive=false;};
 },[user?.id]);
 if(!allowed)return null;
 const update=<K extends keyof GameEventInput>(key:K,value:GameEventInput[K])=>setEditing(e=>({...e,[key]:value}));
 const save=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMessage("");
  try{
    const result=await saveGame({data:editing});
    const rows=await getAdminGames();
    setGames(rows);setEditing(rows.find(g=>g.id===result.id)??initialGame());
    setMessage("Saved. Public games update after publication is approved.");
  }catch(error){setMessage(error instanceof Error?error.message:"Could not save game.");}
  finally{setBusy(false);}
 };
 return <section className="border-t-4 border-maroon bg-ink px-5 py-10 text-fg-inverse">
  <div className="mx-auto max-w-3xl">
   <p className="text-xs font-bold tracking-widest text-powder uppercase"><ShieldCheck className="mr-2 inline size-4"/> Authorized owner tools</p>
   <h2 className="mt-2 text-3xl">Games publishing desk</h2>
   <p className="mt-2 text-sm text-fg-soft">Add verified games, update scores, publish approved videos. No athlete names, photos or lineup uploads are accepted here. Changes are audited.</p>
   <div className="mt-4 flex flex-wrap gap-2">
    <Button onClick={()=>{setEditing(initialGame());setMessage("");}} variant="outline">New game</Button>
    {games.slice(0,20).map(g=><Button key={g.id} variant="outline" onClick={()=>{setEditing(g);setMessage("");}}>{g.teamName} · {g.date}{g.published?" ✓":""}</Button>)}
   </div>
   <form onSubmit={save} className="mt-5 grid gap-4 rounded-xl bg-paper p-5 text-ink sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-semibold">Sport<select className={formClass} value={editing.sport} onChange={e=>update("sport",e.target.value as GameEventInput["sport"])}><option>Baseball</option><option>Softball</option></select></label>
    <label className="grid gap-1 text-sm font-semibold">Age group<input className={formClass} value={editing.ageGroup} maxLength={32} onChange={e=>update("ageGroup",e.target.value)} placeholder="14U"/></label>
    <label className="grid gap-1 text-sm font-semibold">Our team<input required minLength={2} maxLength={100} className={formClass} value={editing.teamName} onChange={e=>update("teamName",e.target.value)} placeholder="Prospects 14U"/></label>
    <label className="grid gap-1 text-sm font-semibold">Opponent<input required minLength={2} maxLength={100} className={formClass} value={editing.opponent} onChange={e=>update("opponent",e.target.value)} placeholder="Opponent"/></label>
    <label className="grid gap-1 text-sm font-semibold">Date<input type="date" required className={formClass} value={editing.date} onChange={e=>update("date",e.target.value)}/></label>
    <label className="grid gap-1 text-sm font-semibold">Start time (Central)<input type="time" required className={formClass} value={editing.startTime} onChange={e=>update("startTime",e.target.value)}/></label>
    <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Venue<input className={formClass} value={editing.venue} maxLength={240} onChange={e=>update("venue",e.target.value)}/></label>
    <label className="grid gap-1 text-sm font-semibold">Game status<select className={formClass} value={editing.status} onChange={e=>update("status",e.target.value as GameEventInput["status"])}>{["draft","scheduled","live","final","cancelled"].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold">Inning / score note<input className={formClass} maxLength={60} value={editing.inning} onChange={e=>update("inning",e.target.value)} placeholder="Top 5"/></label>
    <label className="grid gap-1 text-sm font-semibold">Prospects runs<input className={formClass} type="number" min={0} max={999} value={editing.ourRuns} onChange={e=>update("ourRuns",Number(e.target.value))}/></label>
    <label className="grid gap-1 text-sm font-semibold">Opponent runs<input className={formClass} type="number" min={0} max={999} value={editing.oppRuns} onChange={e=>update("oppRuns",Number(e.target.value))}/></label>
    <label className="grid gap-1 text-sm font-semibold">YouTube video ID (optional)<input className={formClass} pattern="[A-Za-z0-9_-]{11}" maxLength={11} value={editing.videoId} onChange={e=>{const videoId=e.target.value.trim();setEditing(g=>({...g,videoId,videoKind:videoId ? g.videoKind==="none"?"replay":g.videoKind:"none",mediaApproved:false}));}} placeholder="11-character ID"/></label>
    <label className="grid gap-1 text-sm font-semibold">Video type<select className={formClass} value={editing.videoKind} disabled={!editing.videoId} onChange={e=>update("videoKind",e.target.value as GameEventInput["videoKind"])}>{["none","live","replay","highlight"].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={editing.mediaApproved} disabled={!editing.videoId} onChange={e=>update("mediaApproved",e.target.checked)}/><span>I confirm rights, guardian/participant permissions and approval for this specific video to appear publicly.</span></label>
    <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={editing.published} onChange={e=>update("published",e.target.checked)}/><span>Publish this game for families (do not publish drafts, unverified scores or unapproved minors' media).</span></label>
    {message?<p className="text-sm sm:col-span-2" role="status">{message}</p>:null}
    <Button disabled={busy||!editing.teamName.trim()||!editing.opponent.trim()||!editing.date||!editing.startTime} className="sm:col-span-2" type="submit">{busy?"Saving…":editing.revision?"Save game changes":"Create game"}</Button>
   </form>
  </div>
 </section>;
}
