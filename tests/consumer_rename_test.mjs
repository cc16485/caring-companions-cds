// Change a consumer's name (2026-11-05): the lead, authorizations, billing and payroll lines move with it.
// Runs the hub's own code from index.html with small stand-ins for the page.
//   node tests/consumer_rename_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(ROOT + '/index.html', 'utf8');
const a = page.indexOf("// Change a consumer's name"), b = page.indexOf('// Her first-shift checklist');
const code = page.slice(a, b);

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const fresh = () => ({
  consumers: [{ id: 'c1', name: 'Dorsey Harrell', status: 'starting', starting: { leadId: 'L1' } }, { id: 'c2', name: 'Pat Other' }],
  pipeline: [{ id: 'L1', name: 'Dorsey Harrell' }, { id: 'L2', name: 'Dorsey Harrell' }, { id: 'L3', name: 'Pat Other', movedToConsumers: '2026-10-01' }],
  authorizations: { records: { a: { consumer: 'Dorsey  Harrell' }, b: { consumer: 'Pat Other' } } },
  billing: { entries: [{ consumer: 'DORSEY HARRELL', amount: 5 }, { consumer: 'Pat Other', amount: 7 }] },
  attendantWages: { entries: [{ consumer: 'Dorsey Harrell', gross: 1 }] },
});
let data = fresh(), writes = [];
const els = {};
const ctx = {
  getData: k => data[k], setData: (k, v) => { data[k] = v; writes.push(k); }, getObj: k => data[k] || {}, setObj: (k, v) => { data[k] = v; writes.push(k); },
  prNorm: s => String(s).toLowerCase().replace(/[^a-z]/g, ''), _acWho: () => 'samantha@mo-care.com',
  renderProfile: () => {}, openModal: () => {}, closeModal: k => { ctx.closed = k; }, setTimeout: f => f(),
  document: { getElementById: id => (els[id] = els[id] || { value: '', textContent: '', focus() {} }) },
};
vm.createContext(ctx);
vm.runInContext(code + ';this.renameConsumer=renameConsumer;this.openNameEdit=openNameEdit;this.saveNameEdit=saveNameEdit;this.nameEditLink=nameEditLink;', ctx);
const R = ctx.renameConsumer;

ok(R('c1', 'Dorothy Harrell') === '', 'saved');
const c1 = data.consumers[0];
ok(c1.name === 'Dorothy Harrell' && c1.nameHistory.length === 1 && c1.nameHistory[0].from === 'Dorsey Harrell' && c1.nameHistory[0].by, 'name and history');
ok(data.pipeline[0].name === 'Dorothy Harrell', 'their own lead moves with it');
ok(data.pipeline[1].name === 'Dorsey Harrell', 'a different lead with the same name is not touched (never became a consumer)');
ok(data.authorizations.records.a.consumer === 'Dorothy Harrell' && data.authorizations.records.b.consumer === 'Pat Other', 'authorizations matched by name move');
ok(data.billing.entries[0].consumer === 'Dorothy Harrell' && data.billing.entries[1].consumer === 'Pat Other', 'billing lines move');
ok(data.attendantWages.entries[0].consumer === 'Dorothy Harrell', 'payroll lines move');

data = fresh(); writes = [];
ok(R('c1', 'Pat  Other') === 'Another consumer already has that name.' && data.consumers[0].name === 'Dorsey Harrell' && !writes.length, 'no two consumers with one name; nothing saved');
ok(R('c1', 'Dorothy') === 'Type their first and last name.' && !writes.length, 'needs first and last');
ok(R('nope', 'A B') === 'That consumer is not in the hub.', 'unknown consumer');
ok(R('c1', 'Dorsey Harrell') === '' && !writes.length, 'same name: nothing saved');
ok(R('c1', '  dorsey   harrell ') === '' && data.consumers[0].name === 'dorsey harrell' && !writes.includes('billing'), 'capitals only: the name changes, matched records already agree');

// The box
data = fresh();
ctx.openNameEdit('c1');
ok(els.nm_id.value === 'c1' && els.nm_name.value === 'Dorsey Harrell', 'box opens with their name');
els.nm_name.value = 'Dorothy';
ctx.saveNameEdit();
ok(els.nm_err.textContent === 'Type their first and last name.' && data.consumers[0].name === 'Dorsey Harrell', 'error shows, nothing saved');
els.nm_name.value = 'Dorothy Harrell';
ctx.saveNameEdit();
ok(ctx.closed === 'nameModal' && data.consumers[0].name === 'Dorothy Harrell', 'saves and closes');
ok(/openNameEdit\('c1'\)/.test(ctx.nameEditLink({ id: 'c1' })) && /Edit name/.test(ctx.nameEditLink({ id: 'c1' })), 'Edit name link');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
