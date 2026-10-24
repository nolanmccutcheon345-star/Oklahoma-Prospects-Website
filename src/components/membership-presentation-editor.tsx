import { buildPublicCatalog, type ClubService, type ServiceInput } from "@/lib/ops";
import { readServicePresentation, type ServicePresentation } from "@/lib/service-presentation";
import { MembershipCard } from "./pricing-cards";
import { Button } from "./ui/button";

const icons = ["baseball", "cage", "team", "field", "star", "shield"] as const;
export function MembershipPresentationEditor({
  value,
  onChange,
  services,
}: {
  value: ServiceInput;
  onChange: (value: ServiceInput) => void;
  services: ClubService[];
}) {
  const presentation = readServicePresentation(value.presentation);
  const change = (patch: Partial<ServicePresentation>) =>
    onChange({ ...value, presentation: { ...presentation, ...patch } });
  const preview = buildPublicCatalog([
    ...services.filter((s) => s.id !== value.id),
    {
      ...value,
      id: value.id || "membership-preview",
      active: true,
      presentationRevision: 1,
      presentation: { ...presentation, status: "published" },
      sort_order: value.sort_order || 0,
    } as ClubService,
  ]).cagePlans.find((p) => p.id === (value.id || "membership-preview"));
  return (
    <section
      className="grid gap-4 rounded-xl border border-line bg-white p-4"
      aria-label="Membership Presentation & Pricing"
    >
      <h4 className="text-2xl">Membership Presentation & Pricing</h4>
      <p className="text-sm">
        Monthly household cage access. Included hours also set the credits fulfilled for new
        purchases. Existing agreements and credited balances keep their agreed terms. Comparison
        settings change the display only.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Included hours per month
          <input
            className="office-control"
            type="number"
            min={1}
            max={166}
            step={1}
            required
            value={value.credits}
            onChange={(e) => {
              const credits = Number(e.target.value);
              onChange({
                ...value,
                credits,
                hours: credits,
                minutes: credits * 60,
                period: "/ month",
              });
            }}
          />
        </label>
        <label>
          Display order
          <input
            className="office-control"
            type="number"
            min={0}
            max={10000}
            step={1}
            value={value.sort_order || 0}
            onChange={(e) => onChange({ ...value, sort_order: Number(e.target.value) })}
          />
        </label>
        <label>
          Publication status
          <select
            className="office-control"
            aria-label="Publication status"
            value={presentation.status}
            onChange={(e) => {
              const status = e.target.value as ServicePresentation["status"];
              onChange({
                ...value,
                active: status === "published",
                presentation: { ...presentation, status },
              });
            }}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          Card icon
          <select
            className="office-control"
            aria-label="Card icon"
            value={presentation.icon}
            onChange={(e) => change({ icon: e.target.value as ServicePresentation["icon"] })}
          >
            {icons.map((icon) => (
              <option key={icon}>{icon}</option>
            ))}
          </select>
        </label>
        <label>
          Badge
          <input
            className="office-control"
            maxLength={32}
            value={presentation.badge}
            onChange={(e) => change({ badge: e.target.value })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={value.featured}
            onChange={(e) => onChange({ ...value, featured: e.target.checked })}
          />
          Highlight this plan
        </label>
        <label>
          Comparison resource
          <select
            className="office-control"
            aria-label="Comparison resource"
            value={presentation.comparisonResourceId}
            onChange={(e) => change({ comparisonResourceId: e.target.value })}
          >
            <option value="">No savings comparison</option>
            <option value="individual">Individual cage — live hourly rate</option>
          </select>
        </label>
        <label>
          Usage basis
          <select
            className="office-control"
            aria-label="Usage basis"
            value={presentation.calculationBasis}
            onChange={(e) =>
              change({
                calculationBasis: e.target.value as ServicePresentation["calculationBasis"],
              })
            }
          >
            <option value="included">All included monthly hours</option>
            <option value="assumed">Assumed monthly usage</option>
          </select>
        </label>
        {presentation.calculationBasis === "assumed" && (
          <label>
            Assumed hours per month
            <input
              type="number"
              min={0.25}
              max={value.credits}
              step={0.25}
              required
              className="office-control"
              value={presentation.assumedMonthlyMinutes / 60}
              onChange={(e) =>
                change({ assumedMonthlyMinutes: Math.round(Number(e.target.value) * 60) })
              }
            />
          </label>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={presentation.showEffectiveRate}
            onChange={(e) => change({ showEffectiveRate: e.target.checked })}
          />
          Show effective hourly rate
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={presentation.showSavings}
            onChange={(e) => change({ showSavings: e.target.checked })}
          />
          Show calculated savings
        </label>
      </div>
      {value.hours !== value.credits || value.minutes !== value.credits * 60 ? (
        <p role="alert">
          The stored display allowance differs from fulfillment credits. Confirm included hours
          above before saving; this does not rewrite existing credited balances.
        </p>
      ) : null}
      <fieldset className="grid gap-3">
        <legend className="font-semibold">Structured benefits</legend>
        <p className="text-sm">
          Describe the existing entitlement and restrictions accurately. Editing benefit text does
          not change booking rules.
        </p>
        {presentation.benefits.map((benefit, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
            <label>
              Benefit {i + 1} icon
              <select
                className="office-control"
                aria-label={`Benefit ${i + 1} icon`}
                value={benefit.icon}
                onChange={(e) =>
                  change({
                    benefits: presentation.benefits.map((b, n) =>
                      n === i ? { ...b, icon: e.target.value as typeof b.icon } : b,
                    ),
                  })
                }
              >
                {icons.map((icon) => (
                  <option key={icon}>{icon}</option>
                ))}
              </select>
            </label>
            <label>
              Benefit {i + 1} text
              <input
                className="office-control"
                required
                maxLength={250}
                value={benefit.text}
                onChange={(e) =>
                  change({
                    benefits: presentation.benefits.map((b, n) =>
                      n === i ? { ...b, text: e.target.value } : b,
                    ),
                  })
                }
              />
            </label>
            <Button
              type="button"
              variant="outlineDark"
              aria-label={`Remove benefit ${i + 1}`}
              onClick={() => change({ benefits: presentation.benefits.filter((_, n) => n !== i) })}
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outlineDark"
            disabled={presentation.benefits.length >= 12}
            onClick={() =>
              change({ benefits: [...presentation.benefits, { icon: "baseball", text: "" }] })
            }
          >
            Add benefit
          </Button>
        </div>
      </fieldset>
      <div className="max-w-md">
        <p className="mb-3 font-semibold">Live card preview</p>
        {preview && <MembershipCard plan={preview} preview />}
      </div>
      <p className="text-sm text-muted">
        Presentation revision {value.presentationRevision || 0}. Changes are recorded with the
        editor and time.
      </p>
    </section>
  );
}
