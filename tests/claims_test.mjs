// Claims for eMOMED (2026-11-16): the rules in claims/claims.js. Every name and number here is made up
// (this repo is public).   node tests/claims_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(ROOT + '/claims/claims.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- the authorization's sections ----------
const sec = (label, pa, rows) => 'Service Type\nStart Date\nEnd Date\nProvider\nGHE 1\nGHE 2\nPrior Authorization\n' + label + '\n04/01/2026\n02/28/2027\nSOME AGENCY LLC, 4170000000\nN/A\nN/A\n' + pa +
  '\nStart Date\nEnd Date\nProcedure Code\nAuthorized Units\n' + rows.map(r => r.join('\n')).join('\n') + '\n';
const pdf = 'Home & Community Based Services Care Plan\n' +
  sec('PC - CDS', '20260900000001', [['11/01/2026', '11/30/2026', 'T1019', '590'], ['12/01/2026', '12/31/2026', 'T1019', '602']]) +
  sec('FMS', '20260900000002', [['11/01/2026', '11/30/2026', 'T2040', '1']]) +
  sec('CDS - ILW', '20260900000003', [['11/01/2026', '11/30/2026', 'T1019', '76']]) +
  sec('SMS', '20260900000004', [['11/01/2026', '11/30/2026', 'T2028', '3']]) +
  sec('CM', '20260900000005', [['11/01/2026', '11/30/2026', 'T2024', '1']]);
const rows = C.readAuthSections(pdf);
eq(rows.map(r => r.svc + ' ' + r.code + ' ' + r.units), ['PC - CDS T1019 590', 'PC - CDS T1019 602', 'FMS T2040 1', 'CDS - ILW T1019 76', 'SMS T2028 3', 'CM T2024 1'], 'each row gets its section');
eq(rows[3].pa, '20260900000003', 'each section keeps its own prior authorization number');
eq(rows[0].start + ' ' + rows[0].end, '2026-11-01 2026-11-30', 'dates as ISO');
eq(C.readAuthSections('Care Plan with no sections'), [], 'no sections: nothing (the old reader handles it)');

// serviceOf for records read before sections existed
const oldRec = { months: [{ start: '2026-11-01', code: 'T1019', units: 590 }, { start: '2026-11-01', code: 'T1019', units: 76 }, { start: '2026-11-01', code: 'T2040', units: 1 }] };
eq(C.serviceOf(oldRec.months[0], oldRec), null, 'two T1019 rows in one month without labels: cannot tell');
eq(C.serviceOf(oldRec.months[2], oldRec), 'FMS', 'T2040 is FMS without a label');
eq(C.serviceOf({ start: '2026-11-01', code: 'T1019' }, { months: [{ start: '2026-11-01', code: 'T1019' }] }), 'PC - CDS', 'one T1019 row is State Plan');
eq(C.normSvc('cds - ilw'), 'CDS - ILW', 'label any case');

// ---------- schedule ----------
eq(C.nextCutoff(new Date(2026, 10, 16, 10)), { cutoff: '2026-11-20', paid: '2026-12-04' }, 'Mon Nov 16: next is Fri Nov 20, paid Dec 4');
eq(C.nextCutoff(new Date(2026, 10, 20, 16)).cutoff, '2026-11-20', 'Nov 20 at 4 pm: still open');
eq(C.nextCutoff(new Date(2026, 10, 20, 17)).cutoff, '2026-12-11', 'Nov 20 at 5 pm: closed, next Dec 11');
eq(C.nextCutoff(new Date(2027, 6, 1)), null, 'past the schedule we know: null, not a guess');

