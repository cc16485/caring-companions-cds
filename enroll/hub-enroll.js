// CDS Hub · lead profile · Enrollment packet (2026-10-22, Samantha: "build the
// consumer packet into the hub to send easily with the click of a button").
// One button sends the consumer their private link (caringcds.com/enroll). The card
// then shows each form as it is signed, every text and email (sent, held or failed:
// nothing fails silently), the one-tap agent signature, and the signed PDFs.
// mountLeadEnroll(el, { api, lead, PDFLib, blank, consumer })
// No em dashes in anything a person reads.
import { buildEnrollPdfs } from './enroll-pdf.js?v=1';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = iso => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const TONE = { g: 'background:#E7F5EE;color:#1f7a4d', b: 'background:#E3F1F0;color:#0f5f61', y: 'background:#F6E7B8;color:#6b4e00', '': 'background:#eef2f5;color:#334' };
const MSG = { practice: ['Practice', 'b'], held: ['Waiting (switch off)', 'y'], sent: ['Sent', 'g'], failed: ['FAILED', 'r'] };

// What the lead already holds, so the consumer starts with it filled in.
export function leadForPacket(p) {
  const R = p.referral || {};
  return { id: p.id, type: p.type, name: p.name, phone: p.phone, email: p.email, county: p.county, leavingAgency: p.leavingAgency,
    street: R.street, apt: R.apt, city: R.city, zip: R.zip };
}

// All the signed forms as one PDF, for the office to keep or print.
export async function onePdf(PDFLib, files) {
  const doc = await PDFLib.PDFDocument.create();
  for (const f of files) { const src = await PDFLib.PDFDocument.load(f.bytes); (await doc.copyPages(src, src.getPageIndices())).forEach(pg => doc.addPage(pg)); }
  return doc.save();
}

