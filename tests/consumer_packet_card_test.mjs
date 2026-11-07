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
  prNorm: s => String(s).trim().toLowerCase(),
  _niceDay: iso => 'D' + iso, esc: s => String(s).replace(/</g, '&lt;'),
  getData: k => ({ pipeline: [{ id: 9000000000001, name: 'Pat Example', type: 'pccp', movedToConsumers: '2026-11-01' }, { id: 9000000000002, name: 'Robin Sample', type: 'lead', phone: '4175550100' }] })[k],
  document: { getElementById: id => (id === 'profEnroll' ? el : null) },
  fileHubPacketForLead: () => 'filed',
  calls: [],
};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.profPacketLine = profPacketLine; this.mountProfileEnroll = mountProfileEnroll;', ctx);
// Stand in for the dynamic import of the lead card.
vm.runInContext('mountProfileEnroll = ' + ctx.mountProfileEnroll.toString().replace("await import('./enroll/hub-enroll.js?v=4')", 'HUB') + '; this.mountProfileEnroll = mountProfileEnroll;', ctx);
ctx.cdsMatchApi = (a, b) => { ctx.calls.push([a, b]); return Promise.resolve({ ok: true }); };
ctx.HUB = { mountLeadEnroll: (e, o) => mounted.push(o) };

const line = (l, v) => '[' + l + ': ' + v + ']';
const c = { id: 'c1', name: 'Pat Example' };

ok(ctx.profPacketLine(c, line) === '', 'nothing while not fetched');
ctx._profPacket.c1 = { busy: true };
ok(ctx.profPacketLine(c, line) === '', 'nothing while checking');
ctx._profPacket.c1 = { packet: null };
ok(ctx.profPacketLine(c, line).includes('not sent yet') && ctx.profPacketLine(c, line).includes('send it'), 'no packet: offers to send it');
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
// 2026-11-06: no packet yet, someone already on Consumers. The card mounts here so it can be sent.
mounted.length = 0;
ctx._profPacket.c1 = { packet: null };
await ctx.mountProfileEnroll(c);
ok(mounted.length === 1 && mounted[0].lead.id === 9000000000001, 'no packet: card mounts with the lead moved to Consumers');
// A Starting consumer made Active: their own lead from starting.leadId, whatever its name match.
mounted.length = 0;
const s2 = { id: 'c2', name: 'Robin  Sample', status: 'active', starting: { kind: 'new', leadId: '9000000000002' } };
ctx._profPacket.c2 = { packet: null };
await ctx.mountProfileEnroll(s2);
ok(mounted.length === 1 && mounted[0].lead.id === 9000000000002, 'Active from Starting: uses their Starting lead');
await mounted[0].afterSent({ id: 9000000000002 });
ok(ctx.calls.some(([a, b]) => a === 'enrollLinkConsumer' && b.lead_id === 9000000000002 && b.consumer_id === 'c2') && !ctx._profPacket.c2, 'after a send the packet is tied to the consumer');
// Added straight to Consumers with no lead at all: the card still mounts from the consumer record.
mounted.length = 0;
const c3 = { id: 'c3', name: 'Lee Nobody', phone: '4175550111', email: 'lee@example.com', facts: { street: '1 Main', city: 'Joplin', zip: '64801' }, starting: { kind: 'move' } };
ctx._profPacket.c3 = { packet: null };
await ctx.mountProfileEnroll(c3);
const L3 = mounted[0] && mounted[0].lead;
ok(L3 && L3.id === 'consumer-c3' && L3.type === 'pccp' && L3.phone === '4175550111' && L3.city === 'Joplin', 'no lead: built from the consumer record');
// A packet whose lead was removed: no second packet under a new id.
mounted.length = 0;
ctx._profPacket.c3 = { packet: { lead_id: 'gone' } };
await ctx.mountProfileEnroll(c3);
ok(!mounted.length && el.innerHTML.includes('no longer in Leads'), 'packet with a removed lead is not re-sent');
// A packet sent from the consumer record opens again from the consumer record.
ctx._profPacket.c3 = { packet: { lead_id: 'consumer-c3', status: 'Sent' } };
await ctx.mountProfileEnroll(c3);
ok(mounted.length === 1 && mounted[0].lead.id === 'consumer-c3', 'packet sent from the profile opens again');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