// ---------- eMOMED export ----------
const exp = [['ICN', 'NPI', 'Participant DCN', 'Claim Status', 'Claim Type', 'Billed Amt', 'Paid Amt', 'First D.O.S.', 'Last D.O.S.'],
  ['4926315119401', '1000000000', '11111111', 'I - To Be Paid', 'MEDICAL', '1,694.52', '1,694.52', '11/02/2026', '11/14/2026'],
  ['4926266219184', '1000000000', '22222222', 'N - Denied', 'MEDICAL', '92.80', '0.00', '11/10/2026', '11/10/2026'],
  ['7026224025698', '1000000000', '11111111', 'P - Paid', 'MEDICAL', '-575.30', '-266.73', '10/01/2026', '10/06/2026'],
  ['', '', '', 'Total', '', '', '', '', '']];
const claims = C.readEmomedExport(exp);
eq(claims.map(c => c.status), ['to be paid', 'denied', 'paid'], 'statuses');
eq(claims[0].billed, 1694.52, 'money with commas');
eq(claims[0].first, '2026-11-02', 'US dates to ISO');
ok(C.isAdjustment(claims[2]), 'a negative claim is an adjustment');
let threw = false; try { C.readEmomedExport([['Name', 'Amount']]); } catch (e) { threw = /eMOMED claim list/.test(e.message); }
ok(threw, 'a wrong file says so');
eq(C.mergeClaims([{ icn: '1', status: 'to be paid' }], [{ icn: '1', status: 'paid' }, { icn: '2', status: 'paid' }]).map(c => c.icn + c.status), ['2paid', '1paid'], 'later upload wins');

// ---------- care logs ----------
eq(C.logMinutes({ clockIn: '2026-11-02T09:00:00', clockOut: '2026-11-02T11:40:00' }), 160, 'minutes');
eq(C.logMinutes({ clockIn: '2026-11-02T09:00:00', clockOut: null }), 0, 'never clocked out counts nothing');
eq(C.mergeLogs([{ consumer: 'Doe, Jan', clockIn: '2026-11-02T09:00:00', clockOut: null }], [{ consumer: 'Jan Doe', clockIn: '2026-11-02T09:00:00', clockOut: '2026-11-02T10:00:00' }]).length, 1, 'same shift from two places is one');
eq(C.mergeLogs([{ consumer: 'Doe, Jan', clockIn: '2026-11-02T09:00:00', clockOut: '2026-11-02T10:00:00' }], [{ consumer: 'Jan Doe', clockIn: '2026-11-02T09:00:00', clockOut: null }])[0].clockOut, '2026-11-02T10:00:00', 'the copy with a clock out wins');
eq(C.runs(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05']), 'Nov 1 to Nov 3, Nov 5', 'runs of days');

// ---------- the worksheet ----------
const consumers = [{ id: 'a', name: 'Jan Doe', dcn: '11111111', status: 'Active' }, { id: 'b', name: 'Sam Roe', dcn: '33333333', status: 'Active' },
                   { id: 'c', name: 'Pat Lee', dcn: '', status: 'Active' }, { id: 'd', name: 'Old One', dcn: '9', status: 'Inactive' }];
const auths = { records: {
  A: { dcn: '11111111', consumer: 'Jan Doe', months: rows },
  B: { dcn: '33333333', consumer: 'Sam Roe', months: [{ start: '2026-11-01', end: '2026-11-30', code: 'T1019', units: 40 }] } } };
const log = (who, day, from, to) => ({ consumer: who, clockIn: day + 'T' + from + ':00', clockOut: to ? day + 'T' + to + ':00' : null });
const logs = [
  log('Doe, Jan', '2026-11-16', '08:00', '18:00'), log('Doe, Jan', '2026-11-17', '08:00', '18:07'),  // 600 + 607 = 1207 min = 80 units
  log('Roe, Sam', '2026-11-16', '09:00', '13:00'), log('Roe, Sam', '2026-11-17', '09:00', '12:00'),  // 240 + 180 = 28 units
  log('Lee, Pat', '2026-11-16', '09:00', '10:00')];
const work = { dx: { a: 'F03.90', b: 'G20' }, rates: { 'T1019 U2': 5.23, 'T1019 U6': 5.23, 'T2040 U6': 100, 'T2024 U6': 120 }, cm: {} };
const now = new Date(2026, 10, 18, 9);
let W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers, auths, logs, coverage: [{ from: '2026-11-09', to: '2026-11-17' }], claims: [], work, now });
const jan = W.blocks.find(b => b.consumerId === 'a'), sam = W.blocks.find(b => b.consumerId === 'b'), pat = W.blocks.find(b => b.consumerId === 'c');
eq(jan.units, 80, 'whole units, not rounded up (1207 min = 80.47)');
eq(jan.lines.map(l => l.code + ' ' + l.mod + ' ' + l.units), ['T1019 U2 80'], 'all State Plan first');
eq(jan.lines[0].charge, 418.4, 'charge = units x rate');
eq(jan.lines[0].pa, '20260900000001', 'the line carries its prior authorization');
ok(jan.notes.some(n => /FMS is billed once/.test(n)), 'FMS waits for the claim that ends the month');
eq(jan.stops, [], 'Jan is ready');
eq(sam.lines[0].units, 28, 'Sam 28 units');
ok(pat.stops.some(s => /No DCN/.test(s)) && pat.stops.some(s => /No DSDS authorization/.test(s)) && pat.stops.some(s => /diagnosis/.test(s)), 'Pat stops: DCN, authorization, diagnosis');
ok(!W.blocks.some(b => b.consumerId === 'd'), 'inactive consumers are left out');
eq(W.cutoff.cutoff, '2026-11-20', 'next cutoff on the worksheet');
eq(W.totals.charge, Math.round((418.4 + 28 * 5.23) * 100) / 100, 'total of ready lines');

