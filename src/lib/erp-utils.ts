type NormalizedItem = {
  part_number: string;
  qty: number;
  description: string;
  unit: string;
  notes: string;
};

export function normalizeBomLines(
  lines: Array<Record<string, unknown>>,
  variantToTemplateSku?: Map<number, string>,
): NormalizedItem[] {
  return lines
    .map((line) => {
      const productField = line.product_id;
      let part = "";
      let desc = "";
      let variantId: number | null = null;
      if (Array.isArray(productField) && productField.length >= 2) {
        if (typeof productField[0] === "number") variantId = productField[0];
        const label = String(productField[1]);
        const match = label.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (match) {
          part = match[1];
          desc = match[2];
        } else {
          part = label;
          desc = label;
        }
      } else if (typeof productField === "string") {
        part = productField;
        desc = productField;
      }
      if (variantId !== null && variantToTemplateSku?.get(variantId)) {
        part = variantToTemplateSku.get(variantId)!;
      }
      const uomField = line.product_uom_id;
      const unit = Array.isArray(uomField) && uomField.length >= 2 ? String(uomField[1]) : "";
      return {
        part_number: part,
        qty: Number(line.product_qty ?? 0),
        description: desc,
        unit,
        notes: "",
      };
    })
    .sort(
      (a, b) =>
        a.part_number.localeCompare(b.part_number) ||
        a.description.localeCompare(b.description),
    );
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}