export function mountLeadEnroll(el, opts) {
  const { api, lead } = opts;
  let busy = false, msg = '', tone = '';
  const say = (m, t) => { msg = m; tone = t || ''; };

  async function draw() {
    let g;
    try { g = await api('enrollGet', { lead_id: lead.id }); }
    catch (e) { el.innerHTML = card('<div class="field-note" style="color:#b42318">' + esc(e.message) + '</div>'); return; }
    const p = g.packet, st = g.status;
    const kind = lead.type === 'pccp' ? 'move' : 'new';
    const reach = String(lead.phone || '').replace(/\D/g, '').length >= 10 || /@/.test(lead.email || '');
    let h = '';
    if (!p || !p.sent_at) {
      h += '<div class="field-note" style="margin:4px 0 10px">Texts and emails ' + esc((lead.name || 'them').split(' ')[0]) + ' a private link to sign on their phone. ' +
        (kind === 'move' ? '8 forms, moving from another agency: ours, the Previous Vendor form, 8821, 2678 and Missouri 2827.' : '9 forms, new to CDS: ours, SS-4, 8821, 2678 and Missouri 2827 for them, and 2643A for you.') +
        ' What we already know is filled in. Reminders go out by themselves on day 2 and day 4.</div>' +
        (reach ? '<button class="btn btn-primary" data-act="send">Send enrollment packet</button>'
               : '<div class="field-note" style="color:#b42318">Add a cell phone or email to this lead first.</div>');
    } else {
      h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:2px 0 8px"><span class="badge" style="' + (TONE[st.tone] || TONE['']) + '">' + esc(st.label) + '</span>' +
        '<span class="field-note">Sent ' + esc(when(p.sent_at)) + (p.sent_by ? ' by ' + esc(p.sent_by.split('@')[0]) : '') + (p.opened_at ? '. Opened ' + esc(when(p.opened_at)) : '. Not opened yet') + '.' +
        (p.who ? ' Signing: ' + esc(p.who) + '.' : '') + '</span></div>';
      h += '<table style="width:100%;border-collapse:collapse;font-size:13px">' + g.forms.map(f => '<tr style="border-top:1px solid var(--gray-200)">' +
        '<td style="padding:5px 4px">' + (f.signed_at ? '✓ ' : '○ ') + esc(f.title) + (f.who === 'office' ? ' <span class="field-note">(you sign)</span>' : '') + '</td>' +
        '<td style="padding:5px 4px;text-align:right;color:var(--gray-600);white-space:nowrap">' + (f.signed_at ? esc(when(f.signed_at)) : '') + (f.agent_at ? ', agent ' + esc(when(f.agent_at)) : '') + '</td></tr>').join('') + '</table>';
      if (st.consumer_done && !st.done) h += '<div style="margin-top:12px;padding:10px 12px;background:#E3F1F0;border-radius:8px">' +
        '<b>Your turn:</b> sign ' + (kind === 'move' ? '2678 Part 3 and 2827' : '2643A, 2678 Part 3 and 2827') + ' as the agent.' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input type="text" id="enrAgentName" placeholder="Type your full name" style="font-size:13px;padding:6px 9px;min-width:200px">' +
        '<button class="btn btn-primary" data-act="agent">Sign as agent</button></div></div>';
      if (st.consumer_done) h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-outline" data-act="pdf">Download the signed forms (one PDF)</button></div>' +
        '<div class="field-note" style="margin-top:4px">To fax or mail them one by one, open the consumer\'s Tax Setup and press "Get the signed forms from the Hub packet".</div>';
      if (!st.consumer_done) h += '<div style="margin-top:10px"><button class="btn btn-outline btn-sm" data-act="send">Send the link again</button></div>';
      if (g.messages.length) h += '<div style="margin-top:12px;font-weight:700;color:var(--primary);font-size:13px">Texts and emails</div>' + g.messages.map(m => {
        const [l, t] = MSG[m.status] || [m.status, ''];
        return '<div style="font-size:12.5px;padding:3px 0"><span class="badge" style="' + (t === 'r' ? 'background:#FDECEA;color:#b42318' : TONE[t] || '') + '">' + esc(l) + '</span> ' +
          esc(m.channel === 'sms' ? 'Text' : 'Email') + ' to ' + esc(m.to_display) + ', ' + esc(when(m.created_at)) + (m.error ? '<div class="field-note">' + esc(m.error) + '</div>' : '') + '</div>';
      }).join('');
    }
    el.innerHTML = card(h + (msg ? '<div style="margin-top:10px;font-size:13px;font-weight:600;color:' + (tone === 'bad' ? '#b42318' : '#1f7a4d') + '">' + esc(msg) + '</div>' : ''));
  }
  const card = inner => '<div class="card" style="padding:18px 20px;margin-bottom:14px"><b style="color:var(--primary)">Enrollment packet</b>' + inner + '</div>';

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || busy) return;
    busy = true; b.disabled = true;
    try {
      const act = b.dataset.act;
      if (act === 'send') {
        const r = await api('enrollSend', { lead: leadForPacket(lead) });
        const held = r.messages.filter(s => s === 'held').length, failed = r.messages.filter(s => s === 'failed').length;
        say(failed ? 'Something did not send. See below.' : held ? 'Saved. The text and email are waiting in Messages because the Enrollment packet texts switch is off.' : 'Sent.', failed ? 'bad' : '');
        if (r.practice_link) say(msg + ' Practice link: ' + r.practice_link);
      } else if (act === 'agent') {
        await api('enrollOfficeSign', { lead_id: lead.id, typed_name: (el.querySelector('#enrAgentName') || {}).value || '' });
        say('Signed as agent.');
        // The signed forms file themselves into the consumer's Tax Setup (2026-10-25, her ask).
        if (opts.afterAgentSigned) {
          try { say('Signed as agent. ' + await opts.afterAgentSigned(lead)); }
          catch (err2) { say('Signed as agent. ' + err2.message + ' Open Tax Setup and press Get the signed forms from the Hub packet.', 'bad'); }
        }
      } else if (act === 'pdf') {
        if (!opts.PDFLib) throw new Error('The PDF library did not load. Reload the page.');
        const data = await api('enrollPdfData', { lead_id: lead.id });
        const files = await buildEnrollPdfs(opts.PDFLib, data, { blank: opts.blank, consumer: opts.consumer ? opts.consumer() : null });
        const bytes = await onePdf(opts.PDFLib, files);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        a.download = 'Enrollment packet ' + String(lead.name || '').replace(/[^A-Za-z0-9 _-]/g, '') + '.pdf';
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        say('Downloaded. It holds Social Security numbers: keep it off shared drives.');
      }
    } catch (err) { say(err.message, 'bad'); }
    busy = false;
    draw();
  });
  draw();
  return { refresh: draw };
}
