import { useEffect, useState } from "react";
import { getAboutEditor, saveAbout } from "@/lib/website-content-api";
import type {
  AboutContent as AboutDocument,
  AboutEditorData,
} from "@/lib/website-content-contracts";
import { AboutContent } from "./about-content";
import { Button } from "./ui/button";

const fields: { key: keyof AboutDocument; label: string; max: number; multiline?: boolean }[] = [
  { key: "eyebrow", label: "Page label", max: 100 },
  { key: "title", label: "Headline", max: 140 },
  { key: "intro", label: "Introduction", max: 700, multiline: true },
  { key: "storyTitle", label: "Story heading", max: 100 },
  { key: "story", label: "Academy story", max: 5000, multiline: true },
  { key: "missionTitle", label: "Mission heading", max: 100 },
  { key: "mission", label: "Mission", max: 3000, multiline: true },
  { key: "philosophyTitle", label: "Philosophy heading", max: 100 },
  { key: "philosophy", label: "Development philosophy", max: 5000, multiline: true },
  { key: "seoTitle", label: "Search title", max: 100 },
  { key: "seoDescription", label: "Search description", max: 300, multiline: true },
];

export function AboutPageEditor() {
  const [data, setData] = useState<AboutEditorData>();
  const [content, setContent] = useState<AboutDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  function accept(result: AboutEditorData) {
    setData(result);
    setContent(result.draft);
  }
  useEffect(() => {
    let active = true;
    void getAboutEditor()
      .then((result) => {
        if (active) accept(result);
      })
      .catch(() => {
        if (active)
          setError("Could not load About page settings. Use Reload saved draft to try again.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function reload() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      accept(await getAboutEditor());
      setNotice("Saved draft reloaded.");
    } catch {
      setError("Could not reload About page settings. Your text has been kept.");
    } finally {
      setBusy(false);
    }
  }
  async function save(action: "draft" | "publish") {
    if (busy || !content || !data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      accept(await saveAbout({ data: { revision: data.revision, action, content } }));
      setNotice(
        action === "publish"
          ? "About page published. The live page now uses this version."
          : "About draft saved. The live page has not changed.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your text has been kept; please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const changed = content && data && JSON.stringify(content) !== JSON.stringify(data.draft);
  const unpublished = content && data && JSON.stringify(content) !== JSON.stringify(data.published);
  return (
    <section aria-label="About page editor" className="grid min-w-0 gap-5 pt-4">
      <h3 className="text-3xl">About page</h3>
      <p>
        Edit the academy story, mission and development philosophy. Save a draft to keep working,
        preview it here, then publish when it is ready. Use a blank line between paragraphs.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outlineDark" disabled={busy} onClick={() => void reload()}>
          Reload saved draft
        </Button>
        <a
          href="/about"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center underline"
        >
          View live About page
        </a>
      </div>
      <p className="text-sm text-muted">
        Reload replaces unsaved edits with the saved draft. Facility details and photos remain
        shared with the rest of the website.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-maroon p-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-paper-2 p-3">
          {notice}
        </p>
      )}
      {!data || !content ? (
        <p role="status">
          {error ? "About settings are unavailable until reloaded." : "Loading About page…"}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {changed
              ? "You have unsaved edits."
              : unpublished
                ? "Saved draft has unpublished changes."
                : "Draft matches the live page."}{" "}
            {data.publishedAt &&
              `Last published ${new Date(data.publishedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT.`}
          </p>
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const action = (
                (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
              )?.value;
              void save(action === "publish" ? "publish" : "draft");
            }}
          >
            <fieldset disabled={busy} className="grid min-w-0 gap-4">
              <legend className="sr-only">About page content</legend>
              {fields.map((field) => (
                <label key={field.key} className="grid min-w-0 gap-1 font-semibold">
                  {field.label}
                  {field.multiline ? (
                    <textarea
                      className="office-control font-normal"
                      required
                      rows={field.max > 700 ? 6 : 3}
                      maxLength={field.max}
                      value={content[field.key]}
                      onChange={(event) => {
                        setContent({ ...content, [field.key]: event.target.value });
                        setNotice("");
                      }}
                    />
                  ) : (
                    <input
                      className="office-control font-normal"
                      required
                      maxLength={field.max}
                      value={content[field.key]}
                      onChange={(event) => {
                        setContent({ ...content, [field.key]: event.target.value });
                        setNotice("");
                      }}
                    />
                  )}
                </label>
              ))}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" name="action" value="draft" variant="outlineDark">
                  Save About draft
                </Button>
                <Button
                  type="button"
                  variant="outlineDark"
                  aria-expanded={preview}
                  aria-controls="about-draft-preview"
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? "Hide About preview" : "Preview About page"}
                </Button>
                <Button type="submit" name="action" value="publish">
                  Publish About page
                </Button>
              </div>
            </fieldset>
          </form>
          {preview && (
            <section
              id="about-draft-preview"
              aria-label="About draft preview"
              className="min-w-0 overflow-hidden rounded-xl border border-line"
            >
              <p className="bg-paper-2 p-4 font-semibold">
                Draft preview — visible only here until published
              </p>
              <AboutContent content={content} />
            </section>
          )}
        </>
      )}
    </section>
  );
}
