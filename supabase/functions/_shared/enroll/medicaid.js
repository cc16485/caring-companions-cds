// CDS Hub · Starting profile · Medicaid application instructions (2026-11-04, her approved mockup
// version 5 and safeguards 2, 4 and 6).
//
// A coordinator writes (or keeps) the drafted text or email in the hub and presses Send. This sends it
// through the same GoHighLevel sender as the enrollment packet and the Missouri forms (deps.send),
// records it in cds_outbox like every other family message, and keeps the GoHighLevel message id so
// the real delivery status can be read back. Nothing here sends by itself.
//   medicaidSend   one message, staff pressed Send. Stops identifiers (safeguard 6). Warns when the same
//                  person was sent instructions in the last 7 days, unless force (safeguard 4).
//   medicaidSends  that person's messages, with delivery read back from GoHighLevel when it can be.
// Switch medicaid_messages (Switches card) starts off: while off, messages are held (shown, not sent),
// except to the test recipients. A send that fails becomes a red Needs attention item on Today.
// No em dashes in anything a person reads.
import '../office/starting-rules.js';

const S = globalThis.CDSStarting;
const DUP_DAYS = 7;
const BAD_DELIVERY = ['failed', 'undelivered', 'bounced', 'rejected'];

export function createMedicaidMessages(h) {
  const { q, one, audit, setting, task, R, fail, deps, isTestRecipient } = h;
  const who = s => { if (!s) fail('Please sign in to the CDS Hub.', 401); return s; };
  const ref = p => {
    const kind = p && (p.kind === 'lead' ? 'lead' : p.kind === 'consumer' ? 'consumer' : '');
    const id = String((p && p.id) || '').slice(0, 80);
    if (!kind || !id) fail('Pick the lead or consumer first.');
    return 'medicaid:' + kind + ':' + id;
  };
  const pub = r => ({ id: r.id, channel: r.channel, to: r.to_display, status: r.status, delivery: r.delivery || null,
    delivery_at: r.delivery_at || null, error: r.error || null, at: r.created_at, by: String(r.created_by || '').split(':').pop() });

  async function failedTask(row, name, why) {
    await task('medicaid_failed', 'Medicaid application instructions to ' + (name || 'a family') + ' did not go through. ' + why,
      {}, 'medicaid_failed:' + row.id, null);
  }

  const office = {
    async medicaidSend({ staff, person, channel, to, subject, body, force, ids }) {
      who(staff);
      if (!['sms', 'email'].includes(channel)) fail('Pick Text or Email.');
      const dest = String(to || '').trim();
      if (channel === 'sms' && String(dest).replace(/\D/g, '').length < 10) fail('Add a cell phone number first.');
      if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) fail('Add an email address first.');
      const text = String(body || '').trim();
      if (text.length < 20) fail('The message is empty.');
      if (text.length > (channel === 'sms' ? 1200 : 12000)) fail('The message is too long.');
      const bad = S.identifierProblems((subject ? subject + '\n' : '') + text, ids || {});
      if (bad.length) fail('Take out ' + bad.join(' and ') + '. Texts and emails never carry Medicaid numbers or eligibility details.');
      const key = ref(person);
      if (!force) {
        const recent = await q(`select created_at, channel, status from cds_outbox where template='medicaid_apply' and created_by like $1
          and status in ('sent','practice') and created_at > now() - interval '${DUP_DAYS} days' order by created_at desc`, [key + ':%']);
        if (recent.length) return { duplicate: recent.map(r => ({ at: r.created_at, channel: r.channel, status: r.status })) };
      }
      const sw = await setting('medicaid_messages', { live: false });
      let status, error = null, ghlId = null;
      if (deps.mode === 'practice') status = 'practice';
      else if (!sw.live && !(isTestRecipient && await isTestRecipient(channel, dest))) { status = 'held'; error = 'Medicaid application messages are switched off (Switches card).'; }
      else {
        try { const r = await deps.send({ channel, to: dest, subject: channel === 'email' ? String(subject || 'How to apply for Missouri Medicaid') : null, body: text }); status = 'sent'; ghlId = (r && r.id) || null; }
        catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); }
      }
      const row = await one(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by, ghl_id)
        values ('family',$1,'medicaid_apply',$2,$3,$4,$5,false,$6,$7) returning *`,
        [channel, channel === 'sms' ? R.maskPhone(dest) : R.maskEmail(dest), (subject && channel === 'email' ? subject + '\n\n' : '') + text, status, error, key + ':' + staff, ghlId]);
      if (status === 'failed') await failedTask(row, person.name, error || '');
      await audit('staff:' + staff, 'medicaid_instructions_' + status, key, { channel, forced: !!force });
      return { message: pub(row) };
    },

    // The after-call text or email from Finish call (2026-11-04): same sender, switch, identifier check and
    // records as the instructions; no duplicate warning (each call is its own message).
    async callFollowupSend({ staff, person, channel, to, subject, body, ids }) {
      who(staff);
      if (!['sms', 'email'].includes(channel)) fail('Pick Text or Email.');
      const dest = String(to || '').trim();
      if (channel === 'sms' && dest.replace(/\D/g, '').length < 10) fail('Add a cell phone number first.');
      if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) fail('Add an email address first.');
      const text = String(body || '').trim();
      if (text.length < 10) fail('The message is empty.');
      if (text.length > (channel === 'sms' ? 1200 : 12000)) fail('The message is too long.');
      const bad = S.identifierProblems((subject ? subject + '\n' : '') + text, ids || {});
      if (bad.length) fail('Take out ' + bad.join(' and ') + '. Texts and emails never carry Medicaid numbers or eligibility details.');
      const key = ref(person).replace(/^medicaid:/, 'call:');
      const sw = await setting('medicaid_messages', { live: false });
      let status, error = null, ghlId = null;
      if (deps.mode === 'practice') status = 'practice';
      else if (!sw.live && !(isTestRecipient && await isTestRecipient(channel, dest))) { status = 'held'; error = 'Starting texts to families are switched off (Switches card).'; }
      else {
        try { const r = await deps.send({ channel, to: dest, subject: channel === 'email' ? String(subject || 'Thank you for calling Caring Companions') : null, body: text }); status = 'sent'; ghlId = (r && r.id) || null; }
        catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); }
      }
      const row = await one(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by, ghl_id)
        values ('family',$1,'call_followup',$2,$3,$4,$5,false,$6,$7) returning *`,
        [channel, channel === 'sms' ? R.maskPhone(dest) : R.maskEmail(dest), (subject && channel === 'email' ? subject + '\n\n' : '') + text, status, error, key + ':' + staff, ghlId]);
      if (status === 'failed') await task('medicaid_failed', 'The after-call message to ' + (person.name || 'a family') + ' did not go through. ' + (error || ''), {}, 'medicaid_failed:' + row.id, null);
      await audit('staff:' + staff, 'call_followup_' + status, key, { channel });
      return { message: pub(row) };
    },

    async medicaidSends({ staff, person }) {
      who(staff);
      const key = ref(person);
      const rows = await q(`select * from cds_outbox where template='medicaid_apply' and created_by like $1 order by created_at desc limit 50`, [key + ':%']);
      // Delivery read back from GoHighLevel for sent messages not settled yet (best effort; never fails the list).
      for (const r of rows) {
        if (r.status !== 'sent' || !r.ghl_id || ['delivered', 'read', 'opened', ...BAD_DELIVERY].includes(r.delivery) || !deps.messageStatus) continue;
        try {
          const d = String(await deps.messageStatus(r.ghl_id) || '').toLowerCase();
          if (d && d !== r.delivery) {
            await q('update cds_outbox set delivery=$2, delivery_at=now() where id=$1', [r.id, d]);
            r.delivery = d; r.delivery_at = new Date().toISOString();
            if (BAD_DELIVERY.includes(d)) await failedTask(r, person.name, 'GoHighLevel says ' + d + '.');
          }
        } catch { /* left as it was; shown as Sent */ }
      }
      return { messages: rows.map(pub) };
    }
  };
  return { office, BAD_DELIVERY };
}
