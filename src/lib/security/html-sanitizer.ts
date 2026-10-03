/**
 * Rich-text HTML sanitizer for journal content.
 *
 * Journal content is stored as HTML (the editor is a `contentEditable`
 * `RichTextEditor`) and is written back into `innerHTML` when an entry is
 * reopened, so unescaped markup in the database is a stored-XSS sink. This
 * module is the single place that decides what markup is allowed, and it runs
 * on both sides of that sink:
 *
 *   - on write  (`journal.service.ts`), so nothing unsafe is ever persisted;
 *   - on render (`JournalRichText`, `RichTextEditor` load), so content that
 *     predates this module — or that was written before it existed — is
 *     cleaned on the way out.
 *
 * It is a real tokenizer, not a regex chain. The previous helper,
 * `sanitizeHtml` in `./sanitize`, deletes every tag it can see, which both
 * destroys all formatting (`<b>hi</b>` becomes `hi`) and is bypassable: its
 * `/<[^>]*>?/gm` consumes up to the first `>`, so `<scr<script>ipt>` folds
 * into a live `<script>`. That helper is still used where tag-stripping is
 * genuinely what is wanted (log redaction) and is untouched by this change.
 *
 * Deliberately dependency-free: it must be importable from a `'use client'`
 * file and from a Vitest `node`-environment test, so it cannot pull in
 * `jsdom` (dev-only here) or DOMPurify (not installed). That is also why the
 * allowlist is spelled out here instead of pulled from a library config.
 *
 * What survives: paragraphs, line breaks, bold/italic/underline/strike,
 * ordered and unordered lists, blockquotes, inline and block code, h1–h4
 * rules, horizontal rules, links with a safe scheme, and the `span`/`div`
 * wrappers `contentEditable` emits. Everything else is unwrapped — its text
 * is kept, its markup is not.
 */

/** Elements emitted verbatim when they are present. */
export const RICH_TEXT_ALLOWED_TAGS: readonly string[] = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strike',
  'strong',
  'u',
  'ul',
];

/**
 * Elements whose *content* is discarded along with the tag. Unwrapping is
 * right for an unknown presentational element, but wrong for these: their
 * text is code, not prose (`script`, `style`), or not text at all
 * (`template`, `svg`, `textarea`).
 */
const DROP_WITH_CONTENT = new Set([
  'applet',
  'audio',
  'base',
  'body',
  'button',
  'canvas',
  'dialog',
  'embed',
  'form',
  'frame',
  'frameset',
  'head',
  'html',
  'iframe',
  'input',
  'link',
  'listing',
  'map',
  'math',
  'meta',
  'noembed',
  'noframes',
  'noscript',
  'object',
  'optgroup',
  'option',
  'plaintext',
  'portal',
  'script',
  'select',
  'slot',
  'source',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
  'track',
  'video',
  'xmp',
]);

/** Never nest these — a browser would move them out of their parent. */
const SELF_CLOSING = new Set(['br', 'hr']);

/** Attributes allowed on any allowed element. */
const GLOBAL_ATTRIBUTES = new Set(['title']);

/** Extra attributes allowed on specific elements. */
const ELEMENT_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  a: new Set(['href']),
};

/**
 * URL schemes a journal link may use. Everything else — `javascript:`,
 * `data:`, `vbscript:`, `file:` — is dropped, because `href` is the one
 * attribute here that can execute.
 */
const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

const NAMED_ENTITY_SCHEMES: Record<string, string> = {
  amp: '&',
  apos: "'",
  colon: ':',
  gt: '>',
  lt: '<',
  newline: '\n',
  quot: '"',
  tab: '\t',
};

/**
 * Decode one numeric character reference. Returns '' for a value `String
 * .fromCodePoint` would throw on (`&#99999999;` is legal input to a browser,
 * which renders nothing) — an unparsable reference must not be able to abort
 * sanitization.
 */
function fromCodePointSafe(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Decode the entity forms that can hide a scheme inside an `href`, because the
 * sanitizer's output is re-parsed as HTML: `java&#115;cript:` and
 * `javascript&colon;` both reach the browser as `javascript:`.
 */
function decodeEntitiesForUrlCheck(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      fromCodePointSafe(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);?/g, (_, dec: string) => fromCodePointSafe(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const decoded = NAMED_ENTITY_SCHEMES[name.toLowerCase()];
      return decoded ?? match;
    });
}

