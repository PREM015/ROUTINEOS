import { IntegrationError, IntegrationTokenError } from './manager';

/**
 * Notion API helpers.
 * Thin client over the public Notion v1 REST API used by the notes sync
 * integration. Responses are kept loosely typed since Notion shapes vary.
 */

export const NOTION_API_URL = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2022-06-28';

export type NotionParent =
  | { type: 'database_id'; database_id: string }
  | { type: 'page_id'; page_id: string };

export interface NotionRichText {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: Record<string, unknown>;
  plain_text?: string;
}

/**
 * Headers required for every Notion API request.
 */
export function notionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Build a rich-text object from a plain string.
 */
export function toRichText(text: string): NotionRichText {
  return { type: 'text', text: { content: text } };
}

export interface NotionParagraphBlock {
  object: 'block';
  type: 'paragraph';
  paragraph: { rich_text: NotionRichText[] };
}

/**
 * Convert plain text into paragraph blocks (one per non-empty line), suitable
 * for page children.
 */
export function toParagraphBlocks(text: string): NotionParagraphBlock[] {
  return text
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(line => ({
      object: 'block' as const,
      type: 'paragraph' as const,
      paragraph: { rich_text: [toRichText(line)] },
    }));
}

async function request(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${NOTION_API_URL}${path}`, {
      ...init,
      headers: {
        ...notionHeaders(accessToken),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new IntegrationError('NOTION', 'Network error while calling Notion API');
  }

  if (response.status === 401) {
    throw new IntegrationTokenError('NOTION', 'Notion access token is invalid or revoked');
  }
  if (!response.ok) {
    throw new IntegrationError('NOTION', `Notion API responded with HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export interface CreatePageParams {
  parent: NotionParent;
  properties: Record<string, unknown>;
  children?: NotionParagraphBlock[];
}

/**
 * Create a new page under a database or parent page.
 */
export async function createPage(
  accessToken: string,
  params: CreatePageParams
): Promise<Record<string, unknown>> {
  return request(accessToken, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: params.parent,
      properties: params.properties,
      ...(params.children && params.children.length > 0
        ? { children: params.children }
        : {}),
    }),
  });
}

/**
 * Append content blocks to an existing page.
 */
export async function appendBlocks(
  accessToken: string,
  pageId: string,
  blocks: NotionParagraphBlock[]
): Promise<void> {
  if (blocks.length === 0) return;
  await request(accessToken, `/blocks/${encodeURIComponent(pageId)}/children`, {
    method: 'PATCH',
    body: JSON.stringify({ children: blocks }),
  });
}

export interface QueryDatabaseParams {
  filter?: Record<string, unknown>;
  sorts?: Record<string, unknown>[];
  pageSize?: number;
}

/**
 * Query all pages in a Notion database, honoring optional filters/sorts.
 */
export async function queryDatabase(
  accessToken: string,
  databaseId: string,
  params: QueryDatabaseParams = {}
): Promise<unknown[]> {
  const body: Record<string, unknown> = {};
  if (params.filter) body.filter = params.filter;
  if (params.sorts) body.sorts = params.sorts;
  if (params.pageSize) body.page_size = params.pageSize;

  const data = await request(
    accessToken,
    `/databases/${encodeURIComponent(databaseId)}/query`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  const results = data.results;
  return Array.isArray(results) ? results : [];
}

/**
 * Retrieve a single page by id.
 */
export async function retrievePage(
  accessToken: string,
  pageId: string
): Promise<Record<string, unknown>> {
  return request(accessToken, `/pages/${encodeURIComponent(pageId)}`);
}

/**
 * Extract the title text of a Notion page. Falls back to the id when no title
 * property exists.
 */
export function pageTitle(page: Record<string, unknown>): string {
  const properties = page.properties as Record<string, unknown> | undefined;
  if (properties) {
    for (const [, property] of Object.entries(properties)) {
      const prop = property as Record<string, unknown> | undefined;
      if (prop && Array.isArray(prop.title) && prop.title.length > 0) {
        const first = prop.title[0] as Record<string, unknown> | undefined;
        const text = first?.text as Record<string, unknown> | undefined;
        if (text && typeof text.content === 'string') return text.content;
      }
    }
  }
  return typeof page.id === 'string' ? page.id : '';
}