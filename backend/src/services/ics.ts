/** Génération d'invitations iCalendar (.ics) — compatibles Google Agenda, Outlook, Apple Calendrier. */
const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export interface IcsInput {
  uid: string; method: 'REQUEST' | 'CANCEL'; sequence: number; start: Date; end: Date;
  summary: string; description?: string;
  organizer: { email: string; name?: string };
  attendees: { email: string; name?: string }[];
  alarmMinutes?: number;
}

export function buildIcs(o: IcsInput) {
  const cn = (n?: string) => (n ? `;CN=${esc(n).replace(/:/g, '')}` : '');
  const lines = [
    'BEGIN:VCALENDAR', 'PRODID:-//Aurion//Agenda//FR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', `METHOD:${o.method}`,
    'BEGIN:VEVENT', `UID:${o.uid}`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(o.start)}`, `DTEND:${stamp(o.end)}`,
    `SEQUENCE:${o.sequence}`, `SUMMARY:${esc(o.summary)}`,
    ...(o.description ? [`DESCRIPTION:${esc(o.description)}`] : []),
    `ORGANIZER${cn(o.organizer.name)}:mailto:${o.organizer.email}`,
    ...o.attendees.map(a => `ATTENDEE${cn(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${a.email}`),
    `STATUS:${o.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE',
    ...(o.method === 'REQUEST' ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Rappel', `TRIGGER:-PT${o.alarmMinutes ?? 60}M`, 'END:VALARM'] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