// State Plan used up: the rest goes to waiver, then over
const many = []; for (let d = 1; d <= 30; d++) many.push(log('Doe, Jan', '2026-11-' + String(d).padStart(2, '0'), '06:00', '11:30'));   // 30 x 330 = 9900 min = 660 units
W = C.buildWorksheet({ from: '2026-11-01', to: '2026-11-30', consumers: consumers.slice(0, 1), auths, logs: many, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work, now: new Date(2026, 11, 2) });
let b = W.blocks[0];
eq(b.lines.filter(l => l.code === 'T1019').map(l => l.mod + ' ' + l.units), ['U2 590', 'U6 70'], '590 State Plan, then 70 waiver');
ok(b.lines.some(l => l.code === 'T2040' && l.units === 1 && l.from === '2026-11-01' && l.to === '2026-11-30'), 'FMS 1 for the month once waiver CDS was delivered');
ok(b.stops.some(s => /case management contact/.test(s)), 'case management needs its contact written down');
W = C.buildWorksheet({ from: '2026-11-01', to: '2026-11-30', consumers: consumers.slice(0, 1), auths, logs: many, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work: Object.assign({}, work, { cm: { a: { '2026-11': '2026-11-12' } } }), now: new Date(2026, 11, 2) });
b = W.blocks[0];
ok(b.lines.some(l => l.code === 'T2024'), 'case management billed once its contact is saved');
eq(b.stops, [], 'ready');
const lots = []; for (let d = 1; d <= 30; d++) lots.push(log('Doe, Jan', '2026-11-' + String(d).padStart(2, '0'), '06:00', '12:00'));   // 720 units
W = C.buildWorksheet({ from: '2026-11-01', to: '2026-11-30', consumers: consumers.slice(0, 1), auths, logs: lots, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work, now: new Date(2026, 11, 2) });
ok(W.blocks[0].notes.some(n => /54 units .* over the authorization/.test(n)), 'units over both authorizations are named, not billed');
// FMS not billed with no waiver unit
W = C.buildWorksheet({ from: '2026-11-01', to: '2026-11-30', consumers: consumers.slice(0, 1), auths, logs: logs.slice(0, 2), coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work, now: new Date(2026, 11, 2) });
ok(!W.blocks[0].lines.some(l => l.code === 'T2040') && W.blocks[0].notes.some(n => /FMS cannot be billed/.test(n)), 'no waiver unit, no FMS');

