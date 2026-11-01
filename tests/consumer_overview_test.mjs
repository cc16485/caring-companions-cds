// Consumer profile Overview: address, date of birth and back-up plan (2026-11-01).
// Runs the hub's own code from index.html with small stand-ins for the page.
//   node tests/consumer_overview_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(ROOT + '/index.html', 'utf8');
const a = page.indexOf('// Address, date of birth and back-up plan on Overview'), b = page.indexOf('// Her first-shift checklist');
const code = page.slice(a, b);

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const data = { consumers: [], pipeline: [] };
const els = {};
const ctx = {
  getData: k => data[k], setData: (k, v) => { data[k] = v; },
  prNorm: s => String(s).toLowerCase().replace(/[^a-z]/g, ''), lpDate: v => (v ? String(v).slice(0, 10) : ''),
  _niceDay: iso => 'D' + iso, _todayIso: () => '2026-11-01', _acWho: () => 'samantha@mo-care.com',
  esc: s => String(s).replace(/</g, '&lt;'), renderProfile: () => {}, openModal: () => {}, closeModal: () => {},
  _profileId: 'c1', _profTab: 'overview', calls: [],
  secs: {}, focused: null,
  document: { getElementById: id => (els[id] = els[id] || { value: '', textContent: '' }),
    querySelectorAll: () => ['address', 'dob', 'backup', 'signer', 'evv', 'agency'].map(k => (ctx.secs[k] = ctx.secs[k] || { dataset: { sec: k }, style: {} })),
    querySelector: q => ({ focus: () => { ctx.focused = q; } }) },
  setTimeout: (f) => f(),
};
ctx.cdsMatchApi = (act, inp) => { ctx.calls.push([act, inp]); return Promise.resolve({ packet: ctx.next }); };
vm.createContext(ctx);
vm.runInContext(code + ';this.consumerFacts=consumerFacts;this.factsLines=factsLines;this.profPacketFetch=profPacketFetch;this._ageOn=_ageOn;this.evvLine=evvLine;this.oldAgencyLine=oldAgencyLine;this.openFacts=openFacts;this.saveFacts=saveFacts;this._profPacket=_profPacket;', ctx);
const line = (k, v) => '[' + k + ': ' + v + ']';

// Nothing anywhere
const c = { id: 'c1', name: 'Margaret Sample' };
data.consumers = [c];
let html = ctx.factsLines(c, line);
ok(/Address: .*not on file/.test(html) && /Date of birth: .*not on file/.test(html) && /Back-up person: .*none on file/.test(html), 'nothing on file says so');
ok((html.match(/\+ Add/g) || []).length === 4 && !/Edit/.test(html), 'each empty line has its own Add link');
ok(/openFacts\('c1','dob'\)/.test(html) && /openFacts\('c1','signer'\)/.test(html), 'each link opens its own part');
ok(/openFacts\('c1','evv'\)/.test(ctx.evvLine(c, line)), 'clock-in has its own link');
ctx.openFacts('c1', 'dob');
ok(ctx.secs.dob.style.display === '' && ctx.secs.address.style.display === 'none' && ctx.secs.backup.style.display === 'none', 'the box shows only date of birth');
ok(els.cf_title.textContent === 'Margaret Sample: Date of birth' && /dob/.test(ctx.focused), 'titled and ready to type');
ctx.openFacts('c1');
ok(Object.values(ctx.secs).every(d => d.style.display === ''), 'without a part, the whole box shows');
ok(/Who signs for them: .*not on file/.test(html), 'who signs: not on file');
ok(/Clock-in method: .*not on file/.test(ctx.evvLine(c, line)), 'clock-in: not on file');
ok(ctx.oldAgencyLine(c, line) === '', 'old agency hidden for someone not moving');
ctx.openFacts('c1');
ok(els.cf_rep_name.value === '' && els.cf_evv.value === '', 'edit box opens with no packet');

// From the lead
data.pipeline = [{ id: 'L1', name: 'Margaret Sample', movedToConsumers: '2026-10-20', type: 'pccp', leavingAgency: 'Example Home Care CDS', dob: '1941-03-02', referral: { street: '1200 E Example St', city: 'Springfield', zip: '65804' } }];
let F = ctx.consumerFacts(c);
ok(F.address.v === '1200 E Example St, Springfield, MO 65804' && F.address.from === 'their lead', 'address from their lead');
ok(F.oldAgency.v === 'Example Home Care CDS' && F.oldAgency.from === 'their lead', 'old agency from the lead');
ok(F.dob.v === '1941-03-02' && ctx._ageOn('1941-03-02') === 85 && ctx._ageOn('1941-12-02') === 84, 'date of birth and age');

