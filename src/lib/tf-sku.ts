export const extractTfBaseSku = (value?: string | false | null): string | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/\b(TF\d{6})\b/i);
  return match ? match[1].toUpperCase() : null;
};

export const normalizeLookupSku = (value: string): string =>
  extractTfBaseSku(value) ?? value.trim().toUpperCase();

export const normalizeManualSku = (value: string): string =>
  extractTfBaseSku(value) ?? value.trim().toUpperCase();

export const bomBaseSku = (sku: string, templateSku?: string | null): string =>
  extractTfBaseSku(templateSku) ?? extractTfBaseSku(sku) ?? sku.trim().toUpperCase();

export const isMainTfSku = (value: string | false | null | undefined): value is string =>
  typeof value === "string" && /^TF\d{6}$/i.test(value.trim());

export const extractLeadingMainTfSku = (value: string | false | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const bracketed = trimmed.match(/^\[(TF\d{6})\]\s+/i);
  if (bracketed) return bracketed[1].toUpperCase();
  const plain = trimmed.match(/^(TF\d{6})\s*(?:\||$)/i);
  return plain ? plain[1].toUpperCase() : null;
};

export const deriveMainTfSkuForQuery = ({
  query,
  templateCode,
  variantCode,
  labels,
}: {
  query: string;
  templateCode?: string | null;
  variantCode?: string | null;
  labels: Array<string | false | null | undefined>;
}): string | null => {
  const prefix = query.toUpperCase();
  const templateBase = extractTfBaseSku(templateCode);
  if (templateBase && templateBase.startsWith(prefix)) return templateBase;
  const variantBase = extractTfBaseSku(variantCode);
  if (variantBase && variantBase.startsWith(prefix)) return variantBase;
  if (templateCode && isMainTfSku(templateCode) && templateCode.toUpperCase().startsWith(prefix)) {
    return templateCode.toUpperCase();
  }
  if (variantCode && isMainTfSku(variantCode) && variantCode.toUpperCase().startsWith(prefix)) {
    return variantCode.toUpperCase();
  }
  for (const label of labels) {
    const leading = extractLeadingMainTfSku(label);
    if (leading && leading.startsWith(prefix)) return leading;
  }
  return null;
};