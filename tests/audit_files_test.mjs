// The attendant audit file (her yes to the mockup, 2026-10-23): 19 CSR 15-8.400 (5)(A), (5)(B), (8)(B), (10).
//   node tests/audit_files_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HP = await import(ROOT + '/caregiver-match/hub-packet.js');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const now = new Date('2026-10-23T12:00:00');
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const wellsky = { shifts: { at: '2026-10-22T13:00:00Z', consumers: [{ name: 'Caldwell, Ruth', shifts: [{ date: '2026-10-21', attendant: 'Webb, Marcus', hours: 5 }] }] },
  analytics: { firstLast: { at: '2026-10-22T12:00:00Z', attendants: [{ name: 'Webb, Marcus', first: '2026-01-16' }] } } };

// A new-application attendant: every paper on file, I-9 on time, checks before the first shift.
const packet = { pool: { first: 'Marcus', last: 'Webb' }, answers: { relation: 'friend', related: 'no', has_consumer: 'yes', guardian: 'no', gets_cds: 'no', mfraud: 'no', qualified: 'yes', ssn: undefined },
  packet: { consumer_name: 'Ruth Caldwell', i9_done_at: '2026-01-19T15:00:00Z', empeon_done_at: '2026-01-14T15:00:00Z', orientation_done_at: '2026-01-13T15:00:00Z' },
  forms: { contract: { signed_at: '2026-01-13T15:00:00Z', countersigned_at: '2026-01-14T15:00:00Z' }, handbook: { signed_at: '2026-01-13T15:00:00Z' }, pay: { signed_at: '2026-01-13' }, units: { signed_at: '2026-01-13' } },
  screening: { checks: [{ key: 'age18', clear: true, at: '2026-01-13' }, { key: 'edl', clear: true, at: '2026-01-13' }] } };
const roster = { id: 'a1', name: 'Marcus Webb', consumer: 'Ruth Caldwell', hiredate: '2026-01-14', fcsrDate: '2026-01-13', edlDate: '2026-10-02', leieDate: '2026-10-11' };
const proofs = [{ check: 'fcsr', checked_on: '2026-01-13' }, { check: 'edl', checked_on: '2026-01-13' }, { check: 'edl', checked_on: '2026-10-02' }, { check: 'oig', checked_on: '2026-01-13' }, { check: 'oig', checked_on: '2026-10-11' }];
const good = HP.attendantFileHtml({ name: 'Marcus Webb', roster, packet, proofs, wellsky, now, corrections: [{ attendant: 'Marcus Webb', formReceived: 'yes' }] });
const g = text(good);
ok(/No gaps found/.test(g) && /6 of 6 sections complete/.test(g), 'complete file: no gaps, 6 of 6 ' + (g.match(/Gaps in this file.{0,300}/) || [''])[0]);
ok(/I-9 Section 2 Jan 19, 2026, within 3 business days of starting/.test(g), 'I-9 Monday Jan 19 is within 3 business days of Friday Jan 16');
ok(/Before first shift \(Jan 16, 2026\)/.test(g) && (g.match(/ Yes /g) || []).length >= 3, 'checks before the first shift');
ok(/Not the consumer’s guardian Confirmed/.test(g) && /No past Medicaid fraud Confirmed/.test(g), 'Missouri questions confirmed from the application');
ok(!/ssn|SSN \d|birth date:/i.test(good.replace('No SSN or birth date is printed', '')), 'no SSN or birth date printed');
ok(/1 \(1 with signed forms\)/.test(g), 'shifts fixed by hand, with signed forms');

// Someone hired before the online application: Roster and GHL papers only; FCSR after the first shift, no orientation date.
const old = text(HP.attendantFileHtml({ name: 'Gil Gray', roster: { id: 'a2', name: 'Gil Gray', consumer: 'Ann Alpha', fcsrDate: '2026-02-01', edlDate: '2026-05-01', leieDate: '2026-10-11' },
  proofs: [{ check: 'application', date_found: '2025-12-20' }, { check: 'fcsr', checked_on: '2026-02-01' }],
  wellsky: { analytics: { firstLast: { attendants: [{ name: 'Gray, Gil', first: '2026-01-05' }] } } }, now }));
ok(/first FCSR check \(2026-02-01\) was after the first shift \(2026-01-05\)/.test(old), 'FCSR after the first shift is a gap');
ok(/EDL recheck overdue since 2026-08-01/.test(old), 'EDL every 3 months: overdue');
ok(/no orientation date on file/.test(old), 'no orientation date is a gap');
ok(/Signed application on file \(from GHL\)/.test(old) && /In Empeon \(hired before the online application\)/.test(old), 'older attendant: application from GHL, I-9 in Empeon');

// Late I-9 is a gap; an ended attendant shows the consumer's words.
const late = text(HP.attendantFileHtml({ name: 'Marcus Webb', roster: Object.assign({}, roster, { status: 'inactive', ended: { why: 'consumer', how: 'call', on: '2026-10-20', said: 'I do not need him anymore', by: 'zach@caringcds.com' } }),
  packet: Object.assign({}, packet, { packet: Object.assign({}, packet.packet, { i9_done_at: '2026-01-23T15:00:00Z' }) }), proofs, wellsky, now }));
ok(/I-9 Section 2 done 2026-01-23, after the 3-business-day limit \(2026-01-21\)/.test(late), 'late I-9 is a gap');
ok(/I do not need him anymore/.test(late) && /No longer working/.test(late), 'ending with the consumer’s words');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