// already billed in eMOMED
const billed = [{ icn: '4926000000001', dcn: '11111111', status: 'paid', billed: 52.3, paid: 52.3, first: '2026-11-16', last: '2026-11-16' },
                { icn: '4926000000002', dcn: '11111111', status: 'denied', billed: 20, paid: 0, first: '2026-11-10', last: '2026-11-10' }];
W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers: consumers.slice(0, 1), auths, logs, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: billed, work, now });
b = W.blocks[0];
eq(b.lines[0].from + ' ' + b.lines[0].units, '2026-11-17 40', 'the day already on a claim is left out (607 min = 40 units)');
ok(b.notes.some(n => /already on a claim/.test(n)) && b.notes.some(n => /Denied in eMOMED: claim 4926000000002/.test(n)), 'says what was left out and the denial');
ok(b.notes.some(n => /About 10 units are already billed/.test(n)), 'units already billed worked out from the money');

// stops
W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers: consumers.slice(0, 1), auths, logs: logs.concat([log('Doe, Jan', '2026-11-17', '19:00', null)]), coverage: [{ from: '2026-11-17', to: '2026-11-30' }], claims: [], work, now });
b = W.blocks[0];
ok(b.notes.some(s => /never clocked out \(Nov 17\)/.test(s)), 'a shift never clocked out is named');
eq(b.lines[0].from + ' ' + b.lines[0].to, '2026-11-16 2026-11-16', 'and its whole day is held back (Nov 17 had a good shift too)');
ok(b.stops.some(s => /does not have WellSky care logs for Nov 16/.test(s)), 'a day the hub has no care logs for stops the claim');
W = C.buildWorksheet({ from: '2025-11-01', to: '2025-11-30', consumers: consumers.slice(0, 1), auths: { records: { A: { dcn: '11111111', months: [{ svc: 'PC - CDS', start: '2025-11-01', end: '2025-11-30', code: 'T1019', units: 100 }] } } }, logs: [log('Doe, Jan', '2025-11-03', '08:00', '09:00')], coverage: [{ from: '2025-11-01', to: '2025-11-30' }], claims: [], work, now: new Date(2026, 10, 18) });
ok(W.blocks[0].stops.some(s => /12-month filing limit/.test(s)), 'past 12 months stops');
W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers: consumers.slice(0, 1), auths: { records: { A: { dcn: '11111111', months: oldRec.months.map(m => Object.assign({ end: '2026-11-30' }, m)) } } }, logs, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work, now });
ok(W.blocks[0].stops.some(s => /cannot tell State Plan from waiver/.test(s)), 'an old two-line authorization asks for a re-upload');
W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers: consumers.slice(0, 1), auths, logs, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work: Object.assign({}, work, { rates: {} }), now });
ok(W.blocks[0].stops.some(s => /No rate saved for T1019 U2/.test(s)), 'no rate stops');
// months split
W = C.buildWorksheet({ from: '2026-11-30', to: '2026-12-01', consumers: consumers.slice(0, 1), auths, logs: [log('Doe, Jan', '2026-11-30', '08:00', '09:00'), log('Doe, Jan', '2026-12-01', '08:00', '09:00')], coverage: [{ from: '2026-11-01', to: '2026-12-31' }], claims: [], work, now: new Date(2026, 11, 3) });
eq(W.blocks.map(b => b.month + ':' + b.lines.filter(l => l.code === 'T1019').map(l => l.from + '/' + l.to).join()), ['2026-11:2026-11-30/2026-11-30', '2026-12:2026-12-01/2026-12-01'], 'a range across two months becomes two claims');
// supplies
W = C.buildWorksheet({ from: '2026-11-01', to: '2026-11-30', consumers: consumers.slice(0, 1), auths, logs: [], coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work: Object.assign({}, work, { buys: [{ consumerId: 'a', month: '2026-11', svc: 'SMS', amount: 48.5, approved: false }] }), now: new Date(2026, 11, 2) });
ok(W.blocks[0].stops.some(s => /mark the DSDS approval/.test(s)), 'supplies need the approval marked');
W = C.buildWorksheet({ from: '2026-11-01', to: '2026-11-30', consumers: consumers.slice(0, 1), auths, logs: [], coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work: Object.assign({}, work, { buys: [{ consumerId: 'a', month: '2026-11', svc: 'SMS', amount: 48.5, approved: true, day: '2026-11-05' }] }), now: new Date(2026, 11, 2) });
ok(W.blocks[0].lines.some(l => l.code === 'T2028' && l.charge === 48.5), 'approved supplies billed at cost');
// sent lines drop out of the total
const k = 'a|2026-11|T1019 U2|2026-11-16|2026-11-17';
W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers: consumers.slice(0, 1), auths, logs, coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work: Object.assign({}, work, { sent: { [k]: { icn: '4926', at: 'x', by: 'sam' } } }), now });
ok(W.blocks[0].lines[0].sent && W.totals.charge === 0, 'a line marked sent shows it and leaves the total');

