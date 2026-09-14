// Converts Docsie "video to docs" markdown into chapters we can map onto
// manual steps. Pure functions — safe on client and server.

export interface DocsieChapter {
  /** Stable index-based key */
  key: string;
  title: string;
  /** Paragraph/list content rendered as simple HTML for the step editor */
  html: string;
  /** Absolute image URLs found in the chapter, in order */
  images: string[];
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Minimal inline markdown → HTML (bold, italic, code, links).
function inline(md: string): string {
  let out = escapeHtml(md);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2">$1</a>',
  );
  return out;
}

const IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

function blockToHtml(lines: string[]): string {
  const parts: string[] = [];
  let list: string[] | null = null;
  let ordered = false;

  const flush = () => {
    if (list && list.length) {
      parts.push(
        `<${ordered ? "ol" : "ul"}>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`,
      );
    }
    list = null;
  };

  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      parts.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flush();
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      if (!list) {
        list = [];
        ordered = Boolean(ol);
      }
      list.push((ul?.[1] ?? ol?.[1] ?? "").trim());
      continue;
    }
    // Sub-headings inside a chapter become bold lines.
    const h = line.match(/^#{3,6}\s+(.*)$/);
    if (h) {
      flushPara();
      flush();
      parts.push(`<p><strong>${inline(h[1].trim())}</strong></p>`);
      continue;
    }
    flush();
    para.push(line.trim());
  }
  flushPara();
  flush();
  return parts.join("");
}

/** Split Docsie markdown into chapters on `##` headings. */
export function parseDocsieMarkdown(markdown: string): DocsieChapter[] {
  const text = (markdown ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const chapters: DocsieChapter[] = [];
  let currentTitle = "";
  let buffer: string[] = [];
  let started = false;

  const push = () => {
    const body = buffer.join("\n");
    const images = Array.from(body.matchAll(IMAGE_RE)).map((m) => m[1]);
    const withoutImages = body.replace(IMAGE_RE, "");
    const html = blockToHtml(withoutImages.split("\n"));
    if (!currentTitle && !html && images.length === 0) return;
    chapters.push({
      key: `ch-${chapters.length}`,
      title: currentTitle || `Section ${chapters.length + 1}`,
      html,
      images,
    });
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h2) {
      if (started) push();
      started = true;
      currentTitle = h2[1].trim();
      buffer = [];
      continue;
    }
    if (h1 && !started) {
      // Document title — skip, the job stores it separately.
      continue;
    }
    buffer.push(line);
  }
  if (started) push();
  else {
    currentTitle = "";
    push();
  }

  return chapters;
}

/** Best-guess step layout for a chapter. */
export function guessLayout(chapter: DocsieChapter): "one_col" | "two_col" {
  return chapter.images.length > 0 ? "two_col" : "one_col";
}

/** Pull the document title from markdown (first `#` heading), if present. */
export function markdownTitle(markdown: string): string | null {
  const m = (markdown ?? "").match(/^#\s+(.*)$/m);
  return m ? m[1].trim() : null;
}
