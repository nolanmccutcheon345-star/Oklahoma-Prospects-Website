import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Search,
  Heart,
  Users,
  Flag,
  Share2,
  Copy,
  Check,
  ShieldCheck,
  ChevronRight,
  Mail,
  ExternalLink,
  RefreshCw,
  Download,
  LockKeyhole,
  Target,
  ClipboardList,
  Pencil,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/fundraising-ui/button";
import { Input } from "@/components/fundraising-ui/input";
import { Textarea } from "@/components/fundraising-ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/fundraising-ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/fundraising-ui/select";
import { Progress } from "@/components/fundraising-ui/progress";
import { Checkbox } from "@/components/fundraising-ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/fundraising-ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/fundraising-ui/table";
import { Skeleton } from "@/components/fundraising-ui/skeleton";
import { toast } from "sonner";
import {
  TEAMS,
  money,
  examplePlayer,
  type Player,
  type Contribution,
} from "@/lib/fundraising/shared";

type Mode = "home" | "my" | "office" | "player" | "example" | "thanks";
type Data = {
  players: Player[];
  contributions: Contribution[];
  user: { name: string; email: string } | null;
  admin: boolean;
  paymentReady: boolean;
};
const initial: Data = {
  players: [],
  contributions: [],
  user: null,
  admin: false,
  paymentReady: false,
};
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch(path.replace("/api/", "/api/fundraising/"), {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const b: any = await r.json();
  if (!r.ok) throw new Error(b.error || "Something went wrong. Please try again.");
  return b;
}
function checkoutId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
}
function Brand() {
  return (
    <a className="brand" href="/fundraising" aria-label="Oklahoma Prospects fundraising home">
      <span className="brand-mark">
        OP<span>★</span>
      </span>
      <span className="brand-name">
        OKLAHOMA PROSPECTS<small>PLAYER FUNDRAISING</small>
      </span>
    </a>
  );
}
function Meter({ player: p }: { player: Player }) {
  const pct = Math.min(100, Math.round((p.raised / p.goal) * 100));
  return (
    <div className="meter">
      <div className="meter-numbers">
        <span>
          <strong>{money(p.raised)}</strong> raised
        </span>
        <span>{pct}%</span>
      </div>
      <Progress aria-label={`${pct}% of fundraising goal`} value={pct} />
      <div className="meter-caption">
        <span>of {money(p.goal)} goal</span>
        <span>
          {p.sponsors} {p.sponsors === 1 ? "sponsor" : "sponsors"}
        </span>
      </div>
    </div>
  );
}
function TeamSelect({
  value,
  onChange,
  all = false,
}: {
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Team">
        <SelectValue placeholder="Choose team" />
      </SelectTrigger>
      <SelectContent>
        {all && <SelectItem value="all">All teams</SelectItem>}
        {TEAMS.map((t) => (
          <SelectItem value={t} key={t}>
            {t} Prospects
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function PlayerForm({
  player,
  onSaved,
  admin,
}: {
  player: Player | null;
  onSaved: () => void;
  admin: boolean;
}) {
  const [name, setName] = useState(player?.name || "");
  const [team, setTeam] = useState(player?.team || "13U");
  const [number, setNumber] = useState(player?.number || "");
  const [goal, setGoal] = useState(player ? String(player.goal / 100) : "1000");
  const [story, setStory] = useState(player?.story || examplePlayer.story);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(player ? "/api/players/" + player.id : "/api/players", player ? "PATCH" : "POST", {
        name,
        team,
        number,
        goal: Math.round(Number(goal) * 100),
        story,
        consent,
      });
      toast.success(admin ? "Player page saved." : "Player page saved for Prospects approval.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={save}>
      <label>
        Player display name
        <Input
          autoFocus
          placeholder="First name + last initial"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <small>Use a first name and last initial on the public page.</small>
      </label>
      <div className="form-pair">
        <label>
          Team
          <TeamSelect value={team} onChange={setTeam} />
        </label>
        <label>
          Jersey number <span className="optional">optional</span>
          <Input
            placeholder="00"
            inputMode="numeric"
            pattern="[0-9]{1,2}"
            maxLength={2}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
      </div>
      <label>
        Fundraising goal ($)
        <Input
          type="number"
          min="100"
          max="10000"
          step="1"
          required
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <small>A fundraising target; it does not set or change team dues.</small>
      </label>
      <label>
        Player’s message
        <Textarea
          rows={4}
          maxLength={1200}
          required
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
      </label>
      <label className="check-label">
        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
        <span>
          I am this player’s parent/guardian, or have their permission to publish this name, team,
          and message.
        </span>
      </label>
      {!admin && (
        <p className="small-note">
          Prospects reviews new and edited pages before they become public.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button className="full-button" disabled={busy || !consent} type="submit">
        {busy ? "Saving…" : player ? "Save player page" : "Create player page"}
        <ArrowUpRight size={16} />
      </Button>
    </form>
  );
}
function ShareDialog({ player: p, onTracked }: { player: Player; onTracked: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(location.origin + "/fundraising/p/" + p.id), [p.id]);
  const message = `Help ${p.name} make the most of their ${p.team} season with Oklahoma Prospects! Sponsor their player fundraiser here: ${url} Thank you for being in their corner!`;
  async function track() {
    try {
      await api("/api/players/" + p.id, "PATCH", { action: "share" });
      onTracked();
    } catch {
      /* Public visitors can also share; only owners' shares are tracked. */
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied. Ready to send!");
      await track();
    } catch {
      toast.error("Copy was unavailable. Select and copy the link below.");
    }
  }
  return (
    <div className="form-stack">
      <div className="share-player">
        <span className="player-initial">{p.name.charAt(0)}</span>
        <div>
          <strong>{p.name}</strong>
          <p>{p.team} Oklahoma Prospects</p>
        </div>
      </div>
      <label>
        Player’s sponsorship link
        <Input readOnly value={url} onFocus={(e) => e.target.select()} />
      </label>
      <div className="form-pair">
        <Button onClick={() => copy(url)}>
          <Copy />
          Copy link
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: `Sponsor ${p.name}`, text: message, url });
                await track();
              } catch (e) {
                if ((e as Error).name !== "AbortError")
                  toast.error("Sharing is unavailable. Copy the link instead.");
              }
            } else await copy(message);
          }}
        >
          <Share2 />
          Share
        </Button>
      </div>
      <label>
        Ready-to-send message
        <Textarea rows={5} readOnly value={message} onFocus={(e) => e.target.select()} />
      </label>
      <Button variant="outline" onClick={() => copy(message)}>
        <Copy />
        Copy message
      </Button>
      <a
        className="text-link"
        href={
          "mailto:?subject=" +
          encodeURIComponent(`Will you sponsor ${p.name}?`) +
          "&body=" +
          encodeURIComponent(message)
        }
        onClick={() => void track()}
      >
        <Mail size={17} />
        Open in email
      </a>
      <p className="small-note">
        Sharing opens your own message or email app. You choose who receives it.
      </p>
    </div>
  );
}
function Sponsor({
  player: p,
  ready,
  example,
}: {
  player: Player;
  ready: boolean;
  example: boolean;
}) {
  const [amount, setAmount] = useState("50");
  const [donor, setDonor] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [id, setId] = useState("");
  useEffect(() => setId(checkoutId()), []);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/checkout", "POST", {
        id,
        playerId: p.id,
        amount: Math.round(Number(amount) * 100),
        donor,
        email,
      });
      location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <aside className="sponsor-box">
      <div className="sponsor-title">
        <Heart size={23} />
        <h2>Be in their corner.</h2>
      </div>
      <p>Choose a sponsorship amount.</p>
      <form onSubmit={pay} className="form-stack">
        <div className="amount-grid">
          {[25, 50, 100, 250].map((a) => (
            <Button
              key={a}
              type="button"
              variant="outline"
              className={amount === String(a) ? "amount active" : "amount"}
              onClick={() => {
                setAmount(String(a));
                setId(checkoutId());
              }}
            >
              {money(a * 100)}
            </Button>
          ))}
        </div>
        <label>
          Other amount ($)
          <Input
            type="number"
            min="5"
            max="10000"
            step="0.01"
            value={amount}
            required
            onChange={(e) => {
              setAmount(e.target.value);
              setId(checkoutId());
            }}
          />
        </label>
        <label>
          Your name
          <Input
            autoComplete="name"
            placeholder="First and last name"
            maxLength={80}
            required
            value={donor}
            onChange={(e) => {
              setDonor(e.target.value);
              setId(checkoutId());
            }}
          />
        </label>
        <label>
          Email for your receipt
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            maxLength={150}
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setId(checkoutId());
            }}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="full-button" disabled={busy || !ready || example}>
          {busy
            ? "Opening Square…"
            : example
              ? "Example — no payments"
              : ready
                ? `Sponsor ${money(Math.round(Number(amount || 0) * 100))}`
                : "Sponsorships opening soon"}
          {ready && !example && <ArrowUpRight size={18} />}
        </Button>
        {!ready && !example && (
          <p className="small-note">
            Prospects is finishing payment setup. Please check back before sending a sponsorship.
          </p>
        )}
        <div className="payment-note">
          <ShieldCheck size={21} />
          <p>
            Payments go to Oklahoma Prospects through Square. Your sponsorship is credited to{" "}
            {p.name} after payment is confirmed.
          </p>
        </div>
        <p className="fine-print">
          No donor details are shown publicly. For sponsorship or refund questions, contact the
          Prospects front office through{" "}
          <a href="https://prospectsbaseball.club" target="_blank" rel="noreferrer">
            prospectsbaseball.club
          </a>
          .
        </p>
      </form>
    </aside>
  );
}

