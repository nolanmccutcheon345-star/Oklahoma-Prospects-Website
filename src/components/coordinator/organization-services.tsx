import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "../ui/button";
import {
  createOrganizationServiceDraft,
  getOrganizationServices,
  saveOrganizationService,
  setOrganizationServiceStatus,
} from "@/lib/coordinator/organization-services-api";
import {
  operationalServiceCreateInput,
  operationalServiceSaveInput,
  operationalServiceStatusInput,
  type OrganizationService,
} from "@/lib/coordinator/organization-services-contracts";

type CreateInput = z.infer<typeof operationalServiceCreateInput>;
type SaveInput = z.infer<typeof operationalServiceSaveInput>;
type StatusInput = z.infer<typeof operationalServiceStatusInput>;
const field = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request. Please try again.";
const categories = {
  lesson: "Lesson",
  package: "Lesson package",
  membership: "Lesson membership",
  cage: "Cage rental",
  cage_plan: "Cage membership",
  fee: "Service fee",
  team_plan: "Team plan",
};
const blank: CreateInput = {
  kind: "lesson",
  name: "",
  discipline: "",
  purpose: "",
  detail: "",
  featured: false,
  sortOrder: 0,
};
function metadata(service: OrganizationService): CreateInput {
  return {
    kind: service.kind,
    name: service.name,
    discipline: service.discipline,
    purpose: service.purpose,
    detail: service.detail,
    featured: service.featured,
    sortOrder: service.sortOrder,
  };
}
type Editor =
  { mode: "create"; input: CreateInput } | { mode: "edit"; service: OrganizationService };

