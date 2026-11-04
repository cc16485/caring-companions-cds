// The Hub enrollment packet on the consumer profile (2026-11-04): the Overview line and the
// Tax and EIN card, behind her switch 'packetOnProfile'. Runs the hub's own code from index.html.
//   node tests/consumer_packet_card_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(ROOT + '/index.html', 'utf8');
const a = page.indexOf('// The Hub enrollment packet on the consumer\'s profile (2026-11-04');
const b = page.indexOf('\n}\n', page.indexOf('async function mountProfileEnroll')) + 3;
const code = page.slice(a, b);

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const el = { innerHTML: '' };
const mounted = [];
const ctx = {
  _profPacket: {}, _db: {}, ENROLL_BLANK: {}, window: { PDFLib: {} }, cdsMatchApi: () => {},
  _niceDay: iso => 'D' + iso, esc: s => String(s).replace(/</g, '&lt;'),
  getData: k => ({ pipeline: [{ id: 9000000000001, name: 'Pat Example', type: 'pccp' }] })[k],
  document: { getElementById: id => (id === 'profEnroll' ? el : null) },
  fileHubPacketForLead: () => 'filed',
};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.profPacketLine = profPacketLine; this.mountProfileEnroll = mountProfileEnroll;', ctx);
// Stand in for the dynamic import of the lead card.
vm.runInContext('mountProfileEnroll = ' + ctx.mountProfileEnroll.toString().replace("await import('./enroll/hub-enroll.js?v=2')", 'HUB') + '; this.mountProfileEnroll = mountProfileEnroll;', ctx);
ctx.HUB = { mountLeadEnroll: (e, o) => mounted.push(o) };

const line = (l, v) => '[' + l + ': ' + v + ']';
const c = { id: 'c1', name: 'Pat Example' };

ok(ctx.profPacketLine(c, line) === '', 'nothing while not fetched');
ctx._profPacket.c1 = { busy: true };
ok(ctx.profPacketLine(c, line) === '', 'nothing while checking');
ctx._profPacket.c1 = { packet: null };
ok(ctx.profPacketLine(c, line).includes('not sent from the Hub'), 'no packet');
ctx._profPacket.c1 = { packet: { lead_id: '9000000000001', status: 'Signed, needs your agent signature', sent_at: '2026-11-04T06:15:00Z', signed_at: '2026-11-04 13:45:32+00' } };
const l = ctx.profPacketLine(c, line);
ok(l.includes('Signed, needs your agent signature') && l.includes('D2026-11-04') && l.includes('9C6410') && l.includes("_profTab='tax'"), 'signed, waiting on agent: ' + l);
ctx._profPacket.c1.packet.status = 'Done';
ok(!ctx.profPacketLine(c, line).includes('9C6410'), 'done is not amber');

await ctx.mountProfileEnroll(c);
ok(mounted.length === 1 && mounted[0].lead.name === 'Pat Example' && mounted[0].consumer() === c, 'card mounted with her lead');
ok(mounted[0].afterAgentSigned({}) === 'filed' && !ctx._profPacket.c1, 'agent signing files forms and refreshes the profile packet');

ctx._profPacket.c1 = { packet: { lead_id: 'gone' } };
await ctx.mountProfileEnroll(c);
ok(el.innerHTML.includes('no longer in Leads'), 'lead gone');
ctx._profPacket.c1 = { packet: null };
await ctx.mountProfileEnroll(c);
ok(el.innerHTML.includes('Send it from their lead'), 'no packet note');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
