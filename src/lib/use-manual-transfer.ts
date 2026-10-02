// React hook wiring manual export/import to the server functions.
import { useServerFn } from "@tanstack/react-start";
import { getManualExport, createImportedManual } from "./manual-transfer.functions";
import { uploadManualAssetFile, uploadManualCoverImage, saveDraftContent } from "./manuals.functions";
import {
  buildManualBundle,
  bundleFilename,
  downloadBlob,
  mimeFor,
  readManualBundle,
  remapIds,
  zipFileBase64,
} from "./manual-bundle";

export function useManualTransfer() {
  const fetchExport = useServerFn(getManualExport);
  const createImported = useServerFn(createImportedManual);
  const uploadAsset = useServerFn(uploadManualAssetFile);
  const uploadCover = useServerFn(uploadManualCoverImage);
  const saveDraft = useServerFn(saveDraftContent);

  const exportManual = async (manualId: string, versionId?: string) => {
    const data = JSON.parse(await fetchExport({ data: { manualId, versionId } })) as Parameters<typeof buildManualBundle>[0];
    const { blob, missing } = await buildManualBundle(data);
    downloadBlob(blob, bundleFilename(data.title));
    return { title: data.title, missing };
  };

  const importManual = async (organizationId: string, file: File) => {
    const { zip, manifest } = await readManualBundle(file);
    const created = await createImported({
      data: {
        organizationId,
        title: manifest.title,
        sku: manifest.product.sku,
        name: manifest.product.name,
        description: manifest.product.description,
      },
    });

    const idMap = new Map<string, string>();
    let missing = 0;
    for (const a of manifest.assets) {
      const path = manifest.assetFiles[a.id];
      const b64 = path ? await zipFileBase64(zip, path) : null;
      if (!path || !b64) { missing++; continue; }
      const caption = typeof a.metadata?.["caption"] === "string" ? (a.metadata["caption"] as string) : undefined;
      const asset = await uploadAsset({
        data: { versionId: created.versionId, filename: path.split("/").pop()!, contentType: mimeFor(path), dataBase64: b64, caption },
      });
      idMap.set(a.id, (asset as { id: string }).id);
    }

    const content = remapIds(manifest.content, idMap) as Record<string, unknown>;
    if (manifest.cover) {
      const b64 = await zipFileBase64(zip, manifest.cover);
      if (b64) {
        const { url } = await uploadCover({
          data: { manualId: created.manualId, filename: manifest.cover, contentType: mimeFor(manifest.cover), dataBase64: b64 },
        });
        content["hero_image_url"] = url;
      }
    } else if (content["hero_image_url"]) {
      content["hero_image_url"] = null;
    }

    await saveDraft({ data: { versionId: created.versionId, content, changeSummary: "Imported from a manual export" } });
    return { ...created, missing };
  };

  return { exportManual, importManual };
}
