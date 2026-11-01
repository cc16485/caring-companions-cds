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
  document: { getElementById: id => (els[id] = els[id] || { value: '', textContent: '' }) },
};
ctx.cdsMatchApi = (act, inp) => { ctx.calls.push([act, inp]); return Promise.resolve({ packet: ctx.next }); };
vm.createContext(ctx);
vm.runInContext(code + ';this.consumerFacts=consumerFacts;this.factsLines=factsLines;this.profPacketFetch=profPacketFetch;this._ageOn=_ageOn;this.openFacts=openFacts;this.saveFacts=saveFacts;this._profPacket=_profPacket;', ctx);
const line = (k, v) => '[' + k + ': ' + v + ']';

// Nothing anywhere
const c = { id: 'c1', name: 'Margaret Sample' };
data.consumers = [c];
let html = ctx.factsLines(c, line);
ok(/Address: .*not on file/.test(html) && /Date of birth: .*not on file/.test(html) && /Back-up person: .*none on file/.test(html), 'nothing on file says so');
ok(/Change address, birthday or back-up plan/.test(html), 'office can type them');

// From the lead
data.pipeline = [{ id: 'L1', name: 'Margaret Sample', movedToConsumers: '2026-10-20', dob: '1941-03-02', referral: { street: '1200 E Example St', city: 'Springfield', zip: '65804' } }];
let F = ctx.consumerFacts(c);
ok(F.address.v === '1200 E Example St, Springfield, MO 65804' && F.address.from === 'their lead', 'address from their lead');
ok(F.dob.v === '1941-03-02' && ctx._ageOn('1941-03-02') === 85 && ctx._ageOn('1941-12-02') === 84, 'date of birth and age');

// From the Hub packet (wins over the lead)
ctx.next = { signed_at: '2026-10-22T15:00:00Z', answers: { street: '9 New Rd', apt: 'B', city: 'Nixa', state: 'MO', zip: '65714', dob: '1941-03-02', mail_same: 'no', mail_street: 'PO Box 5', mail_city: 'Nixa', mail_state: 'MO', mail_zip: '65714' },
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
html = ctx.factsLines(c, line);
ok(/Mail goes to/.test(html) && !/Emergency contact/.test(html), 'Overview lines');

// Office types a correction: it wins, and the signed packet is untouched
ctx.openFacts('c1');
ok(els.cf_street.value === '9 New Rd' && els.cf_b1_name.value === 'Tom Sample' && els.cf_dob.value === '1941-03-02', 'edit box starts from what Overview shows');
els.cf_street.value = '10 New Rd'; els.cf_zip.value = '657';
ctx.saveFacts();
ok(!data.consumers[0].facts && els.cf_err.textContent, 'bad zip refused');
els.cf_zip.value = '65714'; els.cf_b2_name.value = 'Ann Lee'; els.cf_b2_phone.value = '417-555-0100';
ctx.saveFacts();
F = ctx.consumerFacts(data.consumers[0]);
ok(F.address.v === '10 New Rd B, Nixa, MO 65714' && F.address.from === 'typed on this profile' && F.backup2.v === 'Ann Lee, 417-555-0100', 'typed values win');
ok(data.consumers[0].facts.by === 'samantha@mo-care.com' && ctx.next.answers.street === '9 New Rd', 'who saved it is kept; packet answers unchanged');
ok(!/—/.test(code), 'no em dashes');

console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
