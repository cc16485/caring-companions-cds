// The CDS switches card: who can see, who can change, every change recorded, and the wording.
//   PGLITE=/path/to/pglite/dist/index.js node tests/switches_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createSwitches, SWITCHES } = await import(ROOT + '/supabase/functions/_shared/office/switches.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const refuses = async (fn, want, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { eq(e.message, want, m); } };

const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`alter table attendant_pool add column if not exists office_reviewed_at timestamptz;`);
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/attendant_check.sql', 'utf8')));
const SW = strip(readFileSync(ROOT + '/switches.sql', 'utf8')); await pg.exec(SW); await pg.exec(SW);
ok(true, 'SQL runs twice');
// the real state today: alerts, email and GoHighLevel on; recipients as set by 1021
await pg.query(`update cds_match_settings set value = value || '{"live": true, "text_from": 9, "text_until": 16, "recipients": [{"name":"Samantha"},{"name":"Krystal"},{"name":"Zach"}]}'::jsonb where key='lead_alerts'`);
await pg.query(`update cds_match_settings set value = value || '{"live": true}'::jsonb where key in ('morning_email','lead_ghl')`);

let T = Date.parse('2026-10-20T19:14:00Z');
const s = createSwitches({ db: { query: (t, p) => pg.query(t, p) }, now: () => T });

// ---------- what everyone sees ----------
let v = await s.handle('krystal@mo-care.com', { action: 'list' });
ok(v.canChange === false, 'Krystal sees the switches but cannot change them');
eq(v.switches.map(x => x.label), ['New lead alerts', '8am morning email', 'Website leads into GoHighLevel', 'Attendant check in the morning email',
  'WellSky check in the morning email', 'Caregiver sign-up alerts', 'Caregiver Match messages'], 'the seven switches, in order');
eq(v.switches.map(x => [x.key, x.ready, x.on]), [['lead_alerts', true, true], ['morning_email', true, true], ['lead_ghl', true, true],
  ['attendant_check', true, false], ['wellsky_check', false, false], ['office_alerts', true, false], ['messages_live', true, false]], 'states (WellSky not set up in this copy)');
eq(v.switches[0].does, 'Emails Samantha, Krystal and Zach the moment a website lead comes in. Texts them weekdays 9am to 4pm, plus one reminder after 30 minutes if nobody has called.', 'lead alerts wording from the real setting');
eq(v.switches[1].does, 'Emails the "Do this first" list to Samantha and Krystal at 8am on weekdays.', 'morning email wording');
eq(v.switches[5].does, 'Emails Samantha and Krystal and Zach when someone signs up on findcdscaregivers.com.'.replace('Samantha and Krystal and Zach', 'Samantha, Krystal and Zach'), 'sign-up alerts wording (two samantha addresses said once)');
eq(v.switches[6].warn, 'This one reaches caregivers and families.', 'the stronger warning');
eq(v.switches[6].confirmOn, 'From now on, texts and emails written in Caregiver Match go to real caregivers and families.', 'messages confirm wording');
ok(v.switches[0].last && v.switches[0].last.by === '' && v.switches[0].last.script, 'before any change: says it was set by an install script');

// ---------- who can change ----------
await refuses(() => s.handle('krystal@mo-care.com', { action: 'set', key: 'lead_ghl', on: false }), 'Only Samantha can change switches.', 'Krystal cannot change one');
await refuses(() => s.handle('zach@mo-care.com', { action: 'set', key: 'lead_ghl', on: false }), 'Only Samantha can change switches.', 'Zach cannot yet (March)');
await refuses(() => s.handle('samantha@mo-care.com', { action: 'set', key: 'staff_emails', on: true }), 'That is not one of the switches.', 'only the seven');
await refuses(() => s.handle('samantha@mo-care.com', { action: 'set', key: 'lead_ghl', on: 'yes' }), 'Say on or off.', 'on/off only');
await refuses(() => s.handle('samantha@mo-care.com', { action: 'set', key: 'wellsky_check', on: true }), 'This switch is not set up yet, so it cannot be changed here.', 'a switch whose setting does not exist');

// ---------- changing one, and the record ----------
let r = await s.handle('Samantha@mo-care.com', { action: 'set', key: 'lead_ghl', on: false });
eq(r.message, 'Done. Turned off by Samantha.', 'the done line');
const g = (await pg.query(`select value, updated_by from cds_match_settings where key='lead_ghl'`)).rows[0];
ok(g.value.live === false && g.updated_by === 'samantha@mo-care.com', 'the setting changed, by her');
const a = (await pg.query(`select actor, action, target, detail from cds_audit where target='lead_ghl'`)).rows;
eq(a.map(x => [x.actor, x.action, x.detail.from, x.detail.to]), [['samantha@mo-care.com', 'switch', 'on', 'off']], 'recorded: who, from, to');
T += 60000;
await s.handle('samantha@caringcds.com', { action: 'set', key: 'messages_live', on: true });
ok((await pg.query(`select value from cds_match_settings where key='messages_live'`)).rows[0].value === true, 'a plain true/false setting (messages_live) works');
await s.handle('samantha@caringcds.com', { action: 'set', key: 'messages_live', on: false });
ok((await pg.query(`select value from cds_match_settings where key='messages_live'`)).rows[0].value === false, 'and back off');
const o = (await pg.query(`select value from cds_match_settings where key='lead_alerts'`)).rows[0].value;
ok(Array.isArray(o.recipients) && o.text_from === 9, 'changing a switch leaves the rest of the setting alone');
v = await s.handle('krystal@mo-care.com', { action: 'list' });
const lg = v.switches.find(x => x.key === 'lead_ghl');
ok(lg.on === false && lg.last.by === 'Samantha' && lg.last.to === 'off', 'everyone sees the new state and who changed it');
await s.handle('samantha@mo-care.com', { action: 'set', key: 'lead_ghl', on: true });

// ---------- adding Zach in March is one data change ----------
await pg.query(`update cds_match_settings set value = '["samantha@mo-care.com","samantha@caringcds.com","zach@mo-care.com"]'::jsonb where key='switch_owners'`);
ok((await s.handle('zach@mo-care.com', { action: 'list' })).canChange, 'Zach can change them once added');

// ---------- wording rules ----------
const words = JSON.stringify(SWITCHES.map(x => [x.label, x.warn, x.on, x.off, x.does({})]));
ok(!/[—–]/.test(words), 'no em dashes');
ok(!/plain (language|english)/i.test(words), 'no "plain language"');
const page = readFileSync(ROOT + '/index.html', 'utf8');
ok(page.includes('What runs on its own in the CDS hub. Only Samantha can change these. Every change is recorded.'), 'the card says who can change them');
ok(!/confirm\(/.test(page.slice(page.indexOf('// SWITCHES (2026-10-20'), page.indexOf('function addAttendant()'))), 'the switches never use a pop-up');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
