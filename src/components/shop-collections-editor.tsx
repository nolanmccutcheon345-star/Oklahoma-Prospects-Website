import { useState } from "react";
import { Button } from "./ui/button";
import { saveShopNavigation } from "@/lib/shop/api";
import type { ShopNavigation } from "@/lib/shop/collections";
const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-base";
export function ShopCollectionsEditor({
  navigation,
  revision,
  busy,
  run,
}: {
  navigation: ShopNavigation;
  revision: number;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [groups, setGroups] = useState(navigation);
  function move(index: number, direction: number) {
    const next = [...groups];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setGroups(next);
  }
  return (
    <details className="my-5 rounded-xl border border-line p-4" open>
      <summary className="cursor-pointer text-xl font-semibold">Shop collections & filters</summary>
      <p className="my-3 text-sm">
        The first group appears as collection tabs. Other groups appear as filters. Add, rename,
        reorder or remove groups and choices, then assign products below. Removing a choice leaves
        products and orders intact. Save product edits before changing these settings.
      </p>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => saveShopNavigation({ data: { revision, navigation: groups } }));
        }}
      >
        {groups.map((group, index) => (
          <fieldset key={group.id} className="min-w-0 rounded-xl bg-paper-2 p-4">
            <legend className="px-1 font-semibold">
              {index === 0 ? "Collection tabs" : "Filter group"} {index + 1}
            </legend>
            <label>
              Group name
              <input
                required
                maxLength={60}
                className={inputClass}
                value={group.label}
                onChange={(e) =>
                  setGroups(
                    groups.map((g) => (g.id === group.id ? { ...g, label: e.target.value } : g)),
                  )
                }
              />
            </label>
            <div className="my-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
              >
                Move group up
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy || index === groups.length - 1}
                onClick={() => move(index, 1)}
              >
                Move group down
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy}
                onClick={() => setGroups(groups.filter((g) => g.id !== group.id))}
              >
                Remove group
              </Button>
            </div>
            <div className="grid gap-3">
              {group.options.map((option, oi) => (
                <div
                  key={option.id}
                  className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <label>
                    Choice {oi + 1} in {group.label}
                    <input
                      required
                      maxLength={60}
                      className={inputClass}
                      value={option.label}
                      onChange={(e) =>
                        setGroups(
                          groups.map((g) =>
                            g.id === group.id
                              ? {
                                  ...g,
                                  options: g.options.map((o) =>
                                    o.id === option.id ? { ...o, label: e.target.value } : o,
                                  ),
                                }
                              : g,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <Button
                      type="button"
                      variant="outlineDark"
                      aria-label={`Move ${option.label} up`}
                      disabled={busy || oi === 0}
                      onClick={() =>
                        setGroups(
                          groups.map((g) => {
                            if (g.id !== group.id) return g;
                            const options = [...g.options];
                            [options[oi], options[oi - 1]] = [options[oi - 1], options[oi]];
                            return { ...g, options };
                          }),
                        )
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="outlineDark"
                      aria-label={`Move ${option.label} down`}
                      disabled={busy || oi === group.options.length - 1}
                      onClick={() =>
                        setGroups(
                          groups.map((g) => {
                            if (g.id !== group.id) return g;
                            const options = [...g.options];
                            [options[oi], options[oi + 1]] = [options[oi + 1], options[oi]];
                            return { ...g, options };
                          }),
                        )
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="outlineDark"
                      aria-label={`Remove ${option.label} from ${group.label}`}
                      disabled={busy}
                      onClick={() =>
                        setGroups(
                          groups.map((g) =>
                            g.id === group.id
                              ? { ...g, options: g.options.filter((o) => o.id !== option.id) }
                              : g,
                          ),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              className="mt-3"
              variant="outlineDark"
              disabled={busy || group.options.length >= 40}
              onClick={() =>
                setGroups(
                  groups.map((g) =>
                    g.id === group.id
                      ? {
                          ...g,
                          options: [...g.options, { id: crypto.randomUUID(), label: "New choice" }],
                        }
                      : g,
                  ),
                )
              }
            >
              Add choice to {group.label}
            </Button>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outlineDark"
            disabled={busy || groups.length >= 8}
            onClick={() =>
              setGroups([...groups, { id: crypto.randomUUID(), label: "New filter", options: [] }])
            }
          >
            Add filter group
          </Button>
          <Button type="submit" disabled={busy}>
            Save shop collections & filters
          </Button>
        </div>
      </form>
    </details>
  );
}
