// Find attendants and consumers by name (2026-10-23, Samantha: "i need to be able to search
// atttendants and consumers by name"). The Consumers list search lives in index.html (rosterFind);
// the Attendants page search is in caregiver-match/hub-packet.js.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const html = readFileSync(ROOT + '/index.html', 'utf8');
const src = html.slice(html.indexOf('function rosterFind('), html.indexOf('\n}\n', html.indexOf('function rosterFind(')) + 2);
const rosterFind = new Function(src + '\nreturn rosterFind;')();
const f = q => rosterFind(q);
ok(f('')('Pamela Bell') && !f('').on, 'empty search shows everyone');
ok(f('bell')('Pamela Bell') && f('PAM')('Pamela Bell'), 'part of a name, any case');
ok(f('bell pam')('Pamela Bell') && f('Bell, Pam')('Pamela Bell'), 'either order, with a comma');
ok(f('smith')('Susan Barnwell', '417-555-0101', 'Anita Smith'), 'a consumer is found by their attendant\'s name');
ok(f('555 0101')('Susan Barnwell', '(417) 555-0101') && !f('9999')('Susan Barnwell', '(417) 555-0101'), 'digits match a phone');
ok(!f('bell zed')('Pamela Bell'), 'every word must match');
ok(f("o'neil")('Mary ONeil') && f('oneil')("Mary O'Neil"), 'apostrophes do not matter');
ok(/id="rosterSearch"[^>]*oninput="renderConsumers\(\)"/.test(html), 'the Consumers list has the search box');
ok(/id="hp_find"/.test(readFileSync(ROOT + '/caregiver-match/hub-packet.js', 'utf8')), 'the Attendants page has the search box');
console.log(`name search: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
