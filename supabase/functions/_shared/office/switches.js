// The CDS switches card (2026-10-20, Samantha: "build the CDS switches card ... only me can change
// them for now (Zach in March, Krystal view only), and include the Caregiver Match messages switch
// with the stronger warning").
//
// The switches live in cds_match_settings, which the hub page may not read or write. The server
// function cds-switches wraps this file: any signed-in CDS hub user can SEE them; only an email in
// setting switch_owners can CHANGE one. Every change is written to cds_audit (who, when, from, to).
// Only the on/off of these seven; recipients, hours and owners are not changeable here.
// No em dashes in anything a person reads (her rule).

export const DEFAULT_OWNERS = ['samantha@mo-care.com', 'samantha@caringcds.com'];
const firstName = e => { const n = String(e || '').split('@')[0].replace(/[^a-z]/gi, ''); return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; };
const listNames = a => { const u = [...new Set(a.filter(Boolean))]; return u.length < 2 ? (u[0] || 'nobody') : u.slice(0, -1).join(', ') + ' and ' + u[u.length - 1]; };

// key = cds_match_settings key; field 'live' means value.live, null means the value itself is true/false.
export const SWITCHES = [
  { key: 'lead_alerts', field: 'live', label: 'New lead alerts',
    does: v => 'Emails ' + listNames((v.recipients || []).map(r => r.name)) + ' the moment a website lead comes in. Texts them weekdays '
      + hour(v.text_from ?? 9) + ' to ' + hour(v.text_until ?? 16) + ', plus one reminder after ' + (v.reminder_minutes || 30) + ' minutes if nobody has called.',
    on: 'Website leads will start alerting the office again by email and text.', off: 'Website leads will not alert anyone. The morning email still lists them.' },
  { key: 'morning_email', field: 'live', label: '8am morning email',
    does: v => 'Emails the "Do this first" list to ' + listNames((v.emails || []).map(firstName)) + ' at 8am on weekdays.',
    on: 'The 8am email starts again tomorrow morning on the next weekday.', off: 'No 8am email until it is turned back on.' },
  { key: 'lead_ghl', field: 'live', label: 'Website leads into GoHighLevel',
    does: () => 'Adds each new website lead to GoHighLevel with name, phone and email only. No tags, and nothing is sent to them.',
    on: 'New website leads will be added to GoHighLevel within about 2 minutes. Nothing is sent to them.', off: 'New website leads will not be added to GoHighLevel. Contacts already added stay.' },
  { key: 'attendant_check', field: 'live', label: 'Attendant check in the morning email',
    does: () => 'Adds the "Check against WellSky" lists to the 8am email. The Attendants page shows them either way.',
    on: 'The 8am email will include the attendant check.', off: 'The 8am email will leave out the attendant check. The Attendants page still shows it.' },
  { key: 'wellsky_check', field: 'live', label: 'WellSky check in the morning email',
    does: () => 'Adds long shifts, open shifts and authorization hours from the daily WellSky check to the 8am email.',
    on: 'The 8am email will include the WellSky check.', off: 'The 8am email will leave out the WellSky check. The hub still shows it.' },
  { key: 'office_alerts', field: 'live', label: 'Caregiver sign-up alerts',
    does: v => 'Emails ' + listNames((v.emails || []).map(firstName)) + ' when someone signs up on findcdscaregivers.com.',
    on: 'The office will be emailed about each new caregiver sign-up.', off: 'No sign-up emails. Sign-ups still become to-dos in Caregiver Match.' },
  { key: 'packet_alerts', field: 'live', label: 'Attendant application alerts',
    does: v => 'Emails ' + listNames((v.recipients || []).map(r => r.name)) + ' the moment an attendant signs Step 1 ("run EDL and FCSR"). Texts them too on weekdays 9am to 4pm.',
    on: 'The office will be told the moment an attendant signs Step 1.', off: 'No Step 1 alerts. The to-do still appears on the Dashboard and in Active Attendants.' },
  { key: 'packet_messages', field: 'live', label: 'Attendant application texts', warn: 'This one reaches attendants.',
    does: () => 'Texts and emails attendants who apply at caringcds.com/apply: their private link, the orientation and handbook links after Step 1, up to 2 reminders, and "your checks are clear". While off, they wait in Messages.',
    on: 'Attendants who apply will get their texts and emails.', off: 'Attendant texts and emails will wait in Messages instead of being sent.' },
  { key: 'oig_check', field: 'live', label: 'Automatic OIG check',
    does: () => 'Checks attendants against the OIG exclusion list when they sign Step 1 and every month on the 11th. On: a clear result counts as their OIG check, and a possible match becomes a to-do. Off: it still checks and saves results on Active Attendants, nothing more.',
    on: 'Clear OIG results will count as the OIG check, and possible matches will become to-dos.', off: 'OIG results will be saved on Active Attendants only. Run OIG by hand.' },
  { key: 'messages_live', field: null, label: 'Caregiver Match messages', warn: 'This one reaches caregivers and families.',
    does: () => 'Lets Caregiver Match text and email caregivers and families. While off, messages wait in Messages (the office\'s test phones still get them).',
    on: 'From now on, texts and emails written in Caregiver Match go to real caregivers and families.', off: 'Caregiver Match messages will wait in Messages instead of being sent.' },
];
function hour(h) { h = +h; return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); }

