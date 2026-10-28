import { useEffect, useState } from "react";
import type { UniformPhoto } from "@/lib/teams/fee-contracts";
import { getTeamUniform } from "@/lib/teams/fee-api";
import { Button } from "../ui/button";

export async function prepareUniformPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10_000_000)
    throw Error("Choose a JPEG, PNG or WebP photo smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Photo processing is unavailable. Please try again.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const src = canvas.toDataURL("image/jpeg", quality);
      if (src.length <= 180000) return src;
    }
    throw Error("This photo is too detailed to save. Crop it closer to the uniform and try again.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function UniformGallery({ name, photos = [] }: { name: string; photos?: UniformPhoto[] }) {
  return photos.length ? (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {photos.map((photo, index) => (
        <figure key={photo.id} className="min-w-0 rounded-xl border border-line bg-white p-2">
          <img
            src={photo.src}
            alt={photo.caption || `${name} — photo ${index + 1}`}
            className="h-64 w-full rounded-lg object-contain"
            loading="lazy"
          />
          {photo.caption && (
            <figcaption className="mt-2 break-words text-sm">{photo.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted">No uniform photos have been added yet.</p>
  );
}

export function UniformPhotoEditor({
  name,
  photos = [],
  onChange,
  onProcessing,
  disabled = false,
}: {
  name: string;
  photos?: UniformPhoto[];
  onChange: (photos: UniformPhoto[]) => void;
  onProcessing: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="grid min-w-0 gap-3 sm:col-span-2">
      <p className="font-semibold">Uniform photos</p>
      <p className="text-sm">
        Add up to four photos of this package. Coaches and team families see these after you save
        the draft. JPEG, PNG or WebP, up to 10 MB each.
      </p>
      <label className="grid min-w-0 gap-2 text-sm">
        Upload uniform photos
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || busy || photos.length >= 4}
          className="min-h-11 w-full min-w-0 max-w-full rounded border p-2"
          onChange={async (e) => {
            const files = Array.from(e.currentTarget.files || []);
            e.currentTarget.value = "";
            if (!files.length) return;
            setError("");
            if (files.length + photos.length > 4) {
              setError("Keep up to four photos per package. Remove a photo before adding another.");
              return;
            }
            setBusy(true);
            onProcessing(true);
            try {
              const added: UniformPhoto[] = [];
              for (const file of files)
                added.push({
                  id: crypto.randomUUID(),
                  caption: "",
                  src: await prepareUniformPhoto(file),
                });
              onChange([...photos, ...added]);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not read this photo.");
            } finally {
              setBusy(false);
              onProcessing(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Preparing photos…</p>}
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {photos.map((photo, index) => (
        <div className="grid min-w-0 gap-2 rounded-xl border p-3" key={photo.id}>
          <img
            src={photo.src}
            alt={photo.caption || `${name} — photo ${index + 1}`}
            className="h-56 w-full object-contain"
          />
          <label className="grid gap-1 text-sm">
            Photo {index + 1} caption
            <input
              className="office-control min-w-0 w-full"
              maxLength={120}
              placeholder="Example: Navy jersey — front"
              value={photo.caption}
              disabled={disabled || busy}
              onChange={(e) =>
                onChange(
                  photos.map((p) => (p.id === photo.id ? { ...p, caption: e.target.value } : p)),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="outlineDark"
            disabled={disabled || busy}
            onClick={() => onChange(photos.filter((p) => p.id !== photo.id))}
          >
            Remove photo {index + 1}
          </Button>
        </div>
      ))}
      {photos.length > 0 && (
        <p className="text-sm">
          Save draft & expenses to keep photo uploads, captions and removals.
        </p>
      )}
    </div>
  );
}

export function SelectedTeamUniform({ teamId }: { teamId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeamUniform>>>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let request = 0;
    const load = () => {
      const current = ++request;
      setData(undefined);
      setError("");
      getTeamUniform({ data: { teamId } })
        .then((d) => {
          if (active && current === request) setData(d);
        })
        .catch((e) => {
          if (active && current === request)
            setError(e.message || "Could not load the team uniform.");
        });
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === teamId) load();
    };
    load();
    window.addEventListener("team-uniform-updated", changed);
    return () => {
      active = false;
      window.removeEventListener("team-uniform-updated", changed);
    };
  }, [teamId]);
  if (error) return <p role="alert">{error}</p>;
  if (data === undefined) return <p>Loading team uniform…</p>;
  if (!data) return <p>No uniform package has been selected for this team yet.</p>;
  return (
    <div className="my-3 grid min-w-0 gap-3">
      <h3 className="text-xl">{data.name}</h3>
      {data.items && <p className="text-sm">{data.items}</p>}
      <UniformGallery name={data.name} photos={data.photos} />
    </div>
  );
}