export default function FundraisingApp({ mode, playerId }: { mode: Mode; playerId?: string }) {
  const [data, setData] = useState<Data>(initial);
  const [player, setPlayer] = useState<Player | null>(mode === "example" ? examplePlayer : null);
  const [loading, setLoading] = useState(mode !== "example");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<Player | null>(null);
  const [share, setShare] = useState<Player | null>(null);
  const [tab, setTab] = useState("players");
  const [receipt, setReceipt] = useState<any>(null);
  const [reconciling, setReconciling] = useState(false);
  const detail = mode === "player" || mode === "example";
  const managed = mode === "my" || mode === "office";
  const office = mode === "office";
  const load = useCallback(async () => {
    setError("");
    try {
      if (mode === "example") return;
      if (mode === "thanks") {
        const id = new URLSearchParams(location.search).get("id");
        if (!id) throw new Error("No sponsorship reference was found.");
        setReceipt(await api("/api/receipt", "POST", { id }));
      } else if (mode === "player") {
        const d = await api("/api/players/" + playerId);
        setPlayer(d.player);
        setData((v) => ({ ...v, paymentReady: d.paymentReady }));
      } else setData(await api("/api/dashboard?scope=" + mode));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, playerId]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = data.players.filter(
    (p) =>
      (team === "all" || p.team === team) && p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const total = data.players.reduce((s, p) => s + p.raised, 0);
  const sponsors = data.players.reduce((s, p) => s + p.sponsors, 0);
  const goals = data.players.reduce((s, p) => s + p.goal, 0);
  const activeTeams = new Set(data.players.map((p) => p.team)).size;
  async function action(p: Player, action: string) {
    try {
      await api("/api/players/" + p.id, "PATCH", { action });
      toast.success(
        action === "approve"
          ? "Player page approved."
          : action === "pause"
            ? "Player page paused."
            : "Player page reopened.",
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const newPlayer = () => {
    if (!data.user) {
      location.assign("/login?next=%2Ffundraising%2Fmy");
      return;
    }
    setEdit(null);
    setFormOpen(true);
  };
  return (
    <div className="fundraising-app app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a className={mode === "home" ? "nav-link selected" : "nav-link"} href="/fundraising">
              Sponsor a player
            </a>
            <a className={mode === "my" ? "nav-link selected" : "nav-link"} href="/fundraising/my">
              My fundraising
            </a>
            <a
              className={office ? "office-link selected" : "office-link"}
              href="/fundraising/office"
            >
              <ClipboardList size={16} />
              <span>Front office</span>
            </a>
          </nav>
        </div>
      </header>
      <main id="main">
        {loading ? (
          <div className="loading-state" aria-label="Loading fundraising records">
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="error-state">
            <Flag size={36} />
            <h1>
              {office
                ? "Front office access"
                : detail
                  ? "Player page unavailable"
                  : "Let’s try that again."}
            </h1>
            <p role="alert">{error}</p>
            <div className="inline-actions">
              <Button
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <RefreshCw />
                Try again
              </Button>
              <Button asChild variant="outline">
                <a href="/fundraising">Fundraising home</a>
              </Button>
              {managed && (
                <a
                  className="text-link"
                  target="_top"
                  href={
                    office
                      ? "/login?next=%2Ffundraising%2Foffice"
                      : "/login?next=%2Ffundraising%2Fmy"
                  }
                >
                  Sign in to Prospects
                </a>
              )}
            </div>
          </div>
        ) : mode === "thanks" ? (
          <section className="thank-you">
            <div className="thank-icon">
              {receipt?.status === "completed" ? <Check size={36} /> : <RefreshCw size={34} />}
            </div>
            <span className="eyebrow">OKLAHOMA PROSPECTS</span>
            <h1>
              {receipt?.status === "completed"
                ? "You’re part of their season."
                : "Checking your sponsorship."}
            </h1>
            <p>
              {receipt?.status === "completed"
                ? `${money(receipt.amount - receipt.refunded)} has been confirmed for this player’s fundraiser. Thank you for supporting Oklahoma Prospects.`
                : receipt?.status === "failed"
                  ? "Square did not complete this payment. No sponsorship has been credited."
                  : "We’re waiting for Square to confirm the payment. Your player’s total will update once it is confirmed."}
            </p>
            <div className="inline-actions">
              {receipt?.status !== "completed" && (
                <Button onClick={() => void load()}>Check payment status</Button>
              )}
              {receipt?.receipt_url && (
                <Button asChild>
                  <a href={receipt.receipt_url} target="_blank" rel="noreferrer">
                    View Square receipt
                    <ExternalLink />
                  </a>
                </Button>
              )}
              {receipt?.player_id && (
                <Button asChild variant="outline">
                  <a href={"/fundraising/p/" + receipt.player_id}>Back to player</a>
                </Button>
              )}
            </div>
          </section>
        ) : detail && player ? (
          <>
            <a href="/fundraising" className="back-link">
              <ArrowLeft size={17} />
              All player fundraisers
            </a>
            {mode === "example" && (
              <div className="example-notice">
                <span>PLAYER PAGE PREVIEW</span>This is an example. No real player or payments are
                shown.
              </div>
            )}
            <div className="player-layout">
              <section>
                <div className="player-hero">
                  <div className="player-meta">
                    <span>{player.team} OKLAHOMA PROSPECTS</span>
                    <span>PLAYER FUNDRAISER</span>
                  </div>
                  <div className="player-identity">
                    <div>
                      <span className="eyebrow">IN THEIR CORNER</span>
                      <h1>
                        {player.name}
                        <span>
                          One season.
                          <br />
                          So much possibility.
                        </span>
                      </h1>
                    </div>
                    <div className="jersey-number">
                      {player.number || "OP"}
                      <small>PROSPECTS</small>
                    </div>
                  </div>
                  <div className="hero-footer">
                    GRIT <span>•</span> HEART <span>•</span> PRIDE
                  </div>
                </div>
                <div className="player-progress">
                  <Meter player={player} />
                </div>
                <article className="player-message">
                  <span className="eyebrow">A NOTE FROM YOUR PLAYER</span>
                  <h2>Thanks for believing in me.</h2>
                  <p>{player.story}</p>
                </article>
                <div className="support-note">
                  <ShieldCheck />
                  <div>
                    <strong>One player. One link. A season of support.</strong>
                    <p>
                      Your sponsorship is recorded for {player.name} and paid directly to Oklahoma
                      Prospects.
                    </p>
                  </div>
                </div>
                {mode !== "example" && (
                  <Button className="share-page" variant="outline" onClick={() => setShare(player)}>
                    <Share2 />
                    Share this player’s fundraiser
                  </Button>
                )}
              </section>
              <Sponsor player={player} ready={data.paymentReady} example={mode === "example"} />
            </div>
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {office
                    ? "FRONT OFFICE"
                    : mode === "my"
                      ? "PARENT DASHBOARD"
                      : "OKLAHOMA PROSPECTS • BROKEN ARROW, OK"}
                </span>
                <h1>
                  {office ? (
                    "Every player. Every dollar."
                  ) : mode === "my" ? (
                    "Your player. Their biggest fans."
                  ) : (
                    <>
                      Back a player.<span className="headline-accent">Build their season.</span>
                    </>
                  )}
                </h1>
                <p>
                  {office
                    ? "Track sponsorships, approve player pages, and follow each team’s progress."
                    : mode === "my"
                      ? "Create their page, share their story, and watch their support grow."
                      : "Find your player. Send a little support. Make a big difference."}
                </p>
              </div>
              <Button className="heading-action" onClick={newPlayer}>
                <Plus size={18} />
                {office ? "Add player" : "Create a player page"}
              </Button>
            </div>
            <section className="scoreboard" aria-label="Fundraising totals">
              <div className="scoreboard-primary">
                <span className="stat-label">
                  {mode === "my" ? "YOUR PLAYERS HAVE RAISED" : "TOGETHER, WE’VE RAISED"}
                </span>
                <strong>{money(total)}</strong>
                <span className="stat-footnote">Confirmed sponsorships, less refunds</span>
              </div>
              <div className="score-stat">
                <Heart />
                <strong>{sponsors}</strong>
                <span>Sponsorships</span>
              </div>
              <div className="score-stat">
                <Users />
                <strong>{data.players.length}</strong>
                <span>Player fundraisers</span>
              </div>
              <div className="score-stat">
                <Flag />
                <strong>{activeTeams}</strong>
                <span>Teams represented</span>
              </div>
              <div className="scoreboard-motto">
                FOR THE LOVE
                <br />
                OF THE GAME.<span>OKLAHOMA PROSPECTS</span>
              </div>
            </section>
            {managed && !data.paymentReady && (
              <div className="setup-note">
                <LockKeyhole size={21} />
                <div>
                  <strong>Player pages are ready. Online payments are not open yet.</strong>
                  <p>Prospects needs to connect and verify Square before sponsors can pay.</p>
                </div>
                {office && <span className="status-pill">SETUP NEEDED</span>}
              </div>
            )}
            <div className="workspace-grid">
              <section className="workspace-main">
                <Tabs value={tab} onValueChange={setTab}>
                  <div className="section-top">
                    <TabsList>
                      <TabsTrigger value="players">
                        {mode === "my" ? "My players" : "Player fundraisers"}
                        <span className="count">{data.players.length}</span>
                      </TabsTrigger>
                      {managed && <TabsTrigger value="activity">Sponsorships</TabsTrigger>}
                      {office && <TabsTrigger value="teams">Teams</TabsTrigger>}
                    </TabsList>
                    <Button
                      aria-label="Refresh fundraising records"
                      title="Refresh"
                      size="icon"
                      variant="ghost"
                      onClick={() => void load()}
                    >
                      <RefreshCw size={17} />
                    </Button>
                  </div>
                  <TabsContent value="players">
                    <div className="filter-bar">
                      <div className="search-input">
                        <Search size={18} />
                        <Input
                          placeholder="Find a player…"
                          aria-label="Find a player"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <TeamSelect value={team} onChange={setTeam} all />
                    </div>
                    {filtered.length ? (
                      <div className="player-grid">
                        {filtered.map((p) => (
                          <article className="player-card" key={p.id}>
                            <div className="card-top">
                              <span className="player-initial">{p.number || p.name.charAt(0)}</span>
                              <span className="team-tag">{p.team} PROSPECTS</span>
                            </div>
                            <h3>{p.name}</h3>
                            {managed && (
                              <span className={"page-status " + (!p.approved ? "pending" : "")}>
                                {!p.approved
                                  ? "Awaiting approval"
                                  : p.active
                                    ? "Page active"
                                    : "Page paused"}
                              </span>
                            )}
                            <Meter player={p} />
                            <div className="card-actions">
                              {p.approved && p.active ? (
                                <Button asChild variant={managed ? "outline" : "default"}>
                                  <a href={"/fundraising/p/" + p.id}>
                                    {managed ? "View page" : "Sponsor player"}
                                    <ArrowUpRight />
                                  </a>
                                </Button>
                              ) : (
                                <span className="small-note">Not public yet</span>
                              )}
                              {managed && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    title="Share player page"
                                    aria-label={"Share " + p.name}
                                    disabled={!p.approved || !p.active}
                                    onClick={() => setShare(p)}
                                  >
                                    <Share2 />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Edit player"
                                    aria-label={"Edit " + p.name}
                                    onClick={() => {
                                      setEdit(p);
                                      setFormOpen(true);
                                    }}
                                  >
                                    <Pencil />
                                  </Button>
                                </>
                              )}
                            </div>
                            {managed && (
                              <div className="card-admin">
                                <span>{p.shares || 0} shares started</span>
                                {office &&
                                  (!p.approved ? (
                                    <Button size="sm" onClick={() => void action(p, "approve")}>
                                      <Check />
                                      Approve
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => void action(p, p.active ? "pause" : "resume")}
                                    >
                                      {p.active ? <Pause /> : <Play />}
                                      {p.active ? "Pause" : "Resume"}
                                    </Button>
                                  ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-players">
                        <span className="empty-icon">
                          <Users size={30} />
                        </span>
                        <span className="eyebrow">
                          {query || team !== "all"
                            ? "NO MATCHING PLAYERS"
                            : "THE SEASON STARTS WITH ONE PLAYER"}
                        </span>
                        <h2>
                          {query || team !== "all"
                            ? "Let’s find your player."
                            : managed
                              ? "Your first fundraiser starts here."
                              : "Their biggest fans are already out there."}
                        </h2>
                        <p>
                          {query || team !== "all"
                            ? "Try a different name or choose another team."
                            : "Create a personal player page, then share it with the friends and family who always show up."}
                        </p>
                        <div className="inline-actions">
                          {query || team !== "all" ? (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setQuery("");
                                setTeam("all");
                              }}
                            >
                              Clear filters
                            </Button>
                          ) : (
                            <>
                              <Button onClick={newPlayer}>
                                <Plus />
                                Create a player page
                              </Button>
                              <a className="text-link" href="/fundraising/example">
                                Preview a player page
                                <ArrowUpRight size={16} />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  {managed && (
                    <TabsContent value="activity">
                      <div className="activity-heading">
                        <p>Only confirmed payments count toward totals.</p>
                        {office && (
                          <div className="inline-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!data.paymentReady || reconciling}
                              onClick={async () => {
                                setReconciling(true);
                                try {
                                  const r = await api("/api/reconcile", "POST", {});
                                  toast.success(
                                    `Checked ${r.checked} payments.${r.errors ? " Some could not be checked." : ""}`,
                                  );
                                  await load();
                                } catch (e) {
                                  toast.error((e as Error).message);
                                } finally {
                                  setReconciling(false);
                                }
                              }}
                            >
                              <RefreshCw />
                              {reconciling ? "Checking…" : "Check Square"}
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <a href="/api/fundraising/export">
                                <Download />
                                Export CSV
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                      {data.contributions.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sponsor / player</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.contributions.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell>
                                  <strong>{c.donor}</strong>
                                  <small className="table-secondary">
                                    {c.player_name} · {c.team}
                                  </small>
                                </TableCell>
                                <TableCell>
                                  {money(c.amount - c.refunded)}
                                  {c.refunded > 0 && (
                                    <small className="table-secondary">
                                      {money(c.refunded)} refunded
                                    </small>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className={"payment-status " + c.status}>
                                    {c.refunded === c.amount
                                      ? "Refunded"
                                      : c.status === "completed"
                                        ? "Confirmed"
                                        : c.status === "pending"
                                          ? "Not confirmed"
                                          : "Failed"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {new Date(c.created).toLocaleDateString("en-US", {
                                    timeZone: "America/Chicago",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="simple-empty">
                          <Heart size={30} />
                          <h3>Their first sponsor is on the way.</h3>
                          <p>Confirmed sponsorships will appear here after checkout.</p>
                        </div>
                      )}
                    </TabsContent>
                  )}
                  {office && (
                    <TabsContent value="teams">
                      <div className="team-totals">
                        {TEAMS.map((t) => {
                          const ps = data.players.filter((p) => p.team === t);
                          const raised = ps.reduce((s, p) => s + p.raised, 0);
                          const goal = ps.reduce((s, p) => s + p.goal, 0);
                          return (
                            <div className="team-row" key={t}>
                              <span className="team-square">{t}</span>
                              <div>
                                <strong>{t} Oklahoma Prospects</strong>
                                <p>
                                  {ps.length} player{" "}
                                  {ps.length === 1 ? "fundraiser" : "fundraisers"}
                                </p>
                              </div>
                              <div className="team-amount">
                                <strong>{money(raised)}</strong>
                                <span>{goal ? `of ${money(goal)}` : "No goals yet"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </section>
              <aside className="side-column">
                <div className="playbook">
                  <span className="eyebrow">THE FUNDRAISING PLAYBOOK</span>
                  <h2>
                    A little support.
                    <br />A big season.
                  </h2>
                  <ol>
                    <li>
                      <span>01</span>
                      <div>
                        <strong>Make it personal.</strong>
                        <p>Add your player, their goal, and a message from the heart.</p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <strong>Rally their people.</strong>
                        <p>Send the player’s link to friends, family, and your biggest fans.</p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <strong>Follow every dollar.</strong>
                        <p>Confirmed sponsorships go to Prospects and count for that player.</p>
                      </div>
                    </li>
                  </ol>
                  <a href="/fundraising/example" className="text-link">
                    See a player page
                    <ChevronRight size={16} />
                  </a>
                </div>
                <div className="trust-card">
                  <ShieldCheck size={24} />
                  <div>
                    <strong>Support goes to Prospects.</strong>
                    <p>
                      Parents share the link. Oklahoma Prospects receives the payment and tracks
                      each player’s progress.
                    </p>
                  </div>
                </div>
                {managed && (
                  <div className="goal-summary">
                    <Target size={20} />
                    <span>
                      Combined player goals<strong>{money(goals)}</strong>
                    </span>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
      <footer>
        <Brand />
        <p>Grit. Heart. Pride.</p>
        <a href="https://prospectsbaseball.club" target="_blank" rel="noreferrer">
          prospectsbaseball.club
          <ArrowUpRight size={14} />
        </a>
      </footer>
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="fundraising-app player-dialog">
          <DialogHeader>
            <DialogTitle>{edit ? "Edit player page" : "Every player has a story."}</DialogTitle>
            <DialogDescription>
              {edit
                ? "Update the player’s details and fundraising goal."
                : "Create a fundraiser their friends and family can get behind."}
            </DialogDescription>
          </DialogHeader>
          <PlayerForm
            key={edit?.id || "new"}
            player={edit}
            admin={data.admin}
            onSaved={() => {
              setFormOpen(false);
              void load();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={!!share} onOpenChange={(v) => !v && setShare(null)}>
        <DialogContent className="fundraising-app player-dialog">
          <DialogHeader>
            <DialogTitle>Rally their biggest fans.</DialogTitle>
            <DialogDescription>Send this player’s personal sponsorship page.</DialogDescription>
          </DialogHeader>
          {share && <ShareDialog player={share} onTracked={() => void load()} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
