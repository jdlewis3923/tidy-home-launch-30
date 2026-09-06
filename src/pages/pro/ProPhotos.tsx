/**
 * Visit photos — /pro/visit/:id/photos
 * At least one before and one after photo is required before a visit can be
 * completed. Photos live in a private bucket and are shown through short-lived
 * signed URLs only.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ProShell from "@/components/pro/portal/ProShell";
import { ErrorState, PhotoThumb, ScheduleSkeleton, UploadTile } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import {
  fetchVisitPhotos, removeVisitPhoto, signedPhotoUrl, uploadVisitPhoto, type VisitPhoto,
} from "@/lib/pro-portal";

type Loaded = VisitPhoto & { url: string | null };

export default function ProPhotos() {
  const { id } = useParams<{ id: string }>();
  const { userId, reload } = useProSession();
  const [photos, setPhotos] = useState<Loaded[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(false);
    try {
      const rows = await fetchVisitPhotos(id);
      const withUrls = await Promise.all(
        rows.map(async (p) => ({ ...p, url: await signedPhotoUrl(p.storage_path) })),
      );
      setPhotos(withUrls);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async (kind: "before" | "after", files: FileList) => {
    if (!id || !userId) return;
    setBusy(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 12 * 1024 * 1024) {
          setUploadError("Photos need to be under 12 MB each.");
          continue;
        }
        await uploadVisitPhoto(id, userId, kind, file);
      }
      await load();
      reload();
    } catch {
      setUploadError("That upload didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photo: Loaded) => {
    setBusy(true);
    try {
      await removeVisitPhoto(photo);
      await load();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const group = (kind: string) => (photos ?? []).filter((p) => p.kind === kind);

  return (
    <ProShell title="Photos" back={`/pro/visit/${id}`}>
      {!photos && !error && <ScheduleSkeleton />}
      {error && <ErrorState title="Couldn't load photos" onRetry={() => void load()} />}
      {photos && !error && (
        <div className="space-y-6 p-4">
          {(["before", "after"] as const).map((kind) => (
            <section key={kind}>
              <h2 className="pb-2 text-[13px] font-extrabold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
                {kind} · {group(kind).length} uploaded
              </h2>
              <UploadTile
                label={`Add ${kind} photos`}
                disabled={busy}
                onPick={(files) => void pick(kind, files)}
              />
              {group(kind).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {group(kind).map((p) => (
                    <PhotoThumb key={p.id} url={p.url} onRemove={() => void remove(p)} />
                  ))}
                </div>
              )}
            </section>
          ))}
          {uploadError && (
            <p className="rounded-xl bg-[hsl(var(--pro-red-soft))] p-3 text-[14px] font-semibold text-[hsl(var(--pro-red))]">
              {uploadError}
            </p>
          )}
          <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
            One before photo and one after photo are required to complete a visit. Photos are private
            to Tidy and the customer's own visit record.
          </p>
        </div>
      )}
    </ProShell>
  );
}
