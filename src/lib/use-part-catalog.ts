// React-Query wired hook around the part catalog server fns. Loads all
// entries for an org once and exposes optimistic-ish mutation callbacks used
// by the manual editor's Parts / Hardware kit rows and the catalog admin.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listPartCatalog,
  upsertPartCatalogAlias,
  uploadPartCatalogImage,
  clearPartCatalogImage,
  deletePartCatalogEntry,
  type PartCatalogRow,
} from "@/lib/part-catalog.functions";
import type { PartCatalogControls } from "@/components/manual-editor/ManualListEditors";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => {
      const s = String(r.result ?? "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

export function usePartCatalog(orgId: string, isAdmin: boolean) {
  const qc = useQueryClient();
  const list = useServerFn(listPartCatalog);
  const upsertAlias = useServerFn(upsertPartCatalogAlias);
  const uploadImage = useServerFn(uploadPartCatalogImage);
  const clearImage = useServerFn(clearPartCatalogImage);
  const remove = useServerFn(deletePartCatalogEntry);

  const query = useQuery({
    queryKey: ["part-catalog", orgId],
    queryFn: () => list({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });

  const map = useMemo(() => {
    const m = new Map<string, PartCatalogRow>();
    for (const r of query.data ?? []) {
      if (r.sku) m.set(r.sku, r);
    }
    return m;
  }, [query.data]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["part-catalog", orgId] });

  const aliasMut = useMutation({
    mutationFn: (v: { sku: string; alias: string | null }) =>
      upsertAlias({
        data: { organizationId: orgId, sku: v.sku, alias: v.alias },
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMut = useMutation({
    mutationFn: async (v: { sku: string; file: File }) => {
      if (v.file.size > 3 * 1024 * 1024) {
        throw new Error("Image must be under 3 MB");
      }
      const dataBase64 = await readAsBase64(v.file);
      return uploadImage({
        data: {
          organizationId: orgId,
          sku: v.sku,
          filename: v.file.name,
          contentType: v.file.type || "image/jpeg",
          dataBase64,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Part image saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearImageMut = useMutation({
    mutationFn: (id: string) => clearImage({ data: { id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const controls: PartCatalogControls = {
    catalog: map,
    isAdmin,
    onAliasChange: useCallback(
      (sku, alias) => aliasMut.mutate({ sku, alias }),
      [aliasMut],
    ),
    onImageUpload: useCallback(
      (sku, file) => uploadMut.mutate({ sku, file }),
      [uploadMut],
    ),
    onImageClear: useCallback(
      (id) => clearImageMut.mutate(id),
      [clearImageMut],
    ),
  };

  return {
    query,
    map,
    controls,
    deleteEntry: (id: string) => deleteMut.mutate(id),
  };
}
