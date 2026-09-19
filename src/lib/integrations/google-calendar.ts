import type {
  CalendarConflict,
  CalendarEvent,
  CalendarEventInput,
} from '@/types/integrations';
import { IntegrationError, IntegrationTokenError } from './manager';

/**
 * Google Calendar API helpers.
 * Thin client over the v3 REST endpoint used by the calendar sync integration.
 */

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export const GOOGLE_CALENDAR_API_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
] as const;

export interface GoogleCalendarClient {
  accessToken: string;
  /** Calendar id, defaults to the user's primary calendar. */
  calendarId?: string;
}

export interface ListEventsParams {
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  singleEvents?: boolean;
}

function calendarPrefix(calendarId: string): string {
  return `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`;
}

/**
 * Parse a Google Calendar event resource into the app's `CalendarEvent` shape.
 * Events without an explicit end time are treated as single-day events.
 */
export function parseEventResource(raw: Record<string, unknown>): CalendarEvent {
  const start = raw.start as Record<string, unknown> | undefined;
  const end = raw.end as Record<string, unknown> | undefined;
  const allDay = Boolean(start && typeof start.date === 'string');

  const startValue = allDay ? String(start?.date ?? '') : String(start?.dateTime ?? '');
  const endValue = allDay ? String(end?.date ?? '') : String(end?.dateTime ?? '');

  if (startValue.length === 0 || endValue.length === 0) {
    throw new TypeError('Google Calendar event is missing start/end');
  }

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    title: String(raw.summary ?? '(no title)'),
    description: raw.description ? String(raw.description) : null,
    start: new Date(startValue),
    end: new Date(endValue),
    allDay,
    location: raw.location ? String(raw.location) : null,
    color: typeof raw.colorId === 'string' ? raw.colorId : null,
  };
}

function toEventBody(input: CalendarEventInput): Record<string, unknown> {
  return {
    summary: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    start: {
      [input.allDay ? 'date' : 'dateTime']: input.allDay
        ? input.start.toISOString().slice(0, 10)
        : input.start.toISOString(),
    },
    end: {
      [input.allDay ? 'date' : 'dateTime']: input.allDay
        ? input.end.toISOString().slice(0, 10)
        : input.end.toISOString(),
    },
  };
}

async function request(
  client: GoogleCalendarClient,
  path: string,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new IntegrationError('GOOGLE_CALENDAR', 'Network error while calling Google Calendar API');
  }

  if (response.status === 401 || response.status === 403) {
    throw new IntegrationTokenError(
      'GOOGLE_CALENDAR',
      'Google Calendar access token is invalid or expired'
    );
  }
  if (!response.ok) {
    throw new IntegrationError(
      'GOOGLE_CALENDAR',
      `Google Calendar API responded with HTTP ${response.status}`
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * List events in the given time window, mapped to the app's `CalendarEvent` shape.
 */
export async function listEvents(
  client: GoogleCalendarClient,
  params: ListEventsParams = {}
): Promise<CalendarEvent[]> {
  const search = new URLSearchParams();
  if (params.timeMin) search.set('timeMin', params.timeMin.toISOString());
  if (params.timeMax) search.set('timeMax', params.timeMax.toISOString());
  if (params.maxResults) search.set('maxResults', String(params.maxResults));
  search.set('singleEvents', params.singleEvents ?? true ? 'true' : 'false');

  const calendarId = client.calendarId ?? 'primary';
  const data = await request(
    client,
    `${calendarPrefix(calendarId)}/events?${search.toString()}`
  );
  const rawEvents = Array.isArray(data.items) ? data.items : [];
  return rawEvents.map((item) => parseEventResource(item as Record<string, unknown>));
}

/**
 * Create an event on the connected calendar.
 */
export async function createEvent(
  client: GoogleCalendarClient,
  input: CalendarEventInput
): Promise<CalendarEvent> {
  const calendarId = client.calendarId ?? 'primary';
  const data = await request(client, `${calendarPrefix(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(toEventBody(input)),
  });
  return parseEventResource(data);
}

/**
 * Update an existing event by its Google-side event id. Only provided fields
 * are patched.
 */
export async function updateEvent(
  client: GoogleCalendarClient,
  eventId: string,
  input: Partial<CalendarEventInput>
): Promise<CalendarEvent> {
  const calendarId = client.calendarId ?? 'primary';
  const body: Record<string, unknown> = {};

  if (input.title) body.summary = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.location !== undefined) body.location = input.location;
  if (input.start) {
    body.start = {
      [input.allDay ? 'date' : 'dateTime']: input.allDay
        ? input.start.toISOString().slice(0, 10)
        : input.start.toISOString(),
    };
  }
  if (input.end) {
    body.end = {
      [input.allDay ? 'date' : 'dateTime']: input.allDay
        ? input.end.toISOString().slice(0, 10)
        : input.end.toISOString(),
    };
  }

  const data = await request(
    client,
    `${calendarPrefix(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  );
  return parseEventResource(data);
}

/**
 * Delete an event by its Google-side event id.
 */
export async function deleteEvent(
  client: GoogleCalendarClient,
  eventId: string
): Promise<void> {
  const calendarId = client.calendarId ?? 'primary';
  await request(
    client,
    `${calendarPrefix(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  );
}

/**
 * Find events that overlap the given window, grouped by the events actually
 * scheduled in it.
 */
export async function findConflicts(
  client: GoogleCalendarClient,
  start: Date,
  end: Date
): Promise<CalendarConflict[]> {
  const events = await listEvents(client, { timeMin: start, timeMax: end });
  const conflicts: CalendarConflict[] = [];

  for (const candidate of events) {
    const overlapping = events.filter(
      other =>
        other.id !== candidate.id &&
        other.start.getTime() < candidate.end.getTime() &&
        other.end.getTime() > candidate.start.getTime()
    );
    if (overlapping.length === 0) continue;
    conflicts.push({
      eventId: candidate.id,
      title: candidate.title,
      start: candidate.start,
      end: candidate.end,
      overlappingWith: overlapping.map(other => ({ id: other.id, title: other.title })),
    });
  }

  return conflicts;
}