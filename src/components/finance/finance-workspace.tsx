import { useEffect, useState, type ReactNode } from "react";
import { FinancialCutover } from "./financial-cutover";
import { getFinance, changeFinance, syncFinanceSquare } from "@/lib/finance/api";
import { today, total } from "@/lib/finance/contracts";
import { formatMoney as money } from "@/lib/pricing";
import { Button } from "../ui/button";
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: [string, string][];
  value?: string | number;
  optional?: boolean;
};
const uuid = () => crypto.randomUUID();
const field = (key: string, label: string, type = "text", value?: string | number): Field => ({
  key,
  label,
  type,
  value,
});
const amount = (v: Record<string, string>, k: string) => Math.round(Number(v[k] || 0) * 100);
function Form({
  title,
  fields,
  onSave,
  busy,
  children,
}: {
  title: string;
  fields: Field[];
  onSave: (v: Record<string, string>) => Promise<void>;
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-line bg-white p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">{title}</summary>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const v = Object.fromEntries(new FormData(form)) as Record<string, string>;
          await onSave(v);
        }}
      >
        {fields.map((f) => (
          <label className="grid min-w-0 gap-1 text-sm" key={f.key}>
            {f.label}
            {f.options ? (
              <select
                name={f.key}
                required={!f.optional}
                defaultValue={f.value ?? ""}
                className="min-h-11 w-full rounded-lg border p-2"
              >
                <option value="">Choose…</option>
                {f.options.map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.key}
                type={f.type || "text"}
                required={!f.optional}
                defaultValue={f.value ?? ""}
                step={f.type === "number" ? "0.01" : undefined}
                maxLength={500}
                className="min-h-11 w-full min-w-0 rounded-lg border p-2"
              />
            )}
          </label>
        ))}
        <div className="sm:col-span-2">
          {children}
          <Button type="submit" disabled={busy}>
            Save {title.toLowerCase()}
          </Button>
        </div>
      </form>
    </details>
  );
}
const options = (key: string, label: string, opts: [string, string][], value?: string): Field => ({
  key,
  label,
  options: opts,
  value,
});
function Amounts({ values }: { values: [string, number][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {values.map(([label, value]) => (
        <div key={label} className="rounded-xl border bg-white p-4">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="mt-1 text-xl font-bold">{money(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
const tabs = [
  "Cash Dashboard",
  "Business Banking",
  "Payout Center",
  "Receivables",
  "Square & Refunds",
  "Compensation Rules",
  "Audit",
  "Operational Cutover",
] as const;
export function FinanceWorkspace() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getFinance>>>(),
    [tab, setTab] = useState<(typeof tabs)[number]>("Cash Dashboard"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [showPaid, setShowPaid] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  async function load() {
    setData(await getFinance());
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finance change failed.");
    } finally {
      setBusy(false);
    }
  }
  async function save(a: any, reason = "Admin reviewed and saved this financial record") {
    if (!data) return;
    await run(() =>
      changeFinance({
        data: { ...a, revision: data.revision, basisVersion: data.basisVersion, reason },
      }),
    );
  }
  if (!data)
    return (
      <section>
        <h2>Finance</h2>
        <p role="status">{error || "Loading financial records…"}</p>
      </section>
    );
  const rs = data.records,
    s = data.summary,
    values = (kind: string) => rs.filter((r) => r.kind === kind).map((r) => r.payload),
    payees = values("payee"),
    accounts = values("account"),
    cards = values("card"),
    payments = values("payment"),
    bank = values("bank");
  const payeeOptions = payees
      .filter((p) => p.active)
      .map((p) => [p.id, p.name] as [string, string]),
    accountOptions = accounts
      .filter((a) => a.active)
      .map((a) => [a.id, `${a.nickname} · •••• ${a.last4}`] as [string, string]);
  const teamOptions: [string, string][] = [
    ["organization", "Organization / no team"],
    ...s.teams.map((t) => [t.id, t.name] as [string, string]),
  ];
  const payeeName = (id: string) => payees.find((p) => p.id === id)?.name || id;
  const ruleFields = [
    options("payeeId", "Instructor", payeeOptions),
    options(
      "serviceId",
      "Lesson service",
      data.sources.services.map((x) => [x.id, x.name]),
    ),
    options("mode", "Compensation rule", [
      ["percent", "Percentage of lesson revenue"],
      ["fixed", "Fixed amount per lesson"],
      ["hourly", "Hourly rate"],
    ]),
    field("value", "Percentage or dollar rate", "number"),
    field("effectiveFrom", "Applies to lessons on or after", "date", today()),
  ];
  const payableFields = [
    options("payeeId", "Payee", payeeOptions),
    options(
      "category",
      "Category",
      [
        "coach",
        "instructor",
        "staff",
        "vendor",
        "uniform",
        "tournament",
        "hotel",
        "gas",
        "facility",
        "other",
      ].map((x) => [x, x]),
    ),
    options("teamId", "Team", teamOptions, "organization"),
    field("reason", "What is this payment for?"),
    field("amount", "Total compensation / invoice budget ($)", "number"),
    field("earned", "Earned / incurred to date ($)", "number"),
    field("due", "Due date", "date"),
  ];
  const categoryTotals = [
    "coach",
    "instructor",
    "vendor",
    "facility",
    "refund",
    "owner",
    "staff",
    "uniform",
    "tournament",
    "hotel",
    "gas",
    "other",
  ].map(
    (c) =>
      [c, total(s.payables.filter((p) => p.category === c).map((p) => p.remaining))] as [
        string,
        number,
      ],
  );
  const filtered = s.payables.filter(
    (p) =>
      (showPaid || p.remaining > 0 || p.notEarned > 0) &&
      `${payeeName(p.payeeId)} ${p.reason} ${p.status}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="grid min-w-0 gap-5">
      <div>
        <h2 className="text-3xl">Finance</h2>
        <p className="text-sm">
          Square collects customer payments. Prospects pays people and expenses through its business
          bank account. Transfers are not new revenue.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Finance sections">
        {tabs.map((t) => (
          <Button key={t} variant={tab === t ? "primary" : "outline"} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="rounded-lg border border-maroon p-3 text-maroon">
          {error}
        </p>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          save(
            { action: "refresh" },
            "Refresh earned compensation from published team budgets and completed lessons",
          )
        }
      >
        Refresh earned compensation & team payables
      </Button>
      {Boolean(data.sources.pendingRecognition?.length) && (
        <section
          className="grid gap-3 rounded-xl border border-line p-4"
          aria-label="Lessons awaiting financial recognition"
        >
          <h3 className="text-xl">Review Completed Lessons</h3>
          <p>
            Operational attendance does not accrue compensation. Review funding and recognize the
            approved financial lesson separately.
          </p>
          {data.sources.pendingRecognition.map((lesson) => (
            <div key={lesson.bookingId} className="flex flex-wrap items-center gap-3">
              <span>
                {data.sources.services.find((s) => s.id === lesson.serviceId)?.name ||
                  lesson.serviceId}{" "}
                · {lesson.due} · {lesson.bookingId}
              </span>
              <details className="w-full">
                <summary>Review attendance evidence</summary>
                <p>{lesson.recap}</p>
                <p>
                  {lesson.recordedBy} {lesson.recordedAt}
                </p>
              </details>
              <Button
                disabled={busy}
                onClick={() =>
                  save(
                    { action: "recognizeLesson", bookingId: lesson.bookingId },
                    "Owner reviewed completed attendance and current funding for financial recognition",
                  )
                }
              >
                Recognize approved compensation
              </Button>
            </div>
          ))}
        </section>
      )}
      {tab === "Operational Cutover" && <FinancialCutover />}
      {tab === "Cash Dashboard" && (
        <>
          <Amounts
            values={[
              ["Reconciled business cash", s.cash],
              ["Square transfers pending", s.squarePending],
              ["Customer receivables — known balances", s.outstanding],
              ["Protected team direct costs", s.teamDirect],
              ["Protected contingency", s.contingency],
              ["Deferred membership service", s.deferred],
              ["Required operating reserve", data.settings.reserve],
              ["Tax / payroll liabilities", data.settings.tax],
              ["Other restricted cash", data.settings.restricted],
              ["Available operating cash", s.operatingCash],
              ["Available distributable cash", s.distributable],
              ["Approved payments in progress", s.pendingPayments],
            ]}
          />
          <h3 className="text-xl">Money Prospects owes</h3>
          <Amounts values={categoryTotals} />
          <h3 className="text-xl">Owner shares</h3>
          <Amounts
            values={[
              [
                "Nolan projected team contribution before facility overhead",
                Math.floor(
                  (total(s.teams.map((t) => t.projected || 0)) * data.settings.nolanBps) / 10000,
                ),
              ],
              [
                "Steve projected team contribution before facility overhead",
                total(s.teams.map((t) => t.projected || 0)) -
                  Math.floor(
                    (total(s.teams.map((t) => t.projected || 0)) * data.settings.nolanBps) / 10000,
                  ),
              ],
              [
                "Nolan available distributable share",
                Math.floor((s.distributable * data.settings.nolanBps) / 10000),
              ],
              [
                "Steve available distributable share",
                s.distributable - Math.floor((s.distributable * data.settings.nolanBps) / 10000),
              ],
              ["Reviewed undistributed profit ceiling", s.profitAvailable],
            ]}
          />
          <p>
            Team projections use current roster counts and published pricing. They are estimates,
            not collected cash or earned profit.
          </p>
          <h3 className="text-xl">Distribution readiness</h3>
          <p>
            No transfer is initiated here. Cash availability and reviewed earned profit must both
            support a distribution.
          </p>
          {s.warnings.length ? (
            <ul className="list-disc pl-5">
              {s.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p>Cash-protection checks passed for today.</p>
          )}
          <Form
            title="Cash protection review"
            busy={busy}
            fields={[
              field(
                "profit",
                "Cumulative earned profit available for distributions before recorded owner distributions ($)",
                "number",
                data.settings.profit / 100,
              ),
              field(
                "reserve",
                "Required operating reserve ($)",
                "number",
                data.settings.reserve / 100,
              ),
              field("tax", "Tax / payroll liabilities ($)", "number", data.settings.tax / 100),
              field(
                "restricted",
                "Other restricted cash ($)",
                "number",
                data.settings.restricted / 100,
              ),
              field(
                "nolanBps",
                "Nolan ownership (%) — Steve receives the remainder",
                "number",
                data.settings.nolanBps / 100,
              ),
              field(
                "reviewedThrough",
                "Bank and liability review through",
                "date",
                data.settings.reviewedThrough,
              ),
              field(
                "reviewNote",
                "Review evidence / statement reference",
                undefined,
                data.settings.reviewNote,
              ),
              options(
                "cadence",
                "Distribution review frequency",
                ["manual", "monthly", "biweekly", "quarterly", "custom"].map((x) => [x, x]),
                data.settings.cadence,
              ),
            ]}
            onSave={async (v) =>
              save(
                {
                  action: "settings",
                  value: {
                    profit: amount(v, "profit"),
                    reserve: amount(v, "reserve"),
                    tax: amount(v, "tax"),
                    restricted: amount(v, "restricted"),
                    nolanBps: Math.round(Number(v.nolanBps) * 100),
                    reviewedThrough: v.reviewedThrough,
                    reviewNote: v.reviewNote,
                    cadence: v.cadence,
                  },
                },
                v.reviewNote,
              )
            }
          >
            <p className="mb-3 text-sm">
              Use reconciled, earned organization profit—not forecast fees or owner capital.
              Frequency is a review preference; payments and approvals remain manual.
            </p>
          </Form>
          <Form
            title="Approve owner distribution"
            busy={busy || s.distributable === 0}
            fields={[
              field("amount", "Total distribution ($)", "number"),
              field("due", "Due date", "date"),
              field("reason", "Approval reason"),
            ]}
            onSave={async (v) =>
              save({ action: "distribution", amount: amount(v, "amount"), due: v.due }, v.reason)
            }
          >
            <p>
              Available {money(s.distributable)} · Nolan {data.settings.nolanBps / 100}% · Steve{" "}
              {100 - data.settings.nolanBps / 100}%
            </p>
          </Form>
          <h3 className="text-xl">Team virtual subledgers</h3>
          {s.teams.map((t) => (
            <article key={t.id} className="rounded-xl border bg-white p-4">
              <h4>{t.name}</h4>
              <Amounts
                values={[
                  ["Player fees billed", t.billed],
                  ["Collected in team ledger", t.collected],
                  ["Protected direct costs", t.protectedDirect],
                  ["Protected contingency", t.contingency],
                  ["Team payables", t.payables],
                ]}
              />
              <a className="underline" href="/office?section=teams">
                Open team fees, expenses and contribution
              </a>
            </article>
          ))}
        </>
      )}
      {tab === "Business Banking" && (
        <>
          <p>
            Balances are based on the verified opening balance plus reconciled transactions. This is
            a manual bank ledger, not a live bank connection. Never enter full bank/card numbers,
            passwords, CVV or PIN.
          </p>
          {s.accountBalances.map((a) => (
            <article key={a.id} className="rounded-xl border bg-white p-4">
              <h3>
                {a.nickname} · {a.bank} · •••• {a.last4}
              </h3>
              <p>
                {a.active ? "Active" : "Inactive"} · Manual tracking · {money(a.balance)} reconciled
                · Last reconciliation {a.lastReconciled}
              </p>
            </article>
          ))}
          <Form
            title="Add business account"
            busy={busy}
            fields={[
              field("bank", "Bank name"),
              field("nickname", "Account nickname"),
              options(
                "type",
                "Account type",
                [
                  ["checking", "Checking"],
                  ["savings", "Savings"],
                  ["other", "Other"],
                ],
                "checking",
              ),
              field("last4", "Last four digits only"),
              field("opening", "Verified opening balance ($)", "number"),
              field(
                "openingDate",
                "Transactions begin on (opening balance excludes this day)",
                "date",
              ),
            ]}
            onSave={async (v) =>
              save({
                action: "account",
                value: {
                  id: uuid(),
                  bank: v.bank,
                  nickname: v.nickname,
                  type: v.type,
                  last4: v.last4,
                  opening: amount(v, "opening"),
                  openingDate: v.openingDate,
                  active: true,
                },
              })
            }
          />
          <Form
            title="Add business debit card"
            busy={busy}
            fields={[
              options("accountId", "Business account", accountOptions),
              field("nickname", "Card nickname"),
              field("brand", "Card brand"),
              field("last4", "Last four digits only"),
              options(
                "isDefault",
                "Default expense card",
                [
                  ["yes", "Yes"],
                  ["no", "No"],
                ],
                "yes",
              ),
            ]}
            onSave={async (v) =>
              save({
                action: "card",
                value: {
                  id: uuid(),
                  accountId: v.accountId,
                  nickname: v.nickname,
                  brand: v.brand,
                  last4: v.last4,
                  isDefault: v.isDefault === "yes",
                  active: true,
                },
              })
            }
          />
          {cards.map((c) => (
            <article key={c.id} className="rounded-xl border p-3">
              <p>
                {c.nickname} · {c.brand} •••• {c.last4} ·{" "}
                {c.isDefault ? "Default expense card" : ""}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => save({ action: "card", value: { ...c, active: !c.active } })}
              >
                Set {c.active ? "inactive" : "active"}
              </Button>
            </article>
          ))}
          <Form
            title="Record bank transaction"
            busy={busy}
            fields={[
              options("accountId", "Business account", accountOptions),
              field("date", "Transaction date", "date"),
              field("amount", "Amount ($): positive deposit, negative withdrawal", "number"),
              field("reference", "Unique bank reference"),
              field("category", "Category"),
              field("reason", "Description / receipt reference"),
              {
                ...options("payeeId", "Person or vendor (optional)", payeeOptions),
                optional: true,
              },
              options("teamId", "Team", teamOptions, "organization"),
            ]}
            onSave={async (v) =>
              save(
                {
                  action: "bank",
                  value: {
                    id: uuid(),
                    accountId: v.accountId,
                    date: v.date,
                    amount: amount(v, "amount"),
                    reference: v.reference,
                    category: v.category,
                    reason: v.reason,
                    payeeId: v.payeeId || "",
                    teamId: v.teamId === "organization" ? "" : v.teamId,
                  },
                },
                v.reason,
              )
            }
          />
          <h3>Reconciliation · {s.unmatched} unmatched transactions</h3>
          {bank
            .filter((b) => !b.verified)
            .map((b) => (
              <article key={b.id} className="rounded-xl border bg-white p-4">
                <h4>
                  {b.date} · {money(b.amount)} · {b.reference}
                </h4>
                <p>{b.reason}</p>
                <Form
                  title="Match transaction"
                  busy={busy}
                  fields={[
                    options("target", "Ledger record", [
                      ...payments
                        .filter(
                          (p) =>
                            p.state === "in progress" &&
                            p.accountId === b.accountId &&
                            -p.amount === b.amount,
                        )
                        .map(
                          (p) =>
                            ["payment|" + p.id, `Outgoing payment · ${p.reference}`] as [
                              string,
                              string,
                            ],
                        ),
                      ...values("settlement")
                        .filter(
                          (p) =>
                            !p.bankId &&
                            p.status === "PAID" &&
                            p.amount === b.amount &&
                            p.environment === "production",
                        )
                        .map(
                          (p) =>
                            ["settlement|" + p.id, `Square deposit · ${p.reference}`] as [
                              string,
                              string,
                            ],
                        ),
                      ...values("invoice")
                        .filter(() => b.amount > 0)
                        .map(
                          (i) =>
                            ["invoice|" + i.id, `Invoice · ${i.customer} · ${money(i.amount)}`] as [
                              string,
                              string,
                            ],
                        ),
                      [
                        "classification|" + b.id,
                        "Reviewed other movement (capital, expense, adjustment)",
                      ],
                    ]),
                    field("reason", "Evidence confirming this bank match"),
                  ]}
                  onSave={async (v) => {
                    const [targetKind, targetId] = v.target.split("|");
                    await save({ action: "match", bankId: b.id, targetKind, targetId }, v.reason);
                  }}
                />
              </article>
            ))}
          <details>
            <summary>
              Reconciled transaction history ({bank.filter((b) => b.verified).length})
            </summary>
            {bank
              .filter((b) => b.verified)
              .map((b) => (
                <p key={b.id}>
                  {b.date} · {money(b.amount)} · {b.reference} · {b.match}
                </p>
              ))}
          </details>
        </>
      )}
      {tab === "Payout Center" && (
        <>
          <p>
            Earned compensation becomes payable. Approval reserves an amount; recording a payment
            marks it in progress. Only a matching bank transaction marks it paid.
          </p>
          <Form
            title="Add payee"
            busy={busy}
            fields={[
              field("name", "Name"),
              { ...field("email", "Linked account email (optional)", "email"), optional: true },
              options(
                "role",
                "Role",
                [
                  "Nolan",
                  "Steve",
                  "Head Coach",
                  "Assistant Coach",
                  "Instructor",
                  "Employee",
                  "Contractor",
                  "Vendor",
                  "Other",
                ].map((x) => [x, x]),
              ),
              options(
                "method",
                "Preferred external method",
                ["bank transfer", "check", "business debit", "other"].map((x) => [x, x]),
              ),
              {
                ...field("reference", "Safe payment instructions or masked reference"),
                optional: true,
              },
            ]}
            onSave={async (v) =>
              save({
                action: "payee",
                value: {
                  id: uuid(),
                  name: v.name,
                  email: v.email || "",
                  role: v.role,
                  method: v.method,
                  reference: v.reference || "",
                  active: true,
                },
              })
            }
          />
          <Form
            title="Add payable"
            busy={busy}
            fields={payableFields}
            onSave={async (v) =>
              save(
                {
                  action: "payable",
                  value: {
                    id: uuid(),
                    payeeId: v.payeeId,
                    category: v.category,
                    teamId: v.teamId === "organization" ? "" : v.teamId,
                    reason: v.reason,
                    amount: amount(v, "amount"),
                    earned: amount(v, "earned"),
                    due: v.due,
                    source: "manual",
                  },
                },
                v.reason,
              )
            }
          />
          <Button
            disabled={busy}
            variant="outline"
            onClick={() =>
              save(
                { action: "facility" },
                "Admin confirmed this month’s facility and payroll obligations from reviewed Master Defaults",
              )
            }
          >
            Generate this month’s facility & staffing payables
          </Button>
          <p className="text-sm">
            Uses reviewed Master Defaults. Confirm vendors and due dates before approval; staffing
            accrues evenly through the month. Repeating this action updates the same records.
          </p>
          <Amounts
            values={[
              ["Total outstanding payables", total(s.payables.map((p) => p.remaining))],
              [
                "Payables due in next 7 days",
                total(
                  s.payables
                    .filter(
                      (p) =>
                        p.due >= today() &&
                        p.due <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                    )
                    .map((p) => p.remaining),
                ),
              ],
              [
                "Payables due today",
                total(s.payables.filter((p) => p.due === today()).map((p) => p.remaining)),
              ],
              [
                "Payables overdue",
                total(s.payables.filter((p) => p.due < today()).map((p) => p.remaining)),
              ],
              [
                "Approved but unpaid",
                total(s.payables.map((p) => Math.max(0, p.approved - p.paid))),
              ],
            ]}
          />
          <h3 className="text-xl">Payee financial profiles</h3>
          {payees.map((p) => {
            const rows = s.payables.filter((x) => x.payeeId === p.id);
            return (
              <details key={p.id} className="rounded-xl border bg-white p-3">
                <summary className="min-h-11 cursor-pointer">
                  {p.name} · {p.role} · {money(total(rows.map((x) => x.remaining)))} owed
                </summary>
                <Amounts
                  values={[
                    ["Earned", total(rows.map((x) => x.earned))],
                    ["Not yet earned", total(rows.map((x) => x.notEarned))],
                    ["Approved", total(rows.map((x) => x.approved))],
                    ["Paid / reconciled", total(rows.map((x) => x.paid))],
                    [
                      "Approved but unpaid",
                      total(rows.map((x) => Math.max(0, x.approved - x.paid))),
                    ],
                  ]}
                />
                <p>
                  Preferred method: {p.method} · {p.reference || "No instructions saved"}
                </p>
                {["coach", "instructor", "owner", "other"].map((c) => (
                  <p key={c}>
                    {c}: earned{" "}
                    {money(total(rows.filter((x) => x.category === c).map((x) => x.earned)))} · paid{" "}
                    {money(total(rows.filter((x) => x.category === c).map((x) => x.paid)))}
                  </p>
                ))}
                <Form
                  title="Edit payment preference"
                  busy={busy}
                  fields={[
                    options(
                      "method",
                      "Method",
                      ["bank transfer", "check", "business debit", "other"].map((x) => [x, x]),
                      p.method,
                    ),
                    {
                      ...field(
                        "reference",
                        "Masked reference / safe instructions",
                        undefined,
                        p.reference,
                      ),
                      optional: true,
                    },
                  ]}
                  onSave={async (v) => save({ action: "payee", value: { ...p, ...v } })}
                />
              </details>
            );
          })}
          <label className="grid gap-1">
            Search payee, reason or status
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-11 rounded-lg border p-2"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={showPaid}
              onChange={(e) => setShowPaid(e.target.checked)}
            />{" "}
            Include paid / canceled
          </label>
          {selected.length > 0 && (
            <div className="rounded-xl border p-4">
              <p>
                Review {selected.length} payables · Approval total{" "}
                {money(
                  total(
                    s.payables
                      .filter((p) => selected.includes(p.id))
                      .map((p) => Math.max(0, p.earned - p.approved)),
                  ),
                )}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  save(
                    {
                      action: "approve",
                      ids: selected,
                      total: total(
                        s.payables
                          .filter((p) => selected.includes(p.id))
                          .map((p) => Math.max(0, p.earned - p.approved)),
                      ),
                    },
                    "Admin reviewed bulk approval total and cash required",
                  )
                }
              >
                Approve reviewed total
              </Button>
            </div>
          )}
          {filtered.map((p) => (
            <article key={p.id} className="grid gap-3 rounded-xl border bg-white p-4">
              <h3>
                {payeeName(p.payeeId)} · {p.reason}
              </h3>
              <p>
                {p.status} · Due {p.due} · Earned {money(p.earned)} · Approved {money(p.approved)} ·
                Paid {money(p.paid)} · Remaining {money(p.remaining)}
              </p>
              {p.legacyPaid && (
                <Form
                  title="Reconcile legacy payment"
                  busy={busy}
                  fields={[
                    options(
                      "bankId",
                      "Matching bank debit",
                      bank
                        .filter((b) => !b.verified && b.amount === -p.paid)
                        .map((b) => [b.id, `${b.date} · ${b.reference}`]),
                    ),
                  ]}
                  onSave={async (v) =>
                    save(
                      { action: "legacyMatch", payableId: p.id, bankId: v.bankId },
                      "Admin matched historical paid compensation to its bank debit",
                    )
                  }
                />
              )}
              {p.category !== "owner" && (
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((id) => id !== p.id),
                      )
                    }
                  />{" "}
                  Select for approval
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    save(
                      {
                        action: "hold",
                        id: p.id,
                        state: p.state === "held" ? "pending approval" : "held",
                      },
                      "Admin changed payable review hold",
                    )
                  }
                >
                  {p.state === "held" ? "Release hold" : "Hold"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    save(
                      { action: "hold", id: p.id, state: "canceled" },
                      "Admin canceled unpaid obligation after review",
                    )
                  }
                >
                  Cancel unpaid obligation
                </Button>
              </div>
              {p.category !== "owner" && p.category !== "refund" && (
                <Form
                  title="Edit payable / accrual override"
                  busy={busy}
                  fields={payableFields.map((f) => ({
                    ...f,
                    value:
                      f.key === "amount"
                        ? p.amount / 100
                        : f.key === "earned"
                          ? p.earned / 100
                          : f.key === "teamId"
                            ? p.teamId || "organization"
                            : String((p as any)[f.key] ?? ""),
                  }))}
                  onSave={async (v) =>
                    save(
                      {
                        action: "payable",
                        value: {
                          id: p.id,
                          payeeId: v.payeeId,
                          category: v.category,
                          teamId: v.teamId === "organization" ? "" : v.teamId,
                          reason: v.reason,
                          amount: amount(v, "amount"),
                          earned: amount(v, "earned"),
                          due: v.due,
                          source: p.source || "manual",
                        },
                      },
                      v.reason,
                    )
                  }
                >
                  <p>
                    An explicit accrual override stops automatic accrual updates for this record and
                    resets approval.
                  </p>
                </Form>
              )}
              {p.approved > p.paid && (
                <Form
                  title="Record external payment"
                  busy={busy}
                  fields={[
                    options("accountId", "Paid from business account", accountOptions),
                    {
                      ...options(
                        "cardId",
                        "Business debit card (optional)",
                        cards
                          .filter((c) => c.active)
                          .map((c) => [c.id, `${c.nickname} •••• ${c.last4}`]),
                        cards.find((c) => c.isDefault && c.active)?.id,
                      ),
                      optional: true,
                    },
                    field(
                      "amount",
                      "Amount sent ($)",
                      "number",
                      (p.approved - p.paid - p.inProgress) / 100,
                    ),
                    field("date", "Date sent", "date"),
                    field("method", "Actual external payment method"),
                    field("reference", "Unique payment confirmation / reference"),
                  ]}
                  onSave={async (v) =>
                    save(
                      {
                        action: "payment",
                        id: uuid(),
                        payableId: p.id,
                        accountId: v.accountId,
                        cardId: v.cardId || "",
                        amount: amount(v, "amount"),
                        date: v.date,
                        method: v.method,
                        reference: v.reference,
                      },
                      "Admin recorded payment sent externally; awaiting bank reconciliation",
                    )
                  }
                >
                  <p className="mb-2">
                    Destination:{" "}
                    {payees.find((x) => x.id === p.payeeId)?.reference ||
                      "Confirm directly with the payee"}{" "}
                    · This button does not transfer money.
                  </p>
                  <label className="mb-3 flex gap-2">
                    <input type="checkbox" required />I made this payment externally and have its
                    confirmation.
                  </label>
                </Form>
              )}
              {payments
                .filter((x) => x.payableId === p.id)
                .map((x) => (
                  <div key={x.id}>
                    <p>
                      {x.date} · {money(x.amount)} · {x.state} · {x.reference}
                    </p>
                    {x.state === "in progress" && (
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          save(
                            { action: "paymentFailed", id: x.id },
                            "Admin confirmed external payment failed",
                          )
                        }
                      >
                        Record failed payment
                      </Button>
                    )}
                  </div>
                ))}
            </article>
          ))}
        </>
      )}
      {tab === "Receivables" && (
        <>
          <Amounts
            values={[
              ["Total outstanding — known balances", s.outstanding],
              [
                "Due in next 7 days",
                total(
                  s.receivables
                    .filter(
                      (r) =>
                        r.due >= today() &&
                        r.due <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                    )
                    .map((r) => r.remaining),
                ),
              ],
              [
                "Due this month",
                total(
                  s.receivables
                    .filter((r) => r.due?.slice(0, 7) === today().slice(0, 7))
                    .map((r) => r.remaining),
                ),
              ],
              [
                "Due today",
                total(s.receivables.filter((r) => r.due === today()).map((r) => r.remaining)),
              ],
              [
                "Past due",
                total(
                  s.receivables.filter((r) => r.due && r.due < today()).map((r) => r.remaining),
                ),
              ],
              [
                "Failed payments",
                total(
                  s.receivables
                    .filter((r) => r.status === "PAYMENT FAILED")
                    .map((r) => r.remaining),
                ),
              ],
            ]}
          />
          <p>
            Accepted team payment schedules and unpaid subscription invoices appear automatically.
            Abandoned checkout attempts are not debts. Other approved customer invoices can be
            recorded below.
          </p>
          {s.unverifiedReceivables > 0 && (
            <p role="status" className="rounded border p-3">
              {s.unverifiedReceivables} invoice balance(s) need provider review and are excluded
              from the known-balance totals. Review the invoice with its original payment provider;
              financial certification remains blocked until the balance is verified.
            </p>
          )}
          <Form
            title="Create receivable"
            busy={busy}
            fields={[
              field("customer", "Customer"),
              field("category", "Category / service"),
              options("teamId", "Team", teamOptions, "organization"),
              field("amount", "Billed amount ($)", "number"),
              field("due", "Due date", "date"),
              field("reason", "Invoice reason / reference"),
            ]}
            onSave={async (v) =>
              save(
                {
                  action: "invoice",
                  value: {
                    id: uuid(),
                    userId: "",
                    customer: v.customer,
                    category: v.category,
                    teamId: v.teamId === "organization" ? "" : v.teamId,
                    amount: amount(v, "amount"),
                    due: v.due,
                    reason: v.reason,
                  },
                },
                v.reason,
              )
            }
          />
          {s.receivables
            .filter((r) => r.remaining > 0 || r.needsReview)
            .map((r) => (
              <article key={r.id} className="rounded-xl border bg-white p-4">
                <h3>
                  {r.customer} · {r.category}
                </h3>
                <p>
                  {r.status} · Due {r.due || "Review date"} · Billed{" "}
                  {r.amount == null ? "Needs verification" : money(r.amount)} · Cash paid{" "}
                  {r.paid == null ? "Needs verification" : money(r.paid)} · Credits / adjustments{" "}
                  {money(r.credits || 0)} · Remaining{" "}
                  {r.remaining == null ? "Needs verification" : money(r.remaining)}
                </p>
              </article>
            ))}
          <Form
            title="Record invoice credit or write-off"
            busy={busy}
            fields={[
              options(
                "invoiceId",
                "Manual invoice",
                values("invoice").map((i) => [i.id, `${i.customer} · ${money(i.amount)}`]),
              ),
              options("kind", "Adjustment", [
                ["credit", "Credit"],
                ["write-off", "Write-off"],
              ]),
              field("amount", "Adjustment amount ($)", "number"),
              field("reason", "Why is this adjustment required?"),
            ]}
            onSave={async (v) =>
              save(
                {
                  action: "invoiceAdjustment",
                  invoiceId: v.invoiceId,
                  amount: amount(v, "amount"),
                  kind: v.kind,
                },
                v.reason,
              )
            }
          />
          <p>
            Payment problems never disable account sign-in. Customers can still review billing and
            contact Front Office.
          </p>
        </>
      )}
      {tab === "Square & Refunds" && (
        <>
          <Amounts
            values={[
              ["Production gross customer collections", s.squareReceived],
              ["Recorded Square refunds", s.collections.refunds],
              ["Collections after recorded Square refunds", s.collections.afterRefunds],
              ["Known processing fees", s.collections.knownFees],
              ["Square deposits matched to bank", s.squareBankDeposits],
              ["Known pending Square transfers", s.squarePending],
              ["Outstanding refund obligations", s.refundObligations],
            ]}
          />
          <section className="space-y-3 rounded border p-4">
            <h3 className="text-xl">Collections by source</h3>
            <p>
              Completed production Square payments on record, including imported Square sales. Bank
              deposits and team receipt copies are not counted again. This is not profit: taxes,
              merchandise costs, payroll, external reimbursements, other expenses and manual
              receipts require their separate ledgers. Sync historical date ranges to complete
              provider coverage.
            </p>
            <p>
              {s.collections.missingFees
                ? `${s.collections.missingFees} payment(s) still need processing-fee details; the total after fees is not yet verified.`
                : `Collections after recorded refunds and processing fees: ${money(s.collections.afterFees || 0)}.`}
            </p>
            {s.collections.rows.map((r) => (
              <article key={r.category} className="rounded border p-3">
                <h4>
                  {r.category} · {r.count} payment(s)
                </h4>
                <p>
                  Gross {money(r.gross)} · Refunds {money(r.refunds)} · Known fees{" "}
                  {money(r.knownFees)} · After refunds and fees{" "}
                  {r.afterFees === null ? "Needs fee details" : money(r.afterFees)}
                </p>
              </article>
            ))}
          </section>
          <Form
            title="Sync Square settlements"
            busy={busy}
            fields={[
              field("from", "Start date (up to 31 days)", "date", today()),
              field("to", "End date", "date", today()),
            ]}
            onSave={async (v) => run(() => syncFinanceSquare({ data: { from: v.from, to: v.to } }))}
          >
            <p>
              Read-only import of Square deposits and their underlying payment/refund entries.
              Repeat date ranges to import older history. Pending transfers are not a complete live
              Square balance.
            </p>
          </Form>
          {values("settlement").map((p) => (
            <details key={p.id} className="rounded-xl border p-3">
              <summary>
                {p.date} · {money(p.amount)} · {p.status} · {p.environment} ·{" "}
                {p.bankId ? "Bank reconciled" : "Needs bank match"}
              </summary>
              <p>Square payout {p.squareId}</p>
              {p.entries.map((e: any) => (
                <p key={e.id}>
                  {e.type} · Payment {e.paymentId || "Adjustment"} · Gross {money(e.gross)} · Fee{" "}
                  {money(e.fee)} · Net {money(e.net)}
                </p>
              ))}
            </details>
          ))}
          <h3 className="text-xl">Customer payments</h3>
          <details>
            <summary>Payment history ({data.sources.payments.length})</summary>
            {data.sources.payments.map((p) => (
              <p key={p.id}>
                {p.created_at.slice(0, 10)} · {p.customer} · {p.category} · {money(p.amount_cents)}{" "}
                · {p.status} · {p.environment} · Processing fee{" "}
                {p.processingFee === null ? "not reported yet" : money(p.processingFee || 0)} ·
                Square {p.id}
              </p>
            ))}
          </details>
          <h3 className="text-xl">Refunds</h3>
          <a className="underline" href="/office?section=payments">
            Open Square payment and refund tools
          </a>
          <p>
            Use Square to return money to the original payment method. External reimbursement
            requires a definitively failed Square refund and a separate admin approval.
          </p>
          {data.sources.refunds.map((r) => (
            <article key={r.id} className="rounded-xl border bg-white p-4">
              <p>
                {money(r.amount_cents)} · {r.status} ·{" "}
                {r.external_status ? "External reimbursement" : ""}
              </p>
              <p>
                {r.reason} · Original payment {r.square_payment_id} · Refund{" "}
                {r.square_refund_id || "Awaiting provider ID"}
              </p>
              {["failed", "rejected"].includes(r.status) && !r.external_status && (
                <Form
                  title="Approve external refund"
                  busy={busy}
                  fields={[
                    options("payeeId", "Recipient", payeeOptions),
                    field("due", "Reimbursement due date", "date"),
                    field("reason", "Why Square cannot complete this refund"),
                  ]}
                  onSave={async (v) =>
                    save(
                      {
                        action: "externalRefund",
                        refundId: r.id,
                        payeeId: v.payeeId,
                        due: v.due,
                        providerFailureConfirmed: true,
                      },
                      v.reason,
                    )
                  }
                >
                  <label className="flex gap-2">
                    <input type="checkbox" required />I reviewed Square’s final failure and approve
                    external reimbursement.
                  </label>
                </Form>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "Compensation Rules" && (
        <>
          <p>
            Existing instructor percentages remain the default. These admin rules apply when Finance
            accruals are refreshed. Approved/paid historical compensation is not silently
            recalculated. Coach compensation accrues evenly over the published team season; use a
            documented payable override for another agreed schedule.
          </p>
          <Form
            title="Add instructor compensation rule"
            busy={busy}
            fields={ruleFields}
            onSave={async (v) =>
              save({
                action: "rule",
                value: {
                  id: uuid(),
                  payeeId: v.payeeId,
                  serviceId: v.serviceId,
                  mode: v.mode,
                  effectiveFrom: v.effectiveFrom,
                  value: Math.round(Number(v.value) * 100),
                },
              })
            }
          />
          {values("rule").map((r) => (
            <article key={r.id} className="rounded-xl border p-4">
              <p>
                {payeeName(r.payeeId)} ·{" "}
                {data.sources.services.find((s) => s.id === r.serviceId)?.name || r.serviceId} ·{" "}
                {r.mode} · {r.mode === "percent" ? r.value / 100 + "%" : money(r.value)}
              </p>
            </article>
          ))}
        </>
      )}
      {tab === "Audit" && (
        <>
          <p>
            Financial history is append-only. Latest 200 changes are shown; prior entries remain
            stored.
          </p>
          {data.audit.map((a, i) => (
            <details key={i} className="rounded-xl border p-3">
              <summary>
                {a.created_at} · {a.action} · {a.reason}
              </summary>
              <p>
                Actor {a.actor_id} · Record {a.record_id}
              </p>
              <pre className="max-w-full overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify({ before: a.before_state, after: a.after_state }, null, 2)}
              </pre>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