/**
 * True when `href` is safe to emit. Relative and fragment links are allowed;
 * an absolute link must name a scheme from the allowlist.
 */
export function isSafeJournalHref(rawHref: string): boolean {
  // Control characters and newlines are stripped by URL parsers, so
  // `java\tscript:` is a live `javascript:` link. Remove them before matching.
  const cleaned = rawHref.replace(/[\u0000-\u0020\u007f]/g, '');
  if (cleaned.length === 0) return false;

  const decoded = decodeEntitiesForUrlCheck(cleaned).trim();
  if (decoded.length === 0) return false;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
  if (!scheme) return true; // relative, fragment or query-only link

  return SAFE_URL_SCHEMES.has(scheme[1]!.toLowerCase());
}

/** Escape text content, leaving already-encoded entities intact. */
function escapeText(value: string): string {
  return value
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]{1,31};|#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a value destined for a double-quoted attribute. */
function escapeAttribute(value: string): string {
  return value.replace(/&(?![a-zA-Z][a-zA-Z0-9]{1,31};|#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};)/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'comment' }
  | { kind: 'open'; name: string; attributes: Array<[string, string]>; selfClosing: boolean }
  | { kind: 'close'; name: string };

interface ScannedTag {
  name: string;
  attributes: Array<[string, string]>;
  selfClosing: boolean;
  end: number;
}

/**
 * Why a scan stopped, because the two failures need opposite handling:
 *
 *   - `notATag`    no tag name at this position, so the `<` is ordinary text
 *                  (`3 <5`). Escaped, scan resumes at the next character.
 *   - `incomplete` a tag name was read but the tag never closed, so there is
 *                  no defensible end. A browser discards such a tag; so do we,
 *                  by dropping the remainder rather than guessing.
 */
type ScanResult =
  | { kind: 'tag'; tag: ScannedTag }
  | { kind: 'notATag' }
  | { kind: 'incomplete' };

const TAG_NAME_PATTERN = /[a-zA-Z][a-zA-Z0-9:._-]*/y;
const ATTR_NAME_PATTERN = /[^\s"'<>/=]+/y;

/** Record an attribute, letting a later duplicate win as a browser would. */
function withAttribute(
  attributes: Array<[string, string]>,
  name: string,
  value: string
): Array<[string, string]> {
  return [...attributes.filter(([key]) => key !== name), [name, value]];
}

/**
 * Hand-rolled tag scanner. A single regex was rejected because the failure
 * modes matter here: an attribute region that tolerates `<` is exactly how
 * `<scr<script>ipt>` gets reassembled into a live tag. So a `<` always ends
 * the scan — including inside a quoted value, where it truncates the value
 * and closes the tag there rather than swallowing the rest of the document.
 *
 * Nothing found here is ever emitted verbatim. The caller rebuilds every tag
 * from a name allowlist and a fresh attribute set, so a mis-scan can lose
 * content but cannot introduce markup.
 */
function scanTag(input: string, start: number): ScanResult {
  TAG_NAME_PATTERN.lastIndex = start + 1;
  const nameMatch = TAG_NAME_PATTERN.exec(input);
  if (!nameMatch) return { kind: 'notATag' };

  const name = nameMatch[0];
  const attributes: Array<[string, string]> = [];
  let i = TAG_NAME_PATTERN.lastIndex;

  for (;;) {
    while (i < input.length && /\s/.test(input[i]!)) i += 1;

    if (i >= input.length) return { kind: 'incomplete' };
    if (input[i] === '>') {
      return {
        kind: 'tag',
        tag: { name, attributes, selfClosing: false, end: i + 1 },
      };
    }
    if (input[i] === '<') return { kind: 'incomplete' }; // reassembly attempt
    if (input[i] === '/') {
      i += 1;
      continue;
    }

    ATTR_NAME_PATTERN.lastIndex = i;
    const attrNameMatch = ATTR_NAME_PATTERN.exec(input);
    if (!attrNameMatch) return { kind: 'incomplete' };

    const attrName = attrNameMatch[0].toLowerCase();
    i = ATTR_NAME_PATTERN.lastIndex;

    while (i < input.length && /\s/.test(input[i]!)) i += 1;

    let attrValue = '';
    if (input[i] === '=') {
      i += 1;
      while (i < input.length && /\s/.test(input[i]!)) i += 1;

      const quote = input[i];
      if (quote === '"' || quote === "'") {
        // End the value at the closing quote or at the next `<`, whichever
        // comes first, so a corrupt value cannot absorb the rest of the entry.
        let cursor = i + 1;
        while (cursor < input.length && input[cursor] !== quote && input[cursor] !== '<') {
          cursor += 1;
        }
        if (cursor >= input.length) return { kind: 'incomplete' };
        attrValue = input.slice(i + 1, cursor);
        if (input[cursor] === '<') {
          return {
            kind: 'tag',
            tag: {
              name,
              attributes: withAttribute(attributes, attrName, attrValue),
              selfClosing: false,
              end: cursor,
            },
          };
        }
        i = cursor + 1;
      } else {
        const unquoted = /[^\s<>"'`]*/y;
        unquoted.lastIndex = i;
        const valueMatch = unquoted.exec(input);
        attrValue = valueMatch ? valueMatch[0] : '';
        i = unquoted.lastIndex;
      }
    }

    attributes.splice(0, attributes.length, ...withAttribute(attributes, attrName, attrValue));
  }
}

/** Index just past the `</name>` that closes an already-open dropped element. */
function skipDroppedSubtree(input: string, from: number, name: string): number {
  const openPattern = new RegExp(`<${name}(?=[\\s/>])`, 'gi');
  const closePattern = new RegExp(`</${name}\\s*>`, 'gi');

  let depth = 1;
  let cursor = from;

  for (;;) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;

    const nextOpen = openPattern.exec(input);
    const nextClose = closePattern.exec(input);
    if (!nextClose) return input.length; // unclosed: drop the remainder

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + 1;
      continue;
    }

    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
    if (depth === 0) return cursor;
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) tokens.push({ kind: 'text', value: input.slice(textStart, end) });
  };

  while (i < input.length) {
    if (input[i] !== '<') {
      i += 1;
      continue;
    }

    if (input.startsWith('<!--', i)) {
      flushText(i);
      const close = input.indexOf('-->', i + 4);
      i = close === -1 ? input.length : close + 3;
      tokens.push({ kind: 'comment' });
      textStart = i;
      continue;
    }

    // `<!DOCTYPE …>`, `<?xml …>` and stray `<!` declarations are dropped whole.
    if (input[i + 1] === '!' || input[i + 1] === '?') {
      flushText(i);
      const close = input.indexOf('>', i);
      i = close === -1 ? input.length : close + 1;
      textStart = i;
      continue;
    }

    const isClosing = input[i + 1] === '/';
    const scanned = scanTag(input, isClosing ? i + 1 : i);

    if (scanned.kind === 'notATag') {
      // A `<` that does not begin a tag is ordinary text (`3 <5`).
      i += 1;
      continue;
    }

    if (scanned.kind === 'incomplete') {
      // The tag opened but never closed, so its end is unknowable. Drop what
      // is left rather than guessing: an escaped fragment would otherwise put
      // raw markup text in front of the user. `textStart` moves with `i` so
      // the trailing flush below cannot re-emit the abandoned markup.
      flushText(i);
      textStart = input.length;
      break;
    }

    const tag = scanned.tag;
    flushText(i);
    const lowered = tag.name.toLowerCase();

    if (DROP_WITH_CONTENT.has(lowered)) {
      const end = tag.selfClosing ? tag.end : skipDroppedSubtree(input, tag.end, lowered);
      i = end;
      textStart = i;
      continue;
    }

    if (isClosing) {
      tokens.push({ kind: 'close', name: lowered });
    } else {
      tokens.push({
        kind: 'open',
        name: lowered,
        attributes: tag.attributes,
        selfClosing: tag.selfClosing || SELF_CLOSING.has(lowered),
      });
    }

    i = tag.end;
    textStart = i;
  }

  flushText(input.length);
  return tokens;
}

function renderAttributes(name: string, attributes: Array<[string, string]>): string {
  const allowed = ELEMENT_ATTRIBUTES[name];
  let rendered = '';

  for (const [key, value] of attributes) {
    if (!GLOBAL_ATTRIBUTES.has(key) && !allowed?.has(key)) continue;
    rendered += ` ${key}="${escapeAttribute(value)}"`;
  }

  if (name === 'a') {
    const href = attributes.find(([key]) => key === 'href')?.[1];
    if (href === undefined || !isSafeJournalHref(href)) return '';
    // Always emitted, never taken from the input: a stored `rel` could have
    // been written before this module existed and might say something else.
    return ` href="${escapeAttribute(href)}" rel="noopener noreferrer nofollow" target="_blank"`;
  }

  return rendered;
}

/**
 * Reduce arbitrary HTML to the journal rich-text allowlist.
 *
 * Idempotent: sanitizing already-sanitized content returns it unchanged, which
 * is what lets the render path run on every open without drifting the stored
 * value.
 *
 * @example
 * sanitizeRichText('<p>hi<script>alert(1)</script></p>') // => '<p>hi</p>'
 * sanitizeRichText('<a href="javascript:alert(1)">x</a>')  // => '<a rel="…">x</a>'
 */
/**
 * Elements whose start tag implicitly ends an open sibling of the same kind,
 * for the two cases the editor itself produces: `<li>a<li>b` from pasting two
 * lines into a list, and `<p>a<p>b` from pressing Enter.
 *
 * Without this the balancing pass below would emit `</li></li>` at the outer
 * close, because the second `<li>` is still on the stack. The output renders
 * the same either way; this just keeps what gets stored canonical, which
 * matters because the editor writes its own `innerHTML` back on every change.
 */
const IMPLIED_END_TAGS: Record<string, readonly string[]> = {
  li: ['li'],
  p: ['p'],
  td: ['td'],
  th: ['th'],
  tr: ['tr'],
  option: ['option'],
};

export function sanitizeRichText(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';

  const open: string[] = [];
  let out = '';

  const closeTo = (depth: number) => {
    for (let i = open.length - 1; i >= depth; i -= 1) {
      out += `</${open[i]}>`;
    }
    open.length = depth;
  };

  for (const token of tokenize(html)) {
    if (token.kind === 'comment') continue;

    if (token.kind === 'text') {
      out += escapeText(token.value);
      continue;
    }

    if (token.kind === 'open') {
      if (!RICH_TEXT_ALLOWED_TAGS.includes(token.name)) continue;

      for (const implied of IMPLIED_END_TAGS[token.name] ?? []) {
        const depth = open.lastIndexOf(implied);
        if (depth !== -1) closeTo(depth);
      }

      const attributes = renderAttributes(token.name, token.attributes);
      if (token.selfClosing) {
        // An anchor is never self-closing — `<a/>` with no href is pointless
        // markup, and emitting it as a sibling of the following text reads as
        // broken rather than minimal.
        if (token.name !== 'a') {
          out += `<${token.name}${attributes}>`;
        }
        continue;
      }

      out += `<${token.name}${attributes}>`;
      open.push(token.name);
      continue;
    }

    const depth = open.lastIndexOf(token.name);
    if (depth === -1) continue; // stray close tag

    closeTo(depth);
  }

  closeTo(0);
  return out;
}

/** Decode the entity forms a sanitizer leaves in text content. */
function decodeEntitiesForText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      fromCodePointSafe(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);?/g, (_, dec: string) => fromCodePointSafe(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const decoded = NAMED_ENTITY_SCHEMES[name.toLowerCase()];
      return decoded ?? match;
    })
    .replace(/&amp;/g, '&');
}

/**
 * Plain-text projection of stored rich text, for list previews, revision
 * summaries and the editor's "is there any content" check.
 *
 * Sanitizing first means the preview is derived from exactly the markup that
 * will be rendered, and that a tag hidden inside a dropped `<script>` cannot
 * leak its own text into a summary.
 *
 * @example
 * richTextToPlainText('<p>Hello <strong>world</strong></p>') // => 'Hello world'
 */
export function richTextToPlainText(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  return decodeEntitiesForText(sanitizeRichText(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}