// Not Complete in WellSky, and matching by DCN (2026-11-16, her WellSky export)
W = C.buildWorksheet({ from: '2026-11-16', to: '2026-11-17', consumers: consumers.slice(0, 1), auths,
  logs: [{ consumer: 'Somebody Else', dcn: '011111111', clockIn: '2026-11-16T08:00:00', clockOut: '2026-11-16T10:00:00' },
         { consumer: 'Doe, Jan', dcn: '11111111', clockIn: '2026-11-17T08:00:00', clockOut: '2026-11-17T10:00:00', incomplete: true }],
  coverage: [{ from: '2026-11-01', to: '2026-11-30' }], claims: [], work, now });
b = W.blocks[0];
eq(b.lines.map(l => l.from + ' ' + l.units), ['2026-11-16 8'], 'a care log with the DCN matches whatever the name; the Not Complete day is held back');
ok(b.notes.some(n => /1 care log is Not Complete in WellSky \(Nov 17, 2 hours\)/.test(n)), 'and named');
const HC = await import(ROOT + '/claims/hub-claims.js');
const rr = HC.readCareLogRows([['Client Name', 'Caregiver Name', 'Official Clock In', 'Official Clock Out', 'Status', 'Insurance ID'],
  ['Doe, Jan', 'Hill, Hal', 46282.25, 46282.375, 'Complete', '011111111'], ['Doe, Jan', 'Hill, Hal', 46283.25, 46283.375, 'Not Complete', '011111111'],
  ['Doe, Jan', 'Hill, Hal', 46284.25, '', 'In Progress', '011111111'], ['Doe, Jan', 'Hill, Hal', 46285.25, 46285.3, 'Cancelled by Client', '011111111']]);
eq(rr.logs.map(x => [x.clockIn, x.clockOut, !!x.incomplete, x.dcn]), [['2026-09-17T06:00:00', '2026-09-17T09:00:00', false, '011111111'], ['2026-09-18T06:00:00', '2026-09-18T09:00:00', true, '011111111'], ['2026-09-19T06:00:00', null, false, '011111111']], 'WellSky export: Excel times, Not Complete kept and marked, In Progress has no clock out');
eq(rr.skipped, 1, 'cancelled by client skipped');
const fake = { utils: { decode_cell: k => ({ c: k.charCodeAt(0) - 65, r: +k.slice(1) - 1 }), encode_range: r => String.fromCharCode(65 + r.s.c) + (r.s.r + 1) + ':' + String.fromCharCode(65 + r.e.c) + (r.e.r + 1) } };
eq(HC.fullRange(fake, { '!ref': 'A1:C1', A1: 1, C1: 1, V375: 1 })['!ref'], 'A1:V375', 'a sheet labelled one row long is read in full');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
