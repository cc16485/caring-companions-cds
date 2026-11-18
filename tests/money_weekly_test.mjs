// Money > Weekly (2026-11-17). The numbers behind the week-by-week billing vs payroll page.
//   node tests/money_weekly_test.mjs
import { buildWeeks, billedDays, batches, rejected, weekOf, payrollFor, money, OURS_FROM } from '../money/weekly.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SCHED = [{ cutoff: '2026-11-20', paid: '2026-12-04' }];
const claims = [
  { icn: 'A1', dcn: '1', consumer: 'Ann', status: 'to be paid', billed: 100, paid: 80, batch: 'Week Nov 8 to 14', cutoff: '2026-11-20', first: '2026-11-08', last: '2026-11-10', enteredBy: 'x 2026-11-17',
    lines: [{ from: '2026-11-08', to: '2026-11-08', code: 'T1019', mod: 'U2', units: 10, charge: 50, approved: 50 }, { from: '2026-11-10', to: '2026-11-10', code: 'T1019', mod: 'U2', units: 10, charge: 50, approved: 30, why: 'Billed 10 units, Sandata had 6' }] },
  // replaced claim + its credit net out; the replacement counts once
  { icn: 'R0', dcn: '2', consumer: 'Bo', status: 'replaced', billed: 200, paid: 200, batch: 'Week Nov 8 to 14', cutoff: '2026-11-20', first: '2026-11-08', last: '2026-11-13', lines: [{ from: '2026-11-08', to: '2026-11-08', code: 'T1019', mod: 'U2', units: 40, charge: 200, approved: 200 }] },
  { icn: '70C', dcn: '2', consumer: 'Bo', status: 'to be paid', billed: -200, paid: -200, batch: 'Week Nov 8 to 14', cutoff: '2026-11-20', first: '2026-11-08', last: '2026-11-13', note: 'Credit for replaced claim R0' },
  { icn: 'R1', dcn: '2', consumer: 'Bo', status: 'to be paid', billed: 60, paid: 60, batch: 'Week Nov 8 to 14', cutoff: '2026-11-20', first: '2026-11-10', last: '2026-11-10', lines: [{ from: '2026-11-10', to: '2026-11-10', code: 'T1019', mod: 'U2', units: 12, charge: 60, approved: 60 }] },
  // an older claim kept only as totals, and a denied one
  { icn: 'OLD', dcn: '3', status: 'to be paid', billed: 90, paid: 90, first: '2026-11-01', last: '2026-11-05' },
  { icn: 'DEN', dcn: '4', consumer: 'Cy', status: 'denied', billed: 40, paid: 0, first: '2026-11-02', last: '2026-11-02', note: 'Denied: no EVV match (CO 95)' },
];
ok(weekOf('2026-11-08') === '2026-11-08' && weekOf('2026-11-14') === '2026-11-08' && weekOf('2026-11-15') === '2026-11-15', 'pay weeks run Sunday to Saturday');
const days = billedDays(claims);
ok(!days.some(d => d.icn === 'R0' || d.icn === '70C'), 'a replaced claim and its credit are left out');
ok(days.filter(d => d.icn === 'R1').length === 1, 'the replacement counts once');
const W = buildWeeks({ claims, payrollWeeks: { '2026-11-08': { hours: 10, byAttendant: { Jo: 10 } } }, runs: [{ payStart: '11/01/2026', payEnd: '11/07/2026', gross: 70, checkDate: '11/12/2026' }], payRate: 15, schedule: SCHED });
const w8 = W.find(w => w.week === '2026-11-08'), w1 = W.find(w => w.week === '2026-11-01');
ok(W[0].week === '2026-11-08', 'newest week first');
ok(w8.billed === 160 && w8.approved === 140 && w8.zero === 20 && w8.zeroLines === 1, 'week billed, approved and $0 from the day lines: ' + JSON.stringify([w8.billed, w8.approved, w8.zero, w8.zeroLines]));
ok(w8.payroll && !w8.payroll.exact && w8.payroll.amount === 150 && /About/.test(w8.payroll.source), 'no Empeon summary yet: payroll is about hours x pay rate, marked about');
ok(w8.made === -10 && w8.margin === -7, 'what we made = approved minus payroll');
ok(w8.paydays.length === 1 && w8.paydays[0] === '2026-12-04', 'payday from the cutoff schedule');
ok(w1.payroll && w1.payroll.exact && w1.payroll.amount === 70 && w1.billed === 130 && w1.approved === 90 && w1.zero === 40, 'Empeon summary is exact; a denied claim counts as billed, not approved');
ok(payrollFor('2026-11-15', {}, [], 15) === null, 'no payroll at all: nothing is made up');
const B = batches(claims, SCHED);
const b = B.find(x => x.batch === 'Week Nov 8 to 14');
ok(b && b.claims === 2 && b.billed === 160 && b.approved === 140 && b.zeroLines === 1 && b.payday === '2026-12-04' && b.entered === '2026-11-17', 'batch totals: ' + JSON.stringify(b));
ok(B[B.length - 1].batch === 'Earlier claims', 'claims with no batch are grouped last');
const R = rejected(claims);
ok(R.length === 2 && R.some(r => r.icn === 'DEN' && /CO 95/.test(r.why)) && R.some(r => r.icn === 'A1' && /Sandata had 6/.test(r.why)), 'rejected list: $0 days and denied claims with their reasons');
ok(w8.rebill === 20 && w8.madeAfter === 10 && w1.rebill === 0, 'Sandata-unit $0 days count as to rebill, a denied claim does not: ' + JSON.stringify([w8.rebill, w8.madeAfter]));
const Wp = buildWeeks({ claims: [{ icn: 'P', dcn: '9', status: 'to be paid', billed: 10, paid: 10, first: '2026-09-01', last: '2026-09-01' }, { icn: 'Q', dcn: '9', status: 'to be paid', billed: 10, paid: 10, first: '2026-09-15', last: '2026-09-15' }], payrollWeeks: {}, runs: [], schedule: [] });
ok(OURS_FROM === '2026-09-17' && Wp.find(w => w.week === '2026-08-30').paradigm === 'all' && Wp.find(w => w.week === '2026-09-13').paradigm === 'part', 'weeks before Sep 17 are marked as Paradigm billed (all or part)');
ok(money(1234.5) === '$1,234.50' && money(-10) === '-$10.00', 'money format');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
