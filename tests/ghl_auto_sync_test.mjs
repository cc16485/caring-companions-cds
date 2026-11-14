// A consumer or attendant added in the hub goes to GoHighLevel by itself (2026-11-14, Samantha: "yes").
// Runs the hub's own code from index.html with a stand-in sync. Nothing leaves this machine.
//   node tests/ghl_auto_sync_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(ROOT + '/index.html', 'utf8');
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

const a = html.indexOf('function setData(key, val) {'), b = html.indexOf('function getObj(key)');
ok(a > 0 && b > a, 'found the save code');
const calls = [];
const make = new Function('calls', `
  let _store = {};
  const getData = k => Array.isArray(_store[k]) ? _store[k] : [];
  const _dbUpsert = (k, v) => 'write:' + k;
  const syncOneToGhl = (list, id, name, pending) => calls.push([list, id, name, pending]);
  ${html.slice(a, b)}
  return { setData, getData, seed: _ghlSeed, load: s => { _store = s; } };`);
const H = make(calls);

// loaded with two consumers and one attendant
H.load({ consumers: [{ id: 'c1', name: 'A One', phone: '4175550001' }, { id: 'c2', name: 'B Two', phone: '4175550002' }], attendants: [{ id: 'a1', name: 'C Three', phone: '4175550003' }] });
H.seed();
let list = H.getData('consumers'); list[0].backupPlan = true;
eq(H.setData('consumers', list), 'write:consumers', 'a save still returns its write');
eq(calls, [], 'editing someone who was already here sends nothing');

list.push({ id: 'c3', name: 'D Four', phone: '(417) 555-0004' });   // the hub changes the list in place, then saves
H.setData('consumers', list);
eq(calls, [['consumers', 'c3', 'D Four', 'write:consumers']], 'a new consumer goes to GoHighLevel once the save lands');
H.setData('consumers', list); H.setData('consumers', list);
ok(calls.length === 1, 'never twice');

const att = H.getData('attendants');
att.push({ id: 'pool-9', name: 'E Five', email: 'e@example.com' }, { id: 'a3', name: 'F Six' }, { id: 'a4', name: '', phone: '4175550009' });
H.setData('attendants', att);
eq(calls.slice(1), [['attendants', 'pool-9', 'E Five', 'write:attendants']], 'a new attendant with an email goes; no phone or email, or no name, does not');
H.setData('attendants', att);
ok(calls.length === 2, 'the ones left out are not tried again on every save');

H.setData('pipeline', [{ id: 'l9', name: 'Lead', phone: '4175550010' }]);
ok(calls.length === 2, 'leads keep their own trigger');

// a restore brings many at once: left to the Sync Everyone button
const many = H.getData('consumers').concat(Array.from({ length: 6 }, (_, i) => ({ id: 'r' + i, name: 'R ' + i, phone: '417555010' + i })));
H.setData('consumers', many);
ok(calls.length === 2, 'six new at once is a restore, not an add');

// someone else added a person and this browser reloaded: seeded, so not sent again from here
H.load({ consumers: [{ id: 'z1', name: 'Z', phone: '4175550100' }], attendants: [] }); H.seed();
H.setData('consumers', H.getData('consumers'));
ok(calls.length === 2, 'people loaded from the database are never re-sent');

ok(/_ghlSeed\(\);/.test(html.slice(html.indexOf('async function _loadAllData()'), html.indexOf('async function _loadAllData()') + 600)), 'seeded every time the hub loads');
const sync = html.slice(html.indexOf('async function syncOneToGhl'), html.indexOf('function _ghlToast'));
ok(!/[—–]/.test(sync), 'no em dashes in the messages');
ok(/Adding a lead, a consumer or an attendant already puts them in GoHighLevel by itself/.test(html), 'the Automations page says so');

console.log('\nghl auto sync: ' + pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
