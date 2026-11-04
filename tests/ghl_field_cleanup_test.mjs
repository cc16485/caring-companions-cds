// The one-time GHL custom field cleanup (2026-11-04): only the 32 approved fields, matched by exact name and key,
// never a file or signature field, never one that has gained values since the audit.
//   node tests/ghl_field_cleanup_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(ROOT + '/supabase/functions/_shared/office/ghl-field-cleanup.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

ok(C.APPROVED.length === 32, '32 approved fields');
ok(!C.APPROVED.some(a => ['FILE_UPLOAD', 'SIGNATURE'].includes(a.dataType)), 'no file or signature field approved');
ok(!C.APPROVED.some(a => /county|social security|fcsr|edl|oig|result|trigger|🔁/i.test(a.name) && a.name !== "Consumer's Address"), 'nothing the hub reads or a workflow triggers on');
ok(C.APPROVED.every(a => a.maxFilled <= 5), 'every approved field was (nearly) empty');

const A = C.APPROVED;
const fields = A.map((a, i) => ({ id: 'f' + i, name: a.name, fieldKey: a.fieldKey, dataType: a.dataType }))
  .concat([{ id: 'keep1', name: 'County', fieldKey: 'contact.county', dataType: 'TEXT' },
           // the used twin that shares a key with an approved empty field
           { id: 'twin', name: 'Do you already have someone you would like to hire as your caregiver?', fieldKey: 'contact.do_you_already_have_someone_you_would_like_to_hire_as_your_caregiver', dataType: 'RADIO' }]);
let rows = C.plan(fields, {});
ok(rows.length === 32 && rows.every(r => r.ok), 'all 32 pass when empty');
ok(!rows.some(r => r.id === 'keep1' || r.id === 'twin'), 'County and the used twin are never touched');

const addr = A.findIndex(a => a.name === "Consumer's Address");
rows = C.plan(fields, { ['f' + addr]: 5, f0: 2 });
ok(rows[addr].ok, 'address with its 5 values still goes');
ok(!rows[0].ok && /2 contacts/.test(rows[0].why), 'a field that gained values is left alone');

rows = C.plan(fields.filter(f => f.id !== 'f3'), {});
ok(rows[3].why === 'already gone' && !rows[3].ok, 'missing field: already gone');
rows = C.plan(fields.concat([{ ...fields[4], id: 'dup' }]), {});
ok(!rows[4].ok && /more than one/.test(rows[4].why), 'two matches: left alone');
rows = C.plan(fields.map(f => f.id === 'f5' ? { ...f, dataType: 'FILE_UPLOAD' } : f), {});
ok(!rows[5].ok, 'type changed to a file field: left alone');
rows = C.plan(fields.map(f => f.id === 'f6' ? { ...f, name: f.name + ' ' } : f), {});
ok(rows[6].why === 'already gone', 'name must match exactly');

const src = readFileSync(ROOT + '/supabase/functions/ghl-field-cleanup/index.ts', 'utf8');
ok((src.match(/method: 'DELETE'/g) || []).length === 1 && /if \(!r\.ok\) continue/.test(src), 'deletes only rows that passed');
ok(/mode === 'look'\) return/.test(src), 'look changes nothing');
ok(!/getUser/.test(src), 'no hub sign-in can run it, only the step code');
ok(/locationId !== CDS_LOCATION/.test(src), 'CDS sub-account only');

console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
