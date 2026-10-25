// One-click fax (2026-10-25, her yes). The rules behind the cds-fax server function.
//
// Out: a person clicks "Fax it now" on a Tax Setup step. Only the two Missouri forms can go
// (2643A, 2827; the e-signed 8821 goes online only), only to the fax number written here (never one sent by the
// page), and only the signed form already saved for that consumer. The Google script in
// intake@caringcds.com picks it up, emails it to eFax (the only address eFax lets send) and hands
// back eFax's receipt, which becomes the form's filing record on the consumer's Tax Setup.
// In: faxes that arrive in intake@caringcds.com are kept here and shown on Today until someone
// marks them handled.
// Her switch 'faxLive' (agency_data): off = nothing is sent and nothing new is taken in.
// No em dashes in anything a person reads.

// Not the 8821 (taken off 2026-10-25): the IRS takes an e-signed 8821 only online at IRS.gov/Submit8821.
export const FAX_FORMS = {
  'MO-2643A': { to: '15735221722', label: 'Form 2643A', office: 'the Missouri Department of Revenue' },
  'MO-2827':  { to: '15735221722', label: 'Form 2827', office: 'the Missouri Department of Revenue' },
};
export const FROM = 'intake@caringcds.com';
export const STALE_PICKUP_MIN = 10;     // queued this long and the Google script has not taken it
export const STALE_RECEIPT_MIN = 120;   // sent this long and no receipt from eFax
const MAX_PDF = 9 * 1024 * 1024;