// From the Hub packet (wins over the lead)
ctx.next = { kind: 'move', signed_at: '2026-10-22T15:00:00Z', who: { name: 'Linda Sample', rel: 'Daughter, POA' }, answers: { who: 'rep', evv: 'app', v1: 'Old Agency CDS', v1_phone: '417-555-0111', street: '9 New Rd', apt: 'B', city: 'Nixa', state: 'MO', zip: '65714', dob: '1941-03-02', mail_same: 'no', mail_street: 'PO Box 5', mail_city: 'Nixa', mail_state: 'MO', mail_zip: '65714' },
  backup: { b1_name: 'Tom Sample', b1_rel: 'Son', b1_phone: '417-555-0199', signed_at: '2026-10-22T15:01:00Z' } };
ctx.profPacketFetch(c);
await new Promise(r => setTimeout(r, 5));
ok(ctx.calls.length === 1 && ctx.calls[0][0] === 'enrollProfile' && ctx.calls[0][1].consumer_id === 'c1', 'asks the server once');
ctx.profPacketFetch(c);
ok(ctx.calls.length === 1, 'not again within 5 minutes');
F = ctx.consumerFacts(c);
ok(F.address.v === '9 New Rd B, Nixa, MO 65714' && /Hub packet, signed D2026-10-22/.test(F.address.from), 'address from the signed packet');
ok(F.mailing === 'PO Box 5, Nixa, MO 65714', 'mailing address when different');
ok(F.backup1.v === 'Tom Sample (Son), 417-555-0199' && /Back-up plan form, signed/.test(F.backup1.from) && !F.backup2.v, 'back-up person as signed, no emergency contact');
ok(F.signer.v === 'Linda Sample (Daughter, POA)' && /Hub packet/.test(F.signer.from), 'who signs from the packet');
ok(/Clock-in method: WellSky app on the attendant's phone/.test(ctx.evvLine(c, line)), 'clock-in method on Hours');
ok(/Old CDS agency: Old Agency CDS, 417-555-0111/.test(ctx.oldAgencyLine(c, line)), 'old agency on Tax');
ctx.next.answers.who = 'me'; ok(ctx.consumerFacts(c).signer.v === 'They sign for themselves', 'signs for themselves'); ctx.next.answers.who = 'rep';
html = ctx.factsLines(c, line);
ok(/Mail goes to/.test(html) && !/Emergency contact/.test(html), 'Overview lines');
ok(/✎ Edit/.test(html) && /openFacts\('c1','address'\)/.test(html), 'filled lines say Edit');

// Office types a correction: it wins, and the signed packet is untouched
ctx.openFacts('c1');
ok(els.cf_rep_name.value === 'Linda Sample' && els.cf_rep_rel.value === 'Daughter, POA' && els.cf_evv.value === 'app' && els.cf_v1.value === 'Old Agency CDS', 'edit box has who signs, clock-in, old agency');
ok(els.cf_street.value === '9 New Rd' && els.cf_b1_name.value === 'Tom Sample' && els.cf_dob.value === '1941-03-02', 'edit box starts from what Overview shows');
els.cf_street.value = '10 New Rd'; els.cf_zip.value = '657';
ctx.saveFacts();
ok(!data.consumers[0].facts && els.cf_err.textContent, 'bad zip refused');
els.cf_zip.value = '65714'; els.cf_rep_rel.value = ''; ctx.saveFacts();
ok(!data.consumers[0].facts && /related/.test(els.cf_err.textContent), 'who signs needs a relationship');
els.cf_rep_rel.value = 'Daughter'; els.cf_evv.value = 'phone'; els.cf_b2_name.value = 'Ann Lee'; els.cf_b2_phone.value = '417-555-0100';
ctx.saveFacts();
F = ctx.consumerFacts(data.consumers[0]);
ok(F.signer.v === 'Linda Sample (Daughter)' && /Home phone/.test(F.evv.v) && F.evv.from === 'typed on this profile', 'typed who signs and clock-in win');
ok(F.address.v === '10 New Rd B, Nixa, MO 65714' && F.address.from === 'typed on this profile' && F.backup2.v === 'Ann Lee, 417-555-0100', 'typed values win');
ok(data.consumers[0].facts.by === 'samantha@mo-care.com' && ctx.next.answers.street === '9 New Rd', 'who saved it is kept; packet answers unchanged');
ok(!/—/.test(code), 'no em dashes');

console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