function ServiceEditor({
  editor,
  busy,
  onSave,
  onCancel,
}: {
  editor: Editor;
  busy: boolean;
  onSave: (input: CreateInput | SaveInput) => Promise<void>;
  onCancel: () => void;
}) {
  const service = editor.mode === "edit" ? editor.service : null;
  const [input, setInput] = useState<CreateInput>(() =>
    service ? metadata(service) : (editor as { input: CreateInput }).input,
  );
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = service
      ? operationalServiceSaveInput.safeParse({
          id: service.id,
          revision: service.revision,
          sourceRevision: service.sourceRevision,
          name: input.name,
          purpose: input.purpose,
          detail: input.detail,
          featured: input.featured,
          sortOrder: input.sortOrder,
        })
      : operationalServiceCreateInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the service details.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label={service ? "Edit service details" : "Create service draft"}
    >
      <fieldset disabled={busy} className="grid min-w-0 gap-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-lg font-semibold">
          {service ? "Edit service details" : "New unpriced service draft"}
        </legend>
        {!service ? (
          <>
            <label className="grid gap-1">
              Service category
              <select
                className={field}
                value={input.kind}
                onChange={(event) =>
                  setInput({ ...input, kind: event.target.value as CreateInput["kind"] })
                }
              >
                {Object.entries(categories).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Discipline
              <input
                className={field}
                maxLength={2000}
                value={input.discipline}
                onChange={(event) => setInput({ ...input, discipline: event.target.value })}
              />
            </label>
          </>
        ) : (
          <p className="text-sm">
            {categories[service.kind]}
            {service.discipline ? ` · ${service.discipline}` : ""} · {service.status}
          </p>
        )}
        <label className="grid gap-1">
          Service name
          <input
            className={field}
            required
            maxLength={120}
            value={input.name}
            readOnly={Boolean(service && !service.nameEditable)}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
          />
        </label>
        {service && !service.nameEditable && (
          <p className="text-sm text-muted-foreground">
            This service name needs owner review to change. Public descriptions and display settings
            can be edited below.
          </p>
        )}
        <label className="grid gap-1">
          Public summary
          <textarea
            className={field}
            rows={3}
            maxLength={2000}
            value={input.purpose}
            onChange={(event) => setInput({ ...input, purpose: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Public description
          <textarea
            className={field}
            rows={4}
            maxLength={2000}
            value={input.detail}
            onChange={(event) => setInput({ ...input, detail: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Display order
          <input
            className={field}
            type="number"
            required
            min={0}
            max={10000}
            step={1}
            value={input.sortOrder}
            onChange={(event) => setInput({ ...input, sortOrder: event.target.valueAsNumber })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={input.featured}
            onChange={(event) => setInput({ ...input, featured: event.target.checked })}
          />
          Featured display
        </label>
        <p className="text-sm text-muted-foreground">
          {!service || service.financialApprovalRequired
            ? "Drafts cannot be purchased. An owner must review and approve the service and its financial terms before publication."
            : "Saving updates existing service descriptions and display settings. Keep descriptions consistent with the service currently offered."}
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : service ? "Save Service Details" : "Save Draft"}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function OrganizationServices({
  onSaved,
  onBusyChange,
}: {
  onSaved?: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [services, setServices] = useState<OrganizationService[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [statusChange, setStatusChange] = useState<StatusInput | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(false),
    request = useRef(0),
    pending = useRef(false);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await getOrganizationServices();
      if (mounted.current && id === request.current) setServices(result);
    } catch (cause) {
      if (mounted.current && id === request.current) {
        setServices(null);
        setEditor(null);
        setStatusChange(null);
        setError(message(cause));
      }
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  async function save(action: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (!mounted.current) return;
      setEditor(null);
      setStatusChange(null);
      setNotice(success);
      await load();
      if (mounted.current) await onSaved?.();
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      pending.current = false;
      onBusyChange?.(false);
      if (mounted.current) setBusy(false);
    }
  }
  const selected = services?.find((service) => service.id === selectedId) || services?.[0];
  const restoringDraft = statusChange?.status === "active" && statusChange.sourceRevision === null;
  return (
    <section className="grid min-w-0 gap-4" aria-label="Operational service catalog">
      <p className="text-sm">
        Create and copy unpriced drafts, edit service descriptions, or archive and reactivate
        approved services. Drafts require owner approval before customers can select them.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || loading || services === null}
          onClick={() => {
            setEditor({ mode: "create", input: { ...blank } });
            setStatusChange(null);
            setError("");
            setNotice("");
          }}
        >
          New Service Draft
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || loading}
          onClick={() => {
            setEditor(null);
            setStatusChange(null);
            setNotice("");
            void load();
          }}
        >
          Reload Services
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-green-800">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading services…</p>
      ) : (
        services && (
          <>
            {!services.length ? (
              <p>No services yet. Create an unpriced draft to send for owner review.</p>
            ) : (
              <>
                <label className="grid gap-1">
                  Service
                  <select
                    className={field}
                    value={selected?.id || ""}
                    disabled={busy}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                      setEditor(null);
                      setStatusChange(null);
                      setError("");
                      setNotice("");
                    }}
                  >
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} · {categories[service.kind]} · {service.status}
                      </option>
                    ))}
                  </select>
                </label>
                {selected && (
                  <article className="grid gap-3 rounded-lg border border-line p-4">
                    <h3 className="text-lg font-semibold">{selected.name}</h3>
                    <p className="text-sm">
                      Status: {selected.status}
                      {selected.financialApprovalRequired
                        ? " · Awaiting owner financial approval"
                        : ""}
                    </p>
                    <p className="text-sm">{selected.purpose}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditor({ mode: "edit", service: selected });
                          setStatusChange(null);
                          setError("");
                        }}
                      >
                        Edit Service Details
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditor({
                            mode: "create",
                            input: {
                              ...metadata(selected),
                              name: `${selected.name.slice(0, 113)} (copy)`,
                            },
                          });
                          setStatusChange(null);
                          setError("");
                        }}
                      >
                        Copy to New Draft
                      </Button>
                      {(selected.status !== "archived" ||
                        !selected.financialApprovalRequired ||
                        selected.sourceRevision === null) && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEditor(null);
                            setError("");
                            setStatusChange({
                              id: selected.id,
                              revision: selected.revision,
                              sourceRevision: selected.sourceRevision,
                              status: selected.status === "archived" ? "active" : "archived",
                              reason: "",
                            });
                          }}
                        >
                          {selected.status === "archived"
                            ? selected.sourceRevision === null
                              ? "Restore Draft"
                              : "Reactivate Service"
                            : "Archive Service"}
                        </Button>
                      )}
                    </div>
                  </article>
                )}
              </>
            )}
            {editor && (
              <ServiceEditor
                key={
                  editor.mode === "edit"
                    ? `${editor.service.id}:${editor.service.revision}:${editor.service.sourceRevision}`
                    : `new:${editor.input.name}`
                }
                editor={editor}
                busy={busy}
                onCancel={() => {
                  setEditor(null);
                  setError("");
                }}
                onSave={(input) =>
                  editor.mode === "create"
                    ? save(
                        () => createOrganizationServiceDraft({ data: input as CreateInput }),
                        "Unpriced draft saved for owner review. It is not available for purchase.",
                      )
                    : save(
                        () => saveOrganizationService({ data: input as SaveInput }),
                        "Service details saved.",
                      )
                }
              />
            )}
            {statusChange && (
              <form
                aria-label="Change service status"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  const parsed = operationalServiceStatusInput.safeParse(statusChange);
                  if (!parsed.success) {
                    setError(parsed.error.issues[0]?.message || "Enter a reason.");
                    return;
                  }
                  void save(
                    () => setOrganizationServiceStatus({ data: parsed.data }),
                    parsed.data.status === "archived"
                      ? "Service archived. Existing paid and prepared purchases remain supported."
                      : restoringDraft
                        ? "Draft restored for owner review. It remains unavailable for purchase."
                        : "Service reactivated for new selections.",
                  );
                }}
              >
                <fieldset disabled={busy} className="grid gap-3 rounded-lg border border-line p-4">
                  <legend className="px-1 font-semibold">
                    {statusChange.status === "archived"
                      ? "Archive service"
                      : restoringDraft
                        ? "Restore draft"
                        : "Reactivate service"}
                  </legend>
                  <p className="text-sm">
                    {statusChange.status === "archived"
                      ? "Archiving blocks new selections. Existing paid bookings and prepared purchases keep their agreed fulfillment."
                      : restoringDraft
                        ? "Restoring returns this unpriced draft to owner review. It does not publish a purchasable service."
                        : "Reactivating allows new selections using the existing owner-approved financial terms."}
                  </p>
                  <label className="grid gap-1">
                    Reason
                    <textarea
                      className={field}
                      required
                      minLength={5}
                      maxLength={500}
                      rows={3}
                      value={statusChange.reason}
                      onChange={(event) =>
                        setStatusChange({ ...statusChange, reason: event.target.value })
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>
                      {busy
                        ? "Saving…"
                        : statusChange.status === "archived"
                          ? "Confirm Archive"
                          : restoringDraft
                            ? "Confirm Restore Draft"
                            : "Confirm Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setStatusChange(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
          </>
        )
      )}
    </section>
  );
}