export class FaxError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export const niceNumber = n => { const d = String(n || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(n || ''); };
const digits = n => String(n || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

// What the hub shows for one outgoing fax.
export function describe(row, now) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const mins = at => at ? (t - new Date(at).getTime()) / 60000 : 0;
  const out = { id: row.id, consumerId: row.consumer_id, consumerName: row.consumer_name, formKey: row.form_key, status: row.status,
    to: niceNumber(row.fax_to), requestedBy: row.requested_by, requestedAt: row.requested_at, sentAt: row.sent_at, resultAt: row.result_at,
    resultText: row.result_text || '', receiptPath: row.receipt_path || '', applied: !!row.applied_at, dismissed: !!row.dismissed_at, problem: false, stale: false };
  if ((row.status === 'queued' || row.status === 'sending') && mins(row.requested_at) > STALE_PICKUP_MIN) { out.stale = true; out.problem = true; }
  if (row.status === 'sent' && mins(row.sent_at) > STALE_RECEIPT_MIN) { out.stale = true; out.problem = true; }
  if (row.status === 'failed' || row.status === 'unclear') out.problem = true;
  if (row.dismissed_at) out.problem = false;
  return out;
}

export function createFax({ db, store, now = () => Date.now(), token = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0') }) {
  const q = async (text, params = []) => (await db.query(text, params)).rows;
  const nowIso = () => new Date(now()).toISOString();
  const live = async () => {
    const r = await q(`select data_value->>'live' as live from public.agency_data where data_key = 'faxLive' limit 1`);
    return !!(r[0] && r[0].live === 'true');
  };
  const consumer = async id => {
    const r = await q(`select data_value from public.agency_data where data_key = 'consumers' limit 1`);
    const list = (r[0] && Array.isArray(r[0].data_value)) ? r[0].data_value : [];
    return list.find(c => c && c.id === id) || null;
  };
  const row = async id => (await q(`select * from public.cds_fax where id = $1`, [id]))[0] || null;
  const who = e => String(e || '').trim().toLowerCase();

  // ---------- from the hub, signed in ----------
  async function hub(email, body) {
    const a = body && body.action;
    if (a === 'list') {
      const out = body.consumerId
        ? await q(`select * from public.cds_fax where direction = 'out' and consumer_id = $1 order by requested_at desc limit 40`, [String(body.consumerId)])
        : [];
      // For Today: every outgoing fax with a problem nobody has dismissed, and faxes that came in.
      // A failed fax that was sent again since drops off by itself.
      const open = await q(`select * from public.cds_fax f where direction = 'out' and dismissed_at is null and status not in ('delivered', 'cancelled')
                            and requested_at > now() - interval '30 days'
                            and not exists (select 1 from public.cds_fax n where n.direction = 'out' and n.consumer_id = f.consumer_id and n.form_key = f.form_key
                                            and n.requested_at > f.requested_at and n.status in ('queued', 'sending', 'sent', 'delivered'))
                            order by requested_at desc limit 50`);
      const incoming = await q(`select id, status, from_number, subject, file_path, requested_at, handled_by, handled_at, handled_note
                                from public.cds_fax where direction = 'in' and (status = 'new' or handled_at > now() - interval '2 days')
                                order by requested_at desc limit 50`);
      return { ok: true, live: await live(), from: FROM, forms: Object.fromEntries(Object.entries(FAX_FORMS).map(([k, v]) => [k, { ...v, toNice: niceNumber(v.to) }])),
        out: out.map(r => describe(r, now())), problems: open.map(r => describe(r, now())).filter(r => r.problem),
        incoming: incoming.map(r => ({ id: r.id, status: r.status, from: niceNumber(r.from_number) || 'an unknown number', subject: r.subject || '',
          filePath: r.file_path || '', receivedAt: r.requested_at, handledBy: r.handled_by || '', handledAt: r.handled_at, note: r.handled_note || '' })) };
    }
    if (a === 'queue') {
      if (!(await live())) throw new FaxError('One-click fax is switched off. Use Fax it via eFax instead.', 409);
      const spec = FAX_FORMS[body.formKey];
      if (!spec) throw new FaxError('That form cannot be faxed from here.');
      const c = await consumer(String(body.consumerId || ''));
      if (!c) throw new FaxError('That consumer was not found. Reload the hub and try again.', 404);
      const form = (Array.isArray(c.packetForms) ? c.packetForms : []).find(p => p && p.file === body.formKey && p.path);
      if (!form) throw new FaxError('There is no signed ' + spec.label + ' saved for ' + c.name + ' yet. Get the forms from the packet first.');
      if (!String(c.ein || '').trim()) throw new FaxError('Missouri cannot register the employer until the IRS issues the EIN. Fill in the Federal EIN first.');
      // No double sends: one at a time per consumer and form, unless the last one failed or was cancelled.
      const busy = await q(`select id from public.cds_fax where direction = 'out' and consumer_id = $1 and form_key = $2
                            and status in ('queued', 'sending', 'sent') and requested_at > now() - interval '1 day'`, [c.id, body.formKey]);
      if (busy.length && !body.again) throw new FaxError('This form is already on its way. Wait for the eFax receipt before sending it again.', 409);
      const r = await q(`insert into public.cds_fax (direction, status, consumer_id, consumer_name, form_key, fax_to, doc_path, doc_name, token, requested_by, requested_at)
                         values ('out', 'queued', $1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [c.id, c.name, body.formKey, spec.to, form.path, form.name || (spec.label + '.pdf'), 'CDS-FAX-' + token(), who(email), nowIso()]);
      return { ok: true, fax: describe(r[0], now()) };
    }
    if (a === 'cancel') {
      const r = await q(`update public.cds_fax set status = 'cancelled', dismissed_by = $2, dismissed_at = $3 where id = $1 and direction = 'out' and status = 'queued' returning *`, [body.id, who(email), nowIso()]);
      if (!r.length) throw new FaxError('It is already being sent, so it cannot be stopped from here.', 409);
      return { ok: true };
    }
    if (a === 'dismiss') {
      const r = await q(`update public.cds_fax set dismissed_by = $2, dismissed_at = $3 where id = $1 and direction = 'out' returning id`, [body.id, who(email), nowIso()]);
      if (!r.length) throw new FaxError('That fax was not found.', 404);
      return { ok: true };
    }
    if (a === 'applied') {
      await q(`update public.cds_fax set applied_at = coalesce(applied_at, $2) where id = $1 and direction = 'out' and status = 'delivered'`, [body.id, nowIso()]);
      return { ok: true };
    }
    if (a === 'handled') {
      const note = String(body.note || '').trim().slice(0, 300);
      const r = await q(`update public.cds_fax set status = 'handled', handled_by = $2, handled_at = $3, handled_note = $4 where id = $1 and direction = 'in' returning id`,
        [body.id, who(email), nowIso(), note]);
      if (!r.length) throw new FaxError('That fax was not found.', 404);
      return { ok: true };
    }
    throw new FaxError('Unknown request.');
  }

  // ---------- from the Google script in intake@caringcds.com ----------
  async function google(body) {
    const k = body && body.kind;
    if (k === 'ping') return { ok: true, live: await live() };
    if (k === 'next') {
      if (!(await live())) return { ok: true, off: true, faxes: [] };
      const rows = await q(`update public.cds_fax set status = 'sending' where id in (
                              select id from public.cds_fax where direction = 'out' and status = 'queued' order by requested_at limit 5)
                            returning *`);
      const faxes = [];
      for (const r of rows) {
        const spec = FAX_FORMS[r.form_key];
        let pdf;
        try { pdf = await store.download(r.doc_path); } catch (e) { pdf = null; }
        if (!spec || !pdf) {
          await q(`update public.cds_fax set status = 'failed', result_at = $2, result_text = $3 where id = $1`, [r.id, nowIso(), 'The signed form could not be read from the hub, so it was not sent.']);
          continue;
        }
        faxes.push({ id: r.id, token: r.token, to: spec.to + '@efaxsend.com', filename: r.doc_name, pdf: bytesToBase64(pdf),
          subject: spec.label + ' for ' + r.consumer_name + ' · ' + r.token,
          body: 'Caring Companions Consumer Directed Services, LLC\n1331 N Stewart Ave Ste A, Springfield MO 65802\nPhone: 866-863-5151   Fax: 417-719-7870\n\n' +
                'Please find attached ' + spec.label + ' for ' + r.consumer_name + ', sent to ' + spec.office + '.\n\nReference ' + r.token + '\n' });
      }
      return { ok: true, faxes };
    }
    if (k === 'sent') {
      if (body.error) {
        await q(`update public.cds_fax set status = 'failed', result_at = $2, result_text = $3 where id = $1 and status = 'sending'`,
          [body.id, nowIso(), 'Gmail could not send it from intake@caringcds.com: ' + String(body.error).slice(0, 300)]);
        return { ok: true };
      }
      await q(`update public.cds_fax set status = 'sent', sent_at = $2 where id = $1 and status = 'sending'`, [body.id, nowIso()]);
      return { ok: true };
    }
    if (k === 'result') {
      // Matched by the reference in our subject when eFax repeats it, otherwise the newest sent fax to that number.
      let r = body.token ? (await q(`select * from public.cds_fax where lower(token) = lower($1)`, [String(body.token)]))[0] || null : null;
      if (!r && body.to) {
        const d = digits(body.to);
        r = (await q(`select * from public.cds_fax where direction = 'out' and status = 'sent' and right(fax_to, 10) = $1 order by sent_at desc limit 1`, [d]))[0] || null;
      }
      if (!r) return { ok: true, matched: false };
      if (r.status === 'delivered' || r.status === 'failed') {
        if (body.gmailId && r.gmail_id === body.gmailId) return { ok: true, matched: true, already: true };
      }
      let receipt = r.receipt_path;
      if (body.pdf) {
        const bytes = base64ToBytes(body.pdf);
        if (bytes.length && bytes.length <= MAX_PDF) {
          receipt = r.consumer_id + '/filings/fax-' + r.form_key + '-' + r.id.slice(0, 8) + '-receipt.pdf';
          await store.upload(receipt, bytes, 'application/pdf');
        }
      }
      const status = body.ok === true ? 'delivered' : body.ok === false ? 'failed' : 'unclear';
      await q(`update public.cds_fax set status = $2, result_at = $3, result_text = $4, receipt_path = $5, gmail_id = coalesce($6, gmail_id) where id = $1`,
        [r.id, status, nowIso(), String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 500), receipt || null, body.gmailId || null]);
      return { ok: true, matched: true, status };
    }
    if (k === 'incoming') {
      if (!(await live())) return { ok: true, off: true };
      if (body.gmailId && (await q(`select id from public.cds_fax where gmail_id = $1`, [body.gmailId])).length) return { ok: true, already: true };
      const bytes = body.pdf ? base64ToBytes(body.pdf) : new Uint8Array(0);
      if (bytes.length > MAX_PDF) throw new FaxError('That fax is too large to keep in the hub.');
      const id = (await q(`insert into public.cds_fax (direction, status, from_number, subject, gmail_id, requested_at) values ('in', 'new', $1, $2, $3, $4) returning id`,
        [digits(body.from) || null, String(body.subject || '').slice(0, 200), body.gmailId || null, body.receivedAt || nowIso()]))[0].id;
      if (bytes.length) {
        const path = 'fax/incoming/' + id + '.pdf';
        await store.upload(path, bytes, 'application/pdf');
        await q(`update public.cds_fax set file_path = $2 where id = $1`, [id, path]);
      }
      return { ok: true, id };
    }
    throw new FaxError('not allowed', 401);
  }

  return { hub, google, live };
}

export function bytesToBase64(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const s = atob(String(b64 || ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
