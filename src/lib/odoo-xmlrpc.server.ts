// Hand-rolled XML-RPC client for Odoo. The Worker runtime can't run Node-only
// XML-RPC libs, so we build the envelopes ourselves over fetch().
//
// Server-only by file extension — never imported from client-reachable code.

type XmlValue =
  | string
  | number
  | boolean
  | null
  | XmlValue[]
  | { [key: string]: XmlValue };

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!),
  );

function valueToXml(v: XmlValue): string {
  if (v === null || v === undefined) return "<value><nil/></value>";
  if (typeof v === "string") return `<value><string>${escapeXml(v)}</string></value>`;
  if (typeof v === "boolean") return `<value><boolean>${v ? "1" : "0"}</boolean></value>`;
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? `<value><int>${v}</int></value>`
      : `<value><double>${v}</double></value>`;
  }
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(valueToXml).join("")}</data></array></value>`;
  }
  const members = Object.entries(v)
    .map(
      ([k, val]) =>
        `<member><name>${escapeXml(k)}</name>${valueToXml(val)}</member>`,
    )
    .join("");
  return `<value><struct>${members}</struct></value>`;
}

function buildEnvelope(method: string, params: XmlValue[]): string {
  return `<?xml version="1.0"?><methodCall><methodName>${escapeXml(method)}</methodName><params>${params
    .map((p) => `<param>${valueToXml(p)}</param>`)
    .join("")}</params></methodCall>`;
}

// --- Minimal XML parser geared to Odoo's XML-RPC responses ----------------

function stripXmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "");
}

function parseValue(node: string): XmlValue {
  const trimmed = node.trim();
  // <value>...</value>
  const inner = trimmed.replace(/^<value>/, "").replace(/<\/value>$/, "").trim();

  if (inner === "" || inner === "<string/>") return "";
  if (inner.startsWith("<nil")) return null;

  const tagMatch = inner.match(/^<(\w+)(?:\s[^>]*)?>([\s\S]*)<\/\1>$/);
  if (!tagMatch) {
    // bare string (Odoo sometimes returns <value>text</value>)
    return decodeXmlEntities(inner);
  }
  const [, tag, body] = tagMatch;
  switch (tag) {
    case "string":
      return decodeXmlEntities(body);
    case "int":
    case "i4":
    case "i8":
      return parseInt(body, 10);
    case "double":
      return parseFloat(body);
    case "boolean":
      return body.trim() === "1";
    case "array": {
      const dataMatch = body.match(/<data>([\s\S]*)<\/data>/);
      if (!dataMatch) return [];
      return splitTopLevel(dataMatch[1], "value").map(parseValue);
    }
    case "struct": {
      const obj: Record<string, XmlValue> = {};
      for (const memberXml of splitTopLevel(body, "member")) {
        const inside = memberXml.replace(/^<member>/, "").replace(/<\/member>$/, "");
        const nameMatch = inside.match(/<name>([\s\S]*?)<\/name>/);
        const valStart = inside.indexOf("<value>");
        const valEnd = inside.lastIndexOf("</value>");
        if (nameMatch && valStart !== -1 && valEnd !== -1) {
          obj[decodeXmlEntities(nameMatch[1])] = parseValue(
            inside.slice(valStart, valEnd + "</value>".length),
          );
        }
      }
      return obj;
    }
    default:
      return decodeXmlEntities(body);
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

// Split a string into the top-level <tag>...</tag> spans of the given tag.
function splitTopLevel(body: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const openSelf = `<${tag} `;
  let i = 0;
  while (i < body.length) {
    let start = body.indexOf(open, i);
    const startSelf = body.indexOf(openSelf, i);
    if (start === -1 || (startSelf !== -1 && startSelf < start)) start = startSelf;
    if (start === -1) break;
    // find matching close, tracking nesting
    let depth = 0;
    let scan = start;
    while (scan < body.length) {
      const nextOpen = body.indexOf(`<${tag}`, scan + 1);
      const nextClose = body.indexOf(close, scan + 1);
      if (nextClose === -1) return out;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        // ensure it's actually our tag (not a prefix match)
        const ch = body[nextOpen + tag.length + 1];
        if (ch === ">" || ch === " ") depth++;
        scan = nextOpen;
      } else {
        if (depth === 0) {
          out.push(body.slice(start, nextClose + close.length));
          i = nextClose + close.length;
          break;
        }
        depth--;
        scan = nextClose;
      }
    }
    if (scan >= body.length) break;
  }
  return out;
}

function parseResponse(xml: string): XmlValue {
  const clean = stripXmlComments(xml);
  const faultMatch = clean.match(/<fault>([\s\S]*?)<\/fault>/);
  if (faultMatch) {
    const fv = parseValue(
      faultMatch[1].match(/<value>[\s\S]*<\/value>/)![0],
    ) as Record<string, XmlValue>;
    throw new Error(
      `Odoo XML-RPC fault ${fv?.faultCode ?? "?"}: ${fv?.faultString ?? "unknown"}`,
    );
  }
  const paramsMatch = clean.match(/<params>([\s\S]*?)<\/params>/);
  if (!paramsMatch) return null;
  const valueMatch = paramsMatch[1].match(/<value>[\s\S]*<\/value>/);
  if (!valueMatch) return null;
  return parseValue(valueMatch[0]);
}

// --- Public client --------------------------------------------------------

export type OdooCreds = {
  baseUrl: string;
  database: string;
  username: string;
  apiKey: string;
};

async function rpcCall(
  url: string,
  method: string,
  params: XmlValue[],
): Promise<XmlValue> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8" },
    body: buildEnvelope(method, params),
  });
  if (!res.ok) {
    throw new Error(`Odoo HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return parseResponse(text);
}

const normalizeUrl = (u: string) => u.replace(/\/+$/, "");

export async function odooAuthenticate(c: OdooCreds): Promise<number> {
  const result = (await rpcCall(
    `${normalizeUrl(c.baseUrl)}/xmlrpc/2/common`,
    "authenticate",
    [c.database, c.username, c.apiKey, {}],
  )) as number | false;
  if (!result || typeof result !== "number") {
    throw new Error("Authentication failed: Odoo returned no uid (check database, username, and API key).");
  }
  return result;
}

export async function odooExecuteKw<T = XmlValue>(
  c: OdooCreds,
  uid: number,
  model: string,
  method: string,
  args: XmlValue[],
  kwargs: Record<string, XmlValue> = {},
): Promise<T> {
  return (await rpcCall(
    `${normalizeUrl(c.baseUrl)}/xmlrpc/2/object`,
    "execute_kw",
    [c.database, uid, c.apiKey, model, method, args, kwargs],
  )) as T;
}
