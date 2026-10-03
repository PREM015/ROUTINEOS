import { describe, expect, it } from 'vitest';
import {
  isSafeJournalHref,
  richTextToPlainText,
  sanitizeRichText,
} from '@/lib/security/html-sanitizer';

/**
 * Journal stores rich text as HTML and writes it back into `innerHTML` when an
 * entry is reopened, so this suite is the regression net for stored XSS.
 *
 * Two properties matter and they are different:
 *
 *   1. nothing executable survives — no script, no event handler, no
 *      `javascript:` URL, no reassembled tag;
 *   2. supported formatting survives, because a sanitizer that strips `<b>`
 *      "fixes" the vulnerability by silently deleting the user's writing.
 *
 * The old `sanitizeHtml` helper satisfied neither: it deleted every tag
 * (losing formatting) and its `<[^>]*>?` pattern folded `<scr<script>ipt>`
 * into a live tag.
 */

describe('sanitizeRichText - script execution', () => {
  it('drops a script element and everything inside it', () => {
    expect(sanitizeRichText('<p>a</p><script>alert(1)</script><p>b</p>')).toBe(
      '<p>a</p><p>b</p>'
    );
  });

  it('drops a script element regardless of case', () => {
    expect(sanitizeRichText('<SCRIPT>alert(1)</SCRIPT>')).toBe('');
    expect(sanitizeRichText('<ScRiPt src="//evil.test"></ScRiPt>')).toBe('');
  });

  it('drops an inline event handler, keeping the surrounding text', () => {
    expect(sanitizeRichText('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeRichText('<p ONMOUSEOVER="alert(1)">hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeRichText('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('cannot be reassembled by nesting an unknown tag around a known one', () => {
    // The bypass the old `/<[^>]*>?/gm` stripper fell to: the regex consumed
    // up to the first `>`, leaving `<scr<script>ipt>` reading as `<script>`.
    expect(sanitizeRichText('<scr<script>ipt>alert(1)</script>')).not.toContain('<script');
    expect(sanitizeRichText('<scr<script>ipt>alert(1)</script>')).not.toContain('alert(1)');
  });

  it('drops an unterminated tag instead of guessing at its end', () => {
    expect(sanitizeRichText('<p>ok</p><script>alert(1)')).toBe('<p>ok</p>');
    expect(sanitizeRichText('<p onclick="alert(1)')).toBe('');
  });

  it('drops an unterminated dropped-element subtree entirely', () => {
    expect(sanitizeRichText('<p>keep</p><iframe>hidden')).toBe('<p>keep</p>');
  });

  it('drops the other executable and embedding containers', () => {
    for (const tag of [
      'style',
      'iframe',
      'object',
      'embed',
      'svg',
      'math',
      'template',
      'noscript',
      'form',
      'textarea',
      'title',
    ]) {
      expect(sanitizeRichText(`<${tag}>danger</${tag}>`)).toBe('');
    }
  });

  it('drops comments, including the conditional-comment form', () => {
    expect(sanitizeRichText('<!--[if IE]><script>alert(1)</script><![endif]-->')).toBe('');
    expect(sanitizeRichText('<p>a</p><!-- hidden -->')).toBe('<p>a</p>');
  });

  it('drops a doctype and an XML processing instruction', () => {
    expect(sanitizeRichText('<!DOCTYPE html><p>a</p>')).toBe('<p>a</p>');
    expect(sanitizeRichText('<?xml version="1.0"?><p>a</p>')).toBe('<p>a</p>');
  });

  it('neutralises a nested dropped element inside an allowed one', () => {
    expect(sanitizeRichText('<p>before<script>alert(1)</script>after</p>')).toBe(
      '<p>beforeafter</p>'
    );
  });
});

describe('sanitizeRichText - URL-bearing attributes', () => {
  it('drops a javascript: href but keeps the link text', () => {
    const output = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(output).toContain('click');
    expect(output).not.toContain('javascript:');
    expect(output).not.toContain('href');
  });

  it('drops other executable and non-navigable schemes', () => {
    for (const scheme of [
      'javascript:',
      'vbscript:',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
    ]) {
      expect(sanitizeRichText(`<a href="${scheme}">x</a>`)).not.toContain('href');
    }
  });

  it('sees through an entity-encoded scheme', () => {
    // The output is re-parsed as HTML, so an encoded colon or encoded letters
    // are decoded by the browser before the URL is used.
    expect(sanitizeRichText('<a href="java&#115;cript:alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeRichText('<a href="javascript&colon;alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeRichText('<a href="&#106;avascript:alert(1)">x</a>')).not.toContain('href');
  });

  it('sees through control characters inside a scheme', () => {
    // URL parsers strip tab/newline, so this is a live javascript: link.
    expect(sanitizeRichText('<a href="java\tscript:alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeRichText('<a href="java\nscript:alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeRichText('<a href=" javascript:alert(1)">x</a>')).not.toContain('href');
  });

  it('keeps ordinary links and forces a safe rel and target', () => {
    const output = sanitizeRichText('<a href="https://example.test/n" rel="opener">x</a>');
    expect(output).toContain('href="https://example.test/n"');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
    expect(output).toContain('target="_blank"');
    // A stored `rel` predating this module could contradict the emitted one.
    expect(output).not.toContain('rel="opener"');
  });

  it('keeps relative, fragment and mailto links', () => {
    for (const href of ['/notes/1', '#section', 'mailto:a@b.test', 'tel:+15550100', 'https://x.test']) {
      expect(sanitizeRichText(`<a href="${href}">x</a>`)).toContain('href=');
    }
  });

  it('drops target and rel on elements that are not links', () => {
    expect(sanitizeRichText('<p target="_blank" rel="opener">x</p>')).toBe('<p>x</p>');
  });

  it('does not split an attribute across a dropped one', () => {
    expect(sanitizeRichText('<p title="a" onfocus="alert(1)">x</p>')).toBe('<p title="a">x</p>');
  });

  it('closes an anchor whose end tag was swallowed', () => {
    // `<a href="x<script>alert(1)</script>` — the scanner must not leave the
    // anchor open and swallow the rest of the document into it.
    expect(sanitizeRichText('<a href="https://x.test<script>alert(1)</script>tail')).toBe(
      '<a href="https://x.test" rel="noopener noreferrer nofollow" target="_blank">tail</a>'
    );
  });
});

describe('isSafeJournalHref', () => {
  it('accepts navigable and relative links', () => {
    for (const href of ['https://a.test', 'http://a.test', 'mailto:a@b.test', '/x', '#y', '?q=1']) {
      expect(isSafeJournalHref(href)).toBe(true);
    }
  });

  it('rejects executable schemes in every encoding it can hide behind', () => {
    for (const href of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java&#115;cript:alert(1)',
      'javascript&colon;alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
    ]) {
      expect(isSafeJournalHref(href)).toBe(false);
    }
  });

  it('rejects an empty href', () => {
    expect(isSafeJournalHref('')).toBe(false);
    expect(isSafeJournalHref('   ')).toBe(false);
  });
});

describe('sanitizeRichText - formatting preservation', () => {
  it('keeps the bold, italic and underline the editor toolbar produces', () => {
    expect(sanitizeRichText('<b>bold</b> <i>italic</i> <u>under</u>')).toBe(
      '<b>bold</b> <i>italic</i> <u>under</u>'
    );
    expect(sanitizeRichText('<strong>s</strong><em>e</em>')).toBe('<strong>s</strong><em>e</em>');
  });

  it('keeps both list types the toolbar inserts', () => {
    expect(sanitizeRichText('<ul><li>one</li><li>two</li></ul>')).toBe(
      '<ul><li>one</li><li>two</li></ul>'
    );
    expect(sanitizeRichText('<ol><li>one</li></ol>')).toBe('<ol><li>one</li></ol>');
  });

  it('keeps the span and div wrappers contentEditable emits', () => {
    // Firefox's execCommand('bold') wraps in a styled span rather than <b>.
    // The wrapper survives so the paragraph structure does not collapse; the
    // style attribute does not, because it is the usual style-based vector.
    expect(sanitizeRichText('<span style="font-weight:bold">x</span>')).toBe('<span>x</span>');
    expect(sanitizeRichText('<div>a</div><div>b</div>')).toBe('<div>a</div><div>b</div>');
  });

  it('keeps blockquote, code, headings and rules', () => {
    expect(sanitizeRichText('<blockquote><p>q</p></blockquote>')).toBe(
      '<blockquote><p>q</p></blockquote>'
    );
    expect(sanitizeRichText('<pre><code>x</code></pre>')).toBe('<pre><code>x</code></pre>');
    expect(sanitizeRichText('<h2>Heading</h2>')).toBe('<h2>Heading</h2>');
    expect(sanitizeRichText('<hr>')).toBe('<hr>');
    expect(sanitizeRichText('<br>')).toBe('<br>');
  });

  it('unwraps an unknown element but keeps the text inside it', () => {
    expect(sanitizeRichText('<marquee>scroll</marquee>')).toBe('scroll');
    expect(sanitizeRichText('<custom-element><p>kept</p></custom-element>')).toBe('<p>kept</p>');
  });

  it('closes tags the input left open', () => {
    expect(sanitizeRichText('<p>unclosed')).toBe('<p>unclosed</p>');
    expect(sanitizeRichText('<ul><li>a<li>b</ul>')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('ignores a stray close tag', () => {
    expect(sanitizeRichText('text</div>more')).toBe('textmore');
    expect(sanitizeRichText('<p>a</p></p><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('is idempotent', () => {
    // The render path sanitizes on every open. Without idempotence, opening
    // the same entry repeatedly would keep rewriting it.
    const once = sanitizeRichText(
      '<p>a <b>b</b> <a href="https://x.test">l</a></p><script>x</script>'
    );
    expect(sanitizeRichText(once)).toBe(once);
    expect(sanitizeRichText(sanitizeRichText(once))).toBe(once);
  });

  it('leaves plain text alone', () => {
    expect(sanitizeRichText('just words')).toBe('just words');
    expect(sanitizeRichText('')).toBe('');
  });

  it('escapes a bare angle bracket rather than dropping the text after it', () => {
    expect(sanitizeRichText('a < b and c > d')).toBe('a &lt; b and c &gt; d');
    expect(sanitizeRichText('3 <5')).toBe('3 &lt;5');
  });

  it('does not double-escape an existing entity', () => {
    expect(sanitizeRichText('<p>a &amp; b</p>')).toBe('<p>a &amp; b</p>');
    expect(sanitizeRichText('&lt;script&gt;')).toBe('&lt;script&gt;');
  });

  it('escapes text that follows a dropped tag', () => {
    expect(sanitizeRichText('<script>x</script><b>a</b>')).toBe('<b>a</b>');
  });
});

describe('richTextToPlainText', () => {
  it('flattens formatting to readable text', () => {
    expect(richTextToPlainText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(richTextToPlainText('<ul><li>one</li><li>two</li></ul>')).toBe('one two');
  });

  it('does not leak the text of a dropped element', () => {
    expect(richTextToPlainText('<p>a</p><script>secretKey</script>')).toBe('a');
    expect(richTextToPlainText('<style>.x{color:red}</style>')).toBe('');
  });

  it('decodes entities so a preview is not full of markup noise', () => {
    expect(richTextToPlainText('<p>tea &amp; biscuits</p>')).toBe('tea & biscuits');
  });

  it('collapses whitespace and trims', () => {
    expect(richTextToPlainText('  <p>a</p>\n\n  <p>b</p>  ')).toBe('a b');
    expect(richTextToPlainText('<div><br></div>')).toBe('');
  });

  it('returns an empty string for empty input', () => {
    expect(richTextToPlainText('')).toBe('');
    expect(richTextToPlainText(undefined as unknown as string)).toBe('');
  });
});
