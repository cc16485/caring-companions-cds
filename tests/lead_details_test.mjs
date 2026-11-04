// Edit details on the lead page (2026-11-04): open fills the form, save writes the lead, adds the note,
// keeps the address where the referral answers keep it, never wipes a birth date it cannot read.
//   node tests/lead_details_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(ROOT + '/index.html', 'utf8');
const a = page.indexOf('// Edit a lead\'s details and add a note, right on the lead page');
const b = page.indexOf('function renderLeadProfile(){');
const code = page.slice(a, b);

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const els = {};
const el = id => (els[id] = els[id] || { value: '', textContent: '', dataset: {}, options: [{ value: '' }, { value: 'Greene' }, { value: 'Taney' }], insertAdjacentHTML() {} });
const data = { pipeline: [] };
const synced = [];
const ctx = {
  getData: k => data[k], setData: (k, v) => { data[k] = v; return 'saved'; },
  document: { getElementById: el }, openModal: () => {}, closeModal: () => {}, renderPipeline: () => {}, renderLeadProfile: () => {},
  syncOneToGhl: (...x) => synced.push(x), _todayIso: () => '2026-11-04', lpDate: v => (v ? String(v).slice(0, 10) : ''),
  esc: s => String(s),
};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.openLeadDetails = openLeadDetails; this.saveLeadDetails = saveLeadDetails; this.leadAddress = leadAddress; this.ldtIsoDay = ldtIsoDay;', ctx);

// A plain lead, nothing but a name and phone.
data.pipeline = [{ id: 'L1', name: 'Pat Example', phone: '417-555-0100', type: 'lead', notes: [] }];
ctx.openLeadDetails('L1');
ok(els.ldt_first.value === 'Pat' && els.ldt_last.value === 'Example' && els.ldt_phone.value === '417-555-0100', 'form filled');
els.ldt_email.value = 'pat@example.com'; els.ldt_street.value = '12 Elm St'; els.ldt_city.value = 'Ozark'; els.ldt_zip.value = '65721';
els.ldt_county.value = 'Taney'; els.ldt_note.value = 'Daughter helps with paperwork';
ctx.saveLeadDetails();
let p = data.pipeline[0];
ok(p.email === 'pat@example.com' && p.street === '12 Elm St' && p.county === 'Taney', 'saved on the lead');
ok(p.notes.length === 1 && p.notes[0].text === 'Daughter helps with paperwork' && p.notes[0].date === '2026-11-04', 'note added');
ok(ctx.leadAddress(p) === '12 Elm St, Ozark, 65721', 'address line');
ok(synced.length === 1 && synced[0][1] === 'L1', 'synced to GoHighLevel');

// Name change.
ctx.openLeadDetails('L1'); els.ldt_last.value = 'Sample'; ctx.saveLeadDetails();
ok(data.pipeline[0].name === 'Pat Sample' && data.pipeline[0].notes.length === 1, 'renamed, no empty note');

// Bad email and no first name are refused.
ctx.openLeadDetails('L1'); els.ldt_email.value = 'nope'; ctx.saveLeadDetails();
ok(els.ldt_msg.textContent.includes('email') && data.pipeline[0].email === 'pat@example.com', 'bad email refused');
ctx.openLeadDetails('L1'); els.ldt_first.value = ''; ctx.saveLeadDetails();
ok(els.ldt_msg.textContent.includes('first name'), 'first name needed');

// A referral keeps its address in the referral answers.
data.pipeline = [{ id: 'L2', name: 'Lee Test', type: 'referral', referral: { street: '1 Old Rd', city: 'Nixa', dob: '03/04/1950' } }];
ctx.openLeadDetails('L2');
ok(els.ldt_street.value === '1 Old Rd' && els.ldt_dob.value === '1950-03-04', 'referral answers filled, date read');
els.ldt_street.value = '2 New Rd'; ctx.saveLeadDetails();
p = data.pipeline[0];
ok(p.referral.street === '2 New Rd' && !('street' in p) && p.dob === '1950-03-04', 'referral address updated in place');

// A birth date that cannot be read is kept.
data.pipeline = [{ id: 'L3', name: 'Kim Test', dob: 'spring 1948' }];
ctx.openLeadDetails('L3'); ok(els.ldt_dob.value === '', 'odd date left blank in the box');
ctx.saveLeadDetails(); ok(data.pipeline[0].dob === 'spring 1948', 'odd date kept');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
