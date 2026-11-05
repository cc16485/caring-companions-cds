// Their attendant on a lead (2026-11-05): the phone must be a phone number, and a last name that was
// saved in the phone box (Dorsey Harrell: "Andrea" / "Volley") goes back on the name without wiping dates.
//   node tests/lead_attendant_phone_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(ROOT + '/index.html', 'utf8');
const a = page.indexOf('let _laPicks = [];');
const b = page.indexOf('function removeLeadAttendant()');
const code = page.slice(a, b);

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const els = {};
const el = id => (els[id] = els[id] || { value: '', textContent: '', innerHTML: '', style: {}, classList: { contains: () => false } });
const data = { pipeline: [] };
const ctx = {
  getData: k => data[k], setData: (k, v) => { data[k] = v; },
  document: { getElementById: el }, openModal: () => {}, closeModal: () => {}, renderPipeline: () => {}, renderLeadProfile: () => {},
  CDSRules: { relatedPeople: () => [] }, esc: s => String(s), _lprofId: null, laStartOnboarding: () => {},
};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.openLeadAttendant = openLeadAttendant; this.saveLeadAttendant = saveLeadAttendant;', ctx);

// Dorsey's record as it is now.
data.pipeline = [{ id: 'D', name: 'Dorsey Harrell', notes: [], attendant: { name: 'Andrea', phone: 'Volley', email: null, empeonInvited: '2026-11-05' } }];
ctx.openLeadAttendant('D');
ok(els.la_name.value === 'Andrea Volley' && els.la_phone.value === '', 'last name moved back to the name');
ok(els.la_err.textContent.includes('phone number'), 'asks for the phone');

// Letters in the phone box are refused.
els.la_phone.value = 'Volley'; ctx.saveLeadAttendant();
ok(els.la_err.textContent.includes('10 digits') && data.pipeline[0].attendant.phone === 'Volley', 'not a phone, not saved');

// A real number saves, formatted, and her checklist dates stay.
els.la_phone.value = '417.555.0123'; ctx.saveLeadAttendant();
const att = data.pipeline[0].attendant;
ok(att.name === 'Andrea Volley' && att.phone === '(417) 555-0123', 'saved name and phone');
ok(att.empeonInvited === '2026-11-05', 'same person keeps her dates');
ok(data.pipeline[0].notes.at(-1).text.startsWith('Attendant details updated'), 'note says updated, not changed');

// Empty phone is still allowed (not known yet).
ctx.openLeadAttendant('D'); els.la_phone.value = ''; ctx.saveLeadAttendant();
ok(data.pipeline[0].attendant.phone === null, 'phone can be left empty');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
