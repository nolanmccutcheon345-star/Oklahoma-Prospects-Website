import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import type { OsTeam } from "@/lib/teams/model";
import {
  PHOTO_SLOTS,
  PO_FLOW,
  PO_STATUS_LABEL,
  REORDER_REASONS,
  approvedPackages,
  incompleteSizeSheets,
  photosFor,
  sizeFieldsOf,
  sizeSheetComplete,
} from "@/lib/teams/uniforms";
import { cn } from "@/lib/utils";

function downloadCsv(name: string, body: string) {
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function UniformBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const pkg = os.state.uniforms.find((u) => u.id === team.uniformPackageId);
  const packages = approvedPackages(os.state.uniforms, team.sport);
  const allPacks = os.canSeeTeamMoney ? os.state.uniforms.filter((u) => u.sport === team.sport) : packages;
  const outstanding = incompleteSizeSheets(team, pkg);
  const submitted = team.roster.filter((p) => !p.withdrawn && sizeSheetComplete(p, pkg));
  const slots = PHOTO_SLOTS as string[];
  const pos = (os.state.purchaseOrders || []).filter((p) => p.teamId === team.id);
  const canPick = os.role === "coach" || os.role === "admin";
  const showMoney = os.role === "admin" && os.canSeeTeamMoney;
  const [photoPkg, setPhotoPkg] = useState(team.uniformPackageId);
  const photos = photosFor(os.state.uniformPhotos, photoPkg || team.uniformPackageId);
  const [supplier, setSupplier] = useState("EvoShield Team Store");
  const [delivery, setDelivery] = useState("2026-10-20");
  const [deadline, setDeadline] = useState(team.uniformDeadline || "2026-10-01");
  const [warn, setWarn] = useState<string[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reorderWhy, setReorderWhy] = useState<(typeof REORDER_REASONS)[number]["id"]>("lost");
  const [billTo, setBillTo] = useState<"family" | "club">("family");
  const [reorderWho, setReorderWho] = useState<string>("");

  const swatches = pkg?.colors || [];
  const photoPacks = showMoney ? os.state.uniforms.filter((u) => u.sport === team.sport) : packages;

  const nextOf = useMemo(
    () => (status: (typeof PO_FLOW)[number]) => {
      const i = PO_FLOW.indexOf(status);
      if (i < 0 || i >= PO_FLOW.length - 1) return null;
      return PO_FLOW[i + 1];
    },
    [],
  );

  const openPo = (force = false, kind: "season" | "reorder" = "season") => {
    const result = os.createPo({
      teamId: team.id,
      supplier,
      expectedDelivery: delivery,
      kind,
      reorderReason: kind === "reorder" ? reorderWhy : null,
      billTo: kind === "reorder" ? billTo : "club",
      playerIds: kind === "reorder" && reorderWho ? [reorderWho] : undefined,
      force,
    });
    if (result.warn && result.missing) {
      setWarn(result.missing);
      setFlash(null);
    } else if (result.ok) {
      setWarn(null);
      setFlash(
        kind === "reorder"
          ? `Reorder opened. Billed to the ${billTo}. The team was notified.`
          : "Purchase order opened as a draft. The team was notified.",
      );
    }
  };

  const kids = os.myPlayers.filter((p) => p.teamId === team.id);

  return (
    <div className="teams-stack" data-teams-uniforms="true">
      {flash ? (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm" data-teams-uniform-flash="true">
          {flash}
        </p>
      ) : null}

      <DeskCard
        eyebrow="Package"
        title={pkg?.name ?? "No package assigned"}
        copy={
          pkg
            ? pkg.blurb || "Approved brand package."
            : "Pick an approved package. Coaches never see the price."
        }
      >
        {swatches.length ? (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Package colours">
            {swatches.map((hex, i) => (
              <span
                key={`${hex}-${i}`}
                className="size-5 rounded-full shadow-border"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        ) : null}
        {showMoney && pkg ? (
          <NumRows rows={[{ label: "Package", value: formatTeamMoney(pkg.price) }]} />
        ) : null}
        {pkg?.items?.length ? (
          <p className="mt-2 text-sm text-teams-muted">{pkg.items.join(" · ")}</p>
        ) : null}
        {team.uniformDeadline ? (
          <p className="mt-2 text-sm">Size deadline {team.uniformDeadline}</p>
        ) : null}
        {canPick ? (
          <div className="mt-4 grid gap-2">
            {allPacks.map((item) => (
              <button
                key={item.id}
                type="button"
                data-teams-pick-package={item.id}
                onClick={() => {
                  os.pickPackage(team.id, item.id);
                  setPhotoPkg(item.id);
                  setFlash(`${item.name} is on this team.`);
                }}
                className={cn(
                  "teams-row flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left",
                  item.id === team.uniformPackageId ? "bg-cream" : "bg-paper",
                )}
              >
                <span className="text-sm font-semibold">{item.name}</span>
                <span className="teams-num text-xs uppercase text-teams-muted">
                  {item.id === team.uniformPackageId
                    ? "On this team"
                    : showMoney
                      ? formatTeamMoney(item.price)
                      : "Approved"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {showMoney ? (
          <ul className="mt-4 divide-y divide-line">
            {os.state.uniforms
              .filter((u) => u.sport === team.sport)
              .map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-sm">{item.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => os.approvePackage(item.id, item.approved === false)}
                  >
                    {item.approved === false ? "Approve" : "Unapprove"}
                  </Button>
                </li>
              ))}
          </ul>
        ) : null}
      </DeskCard>

      <DeskCard
        eyebrow="Photos"
        title="What they put on."
        copy="Stored off the team record. Home, road, alternate, pants, cap, helmet, belt."
      >
        {showMoney && photoPacks.length > 1 ? (
          <label className="mb-3 grid gap-1 text-sm">
            <span className="text-teams-muted">Package photos</span>
            <select
              className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
              value={photoPkg}
              onChange={(e) => setPhotoPkg(e.target.value)}
            >
              {photoPacks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {slots.map((slot) => {
            const shot = photos.find((p) => p.slot === slot);
            return (
              <figure key={slot} className="overflow-hidden rounded-xl bg-paper shadow-border">
                {shot ? (
                  <img
                    src={shot.src}
                    alt={slot}
                    className="h-44 w-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="flex h-44 items-end bg-navy p-3">
                    <p className="text-xs font-semibold tracking-wide text-cream uppercase">{slot}</p>
                  </div>
                )}
                <figcaption className="px-3 py-2 text-xs text-teams-muted">{slot}</figcaption>
                {showMoney ? (
                  <label className="block px-3 pb-3 text-xs font-semibold uppercase text-maroon">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-1 block w-full text-xs"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const src = await readFile(file);
                        os.uploadPhoto(photoPkg || team.uniformPackageId, slot, src);
                      }}
                    />
                  </label>
                ) : null}
              </figure>
            );
          })}
        </div>
      </DeskCard>

      <DeskCard
        eyebrow="Sizes"
        title={outstanding.length ? "Sheets still out." : "Every order is in."}
        copy="Coach sees who has submitted. Ordering warns if the sheet is incomplete."
      >
        <NumRows
          rows={[
            { label: "Submitted", value: String(submitted.length) },
            {
              label: "Still out",
              value: String(outstanding.length),
              alert: outstanding.length > 0,
            },
          ]}
        />
        {outstanding.length ? (
          <ul className="mt-3 divide-y divide-line">
            {outstanding.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-teams-open-player={p.id}
                  onClick={() => os.openPlayer(team.id, p.id, "uniform")}
                  className="teams-row flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-sm">{p.name}</span>
                  <span className="teams-num text-xs font-semibold tracking-wide text-ok-maroon uppercase">
                    Not submitted
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-teams-muted">All sizes are in.</p>
        )}
        {kids.length ? (
          <div className="mt-4 grid gap-2">
            {kids.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outlineDark"
                size="sm"
                onClick={() => os.openPlayer(team.id, p.id, "uniform")}
              >
                {p.order?.submitted ? `${p.name} · sizes in` : `${p.name} · pick number and sizes`}
              </Button>
            ))}
          </div>
        ) : null}
        {showMoney ? (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-teams-muted">Size deadline</span>
              <input
                type="date"
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              onClick={() => {
                os.setUniformDeadline(team.id, deadline);
                setFlash(`Sizes due ${deadline}. The team was notified.`);
              }}
            >
              Set deadline
            </Button>
          </div>
        ) : null}
      </DeskCard>

      {showMoney ? (
        <DeskCard
          eyebrow="Purchase orders"
          title="One numbered PO. One supplier."
          copy="Draft → submitted → in production → shipped → delivered. Each step notifies the team."
        >
          {warn ? (
            <div className="mb-4 rounded-xl bg-cream px-4 py-3" data-teams-po-warn="true">
              <p className="text-sm font-semibold text-ok-maroon">Size sheets incomplete.</p>
              <p className="mt-1 text-sm text-teams-muted">{warn.join(", ")} still out.</p>
              <Button type="button" size="sm" className="mt-3" onClick={() => openPo(true)}>
                Create anyway
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-teams-muted">Supplier</span>
              <input
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-teams-muted">Expected delivery</span>
              <input
                type="date"
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
              />
            </label>
            <Button type="button" data-teams-create-po="true" onClick={() => openPo(false)}>
              Create season PO
            </Button>
          </div>
          {pos.length === 0 ? (
            <p className="mt-4 text-sm text-teams-muted">No purchase order yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {pos.map((po) => {
                const nxt = nextOf(po.status);
                return (
                  <li key={po.id} className="py-3" data-teams-po-status={po.status}>
                    <p className="text-sm font-semibold">
                      {po.number} · {PO_STATUS_LABEL[po.status]}
                    </p>
                    <p className="text-xs text-teams-muted">
                      {po.supplier} · {po.expectedDelivery} · {po.kind}
                      {po.kind === "reorder" ? ` · bill ${po.billTo}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nxt ? (
                        <Button
                          type="button"
                          size="sm"
                          data-teams-advance-po={po.id}
                          onClick={() => {
                            const result = os.advancePo(po.id);
                            if (result.ok) {
                              setFlash(
                                `${po.number} is now ${PO_STATUS_LABEL[result.status as keyof typeof PO_STATUS_LABEL] || result.status}. The team was notified.`,
                              );
                            }
                          }}
                        >
                          Mark {PO_STATUS_LABEL[nxt].toLowerCase()}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outlineDark"
                        data-teams-export-po={po.id}
                        onClick={() => {
                          const csv = os.poCsv(po.id);
                          if (csv) downloadCsv(`${po.number}.csv`, csv);
                        }}
                      >
                        Export for supplier
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DeskCard>
      ) : null}

      {showMoney ? (
        <DeskCard
          eyebrow="Reorder"
          title="Lost kit, growth, late add."
          copy="Billed to the family unless you say the club covers it."
        >
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-teams-muted">Player</span>
              <select
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={reorderWho}
                onChange={(e) => setReorderWho(e.target.value)}
              >
                <option value="">Select</option>
                {team.roster
                  .filter((p) => !p.withdrawn)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-teams-muted">Reason</span>
              <select
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={reorderWhy}
                onChange={(e) => setReorderWhy(e.target.value as typeof reorderWhy)}
              >
                {REORDER_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-teams-muted">Bill to</span>
              <select
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={billTo}
                onChange={(e) => setBillTo(e.target.value as "family" | "club")}
              >
                <option value="family">Family</option>
                <option value="club">Club</option>
              </select>
            </label>
            <Button
              type="button"
              variant="outlineDark"
              disabled={!reorderWho}
              onClick={() => openPo(true, "reorder")}
            >
              Open reorder
            </Button>
          </div>
        </DeskCard>
      ) : (
        <TeamsEmpty
          title={outstanding.length ? `${outstanding.length} size sheets out.` : "Package is set."}
          copy="Admin runs the purchase order. You see who still owes sizes."
        />
      )}
    </div>
  );
}

export { sizeFieldsOf };