export class SwitchError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms }
export function createSwitches(deps) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const now = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  async function owners() {
    const r = await one(`select value from cds_match_settings where key='switch_owners'`);
    const v = r && Array.isArray(r.value) ? r.value : DEFAULT_OWNERS;
    return v.map(e => String(e).trim().toLowerCase());
  }
  const isOn = (sw, value) => sw.field ? !!(value && value[sw.field] === true) : value === true;

  async function list(email) {
    const can = (await owners()).includes(String(email || '').toLowerCase());
    const rows = await q(`select key, value, updated_at, updated_by from cds_match_settings where key = any($1)`, [SWITCHES.map(s => s.key)]);
    const last = await q(`select distinct on (target) target, actor, at, detail from cds_audit where action='switch' order by target, at desc`);
    return { canChange: can, switches: SWITCHES.map(sw => {
      const r = rows.find(x => x.key === sw.key);
      const l = last.find(x => x.target === sw.key);
      const value = r ? r.value : null;
      return { key: sw.key, label: sw.label, warn: sw.warn || '', ready: !!r, on: r ? isOn(sw, value) : false,
               does: sw.does(value && typeof value === 'object' ? value : {}), confirmOn: sw.on, confirmOff: sw.off,
               last: l ? { by: firstName(l.actor), at: l.at, to: l.detail && l.detail.to } : (r ? { by: '', at: r.updated_at, script: r.updated_by || '' } : null) };
    }) };
  }

  async function set(email, key, on) {
    email = String(email || '').toLowerCase();
    if (!(await owners()).includes(email)) throw new SwitchError('Only Samantha can change switches.', 403);
    const sw = SWITCHES.find(s => s.key === key);
    if (!sw) throw new SwitchError('That is not one of the switches.');
    if (typeof on !== 'boolean') throw new SwitchError('Say on or off.');
    const r = await one(`select value from cds_match_settings where key=$1`, [key]);
    if (!r) throw new SwitchError('This switch is not set up yet, so it cannot be changed here.');
    const was = isOn(sw, r.value);
    const value = sw.field ? Object.assign({}, r.value, { [sw.field]: on }) : on;
    await q(`update cds_match_settings set value=$2::jsonb, updated_at=$3, updated_by=$4 where key=$1`, [key, JSON.stringify(value), now(), email]);
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, 'switch', $2, $3::jsonb)`,
      [email, key, JSON.stringify({ from: was ? 'on' : 'off', to: on ? 'on' : 'off', label: sw.label })]);
    return { ok: true, key, on, message: 'Done. Turned ' + (on ? 'on' : 'off') + ' by ' + firstName(email) + '.' };
  }

  async function handle(email, body) {
    const action = String(body && body.action || 'list');
    if (action === 'list') return list(email);
    if (action === 'set') return set(email, String(body.key || ''), body.on);
    throw new SwitchError('Unknown request');
  }
  return { list, set, handle };
}
