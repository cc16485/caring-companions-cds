// Tax copy-and-paste sheets and the EIN letter reader (2026-11-17). Made-up people only.   node tests/tax_help_test.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = {}; vm.runInNewContext(fs.readFileSync(ROOT + '/starting/tax-help.js', 'utf8'), { window: win, console });
const T = win.TaxHelp;
let pass = 0, failN = 0; const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const data = { ssn: '123456789', answers: { first: 'Pat', last: 'Example', street: '1 Main St', city: 'Nixa', state: 'MO', zip: '65714', county: 'Christian', phone: '(417) 555-0142', email: 'pat@example.com', dob: '1948-03-02', first_pay: '2026-11-26' },
  agency: { street: '100 Office Way', city: 'Springfield', state: 'MO', zip: '65804', signer: 'Office Signer', legal: 'Example Agency LLC', dba: 'Example Agency', phone: '417-555-0100', fax: '417-555-0101', mo_signer_title: 'Program Manager', email: 'office@example.com' } };
let S = T.sheets(data, { ein: '' }, false);
ok(S.map(s => s.key).join() === 'ss4,mo,des,empeon', 'four sheets: IRS, Missouri, DES, Empeon');
const row = (k, label) => (S.find(s => s.key === k).rows.find(r => r[0].startsWith(label)) || [])[1];
ok(row('ss4', 'SSN') === '***-**-6789', 'SSN hidden until Show', row('ss4', 'SSN'));
ok(row('ss4', 'Legal name') === 'Pat Example' && row('ss4', 'County and state') === 'Christian County, MO' && row('ss4', 'First date wages') === '11/26/2026', 'SS-4 answers from the packet');
ok(/Not on file yet/.test(row('mo', 'Federal EIN')), 'Missouri says the EIN comes first');
S = T.sheets(data, { ein: '981234567', moTaxId: '12345678' }, true);
ok(row('ss4', 'SSN') === '123-45-6789' && row('mo', 'Federal EIN') === '98-1234567' && row('empeon', 'Missouri tax ID') === '12345678', 'after Show and with the numbers on file');
ok(!/[—–]/.test(JSON.stringify(S)), 'no em dashes');
const letter = 'Department of the Treasury Internal Revenue Service Date of this notice: 11-20-2026 Employer Identification Number: 98-1234567 Form: SS-4 WE ASSIGNED YOU AN EMPLOYER IDENTIFICATION NUMBER Thank you for applying for an Employer Identification Number (EIN). We assigned you EIN 98-1234567.';
ok(T.findEin(letter).ein === '98-1234567', 'finds the EIN on the letter', T.findEin(letter));
ok(T.findEin('Your Medicaid card. Phone 417-555-0142').err, 'no EIN: says so');
console.log(pass + ' passed, ' + failN + ' failed'); process.exit(failN ? 1 : 0);
