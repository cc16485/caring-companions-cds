// CDS email sign-up: the 4 welcome emails (2026-11-11, Samantha: "Approved, build it").
// Wording is hers, word for word, from "CDS email sign-up for your OK.md". No em dashes, never "AI",
// never a promise about Medicaid timing.
//
// Who gets them: people who typed a first name + email in the caringcds.com box. They are NOT leads.
// Email 1 goes at the next run after they sign up (every 10 minutes, 7am to 9pm Central). Emails 2, 3, 4
// go on weekdays from 9:30am Central once 3, 7 and 12 days have passed, at least 2 days apart.
// After email 4 nothing more is sent.
// Stops for good the moment they: unsubscribe (link in every email), send any form on caringcds.com
// (site_leads or the caregiver list with the same email), reply to us in GoHighLevel, are marked
// do-not-email in GoHighLevel, or sign up twice (the newer copy stops; the older one carries on).
// Reply check fails closed: if GoHighLevel can't be read, that person gets nothing that run.
// In GoHighLevel: their contact (found by email, or made with first name + email only, no tags, so no
// CDS workflow starts) gets one note. Nothing touches GoHighLevel until setting email_welcome.live.
import { checkBody } from './lead-ghl.js';

export const SITE = 'https://caringcds.com';
const LOGO = SITE + '/assets/logo.png';
const BANNER = SITE + '/assets/photos/receive-care-hero.jpg';
const PRINT = SITE + '/getting-paid/printables/';
export const WORKSHEETS = [
  ['Is CDS a Fit for Our Family?', 'getting-paid-1-is-cds-a-fit-for-our-family.pdf'],
  ["Our Family's CDS Plan", 'getting-paid-2-our-family-s-cds-plan.pdf'],
  ['Getting Started with CDS: the Steps', 'getting-paid-3-getting-started-with-cds-the-steps.pdf'],
  ['Clocking In: the Habits and the Fixes', 'getting-paid-4-clocking-in-the-habits-and-the-fixes.pdf'],
  ['Our Backup Plan', 'getting-paid-5-our-backup-plan.pdf'],
  ['Our Yearly Check-In', 'getting-paid-6-our-yearly-check-in.pdf'],
];
export const DAYS = [null, 0, 3, 7, 12];   // step n is due once this many calendar days have passed
const TZ = 'America/Chicago';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const a = (href, text) => `<a href="${href}" style="color:#0e3860;font-weight:bold;">${text}</a>`;
const PHONE = `<a href="tel:+14172182888" style="color:#0e3860;font-weight:bold;text-decoration:none;">417-218-2888</a>`;

export const EMAILS = [
  { step: 1, subj: 'Your CDS worksheets are here', pre: 'All 6 Getting Paid worksheets, ready to print.', head: 'Your CDS worksheets are here',
    blocks: [
      { t: 'p', text: 'Hi {first},' },
      { t: 'p', text: 'Here are all 6 worksheets from Getting Paid to Care for Dad. Print the ones you need and skip the rest. Most families start with "Is CDS a Fit for Our Family?"' },
      { t: 'l', items: WORKSHEETS.map(([name, file]) => a(PRINT + file, esc(name))) },
      { t: 'p', text: `If a question comes up while you're working through them, call us at ${PHONE}, Monday to Friday, 9am to 4pm. A real person in Springfield answers.` },
    ] },
  { step: 2, subj: 'Who can be the paid caregiver?', pre: 'The person who needs help is the boss.', head: 'Who can be the paid caregiver?',
    blocks: [
      { t: 'p', text: 'Hi {first},' },
      { t: 'p', text: 'With Consumer Directed Services, the person who needs help is the boss. They choose who helps them at home, and that can be a son, daughter, grandchild, other relative or friend.' },
      { t: 'l', items: [
        "Spouses and legal guardians can't be the paid caregiver.",
        "Caregivers must be 18 or older and pass the state's background screening.",
        'Caregivers earn $15 to $16 an hour, paid every Thursday by direct deposit or pay card. Taxes are taken out and you get a W-2.',
      ] },
      { t: 'p', text: `If they don't have anyone to ask, our ${a(SITE + '/caregiver-list/', 'private caregiver list')} can help them meet someone in their area. They still choose who to hire.` },
    ] },
  { step: 3, subj: 'The steps, start to finish', pre: 'How CDS gets started.', head: 'The steps, start to finish',
    blocks: [
      { t: 'p', text: 'Hi {first},' },
      { t: 'p', text: "Here's how CDS gets started:" },
      { t: 'o', items: [
        `Call us or use the ${a(SITE + '/check/', 'eligibility check')} on our website.`,
        'The person who needs help must have Missouri Medicaid (MO HealthNet). The state decides whether they qualify for help at home and how many hours.',
        'They choose their caregiver.',
        'We do the paperwork with you: hiring forms, background screening, payroll and taxes.',
        'Care starts, and the caregiver clocks in and out on their phone.',
      ] },
      { t: 'p', text: "Every family's timing is different because the state sets the pace for approval. We'll tell you where things stand at each step." },
      { t: 'p', text: `The ${a(PRINT + WORKSHEETS[2][1], '"Getting Started with CDS: the Steps" worksheet')} walks through it in more detail.` },
    ] },
  { step: 4, subj: "Whenever you're ready", pre: 'Some families call the same week. Others take months.', head: "Whenever you're ready",
    blocks: [
      { t: 'p', text: 'Hi {first},' },
      { t: 'p', text: 'Some families call us the same week. Others take months. Both are fine.' },
      { t: 'p', text: `When you're ready, the easiest next step is our eligibility check. It asks the five questions that matter and takes about two minutes. Or call ${PHONE}, Monday to Friday, 9am to 4pm.` },
    ],
    cta: { label: 'Check if CDS fits', href: SITE + '/check/' },
    after: [{ t: 'p', text: "This is the last of our welcome emails. We won't email again unless you write to us." }] },
];

function blocksHtml(blocks, first) {
  const fill = s => s.replace(/\{first\}/g, esc(first || 'there'));
  const P = 'margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#33414f;';
  return (blocks || []).map(b => b.t === 'p' ? `<p style="${P}">${fill(b.text)}</p>`
    : `<${b.t === 'o' ? 'ol' : 'ul'} style="${P}padding-left:22px;">` + b.items.map(it => `<li style="margin:0 0 8px;">${it}</li>`).join('') + `</${b.t === 'o' ? 'ol' : 'ul'}>`).join('');
}
const plain = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

// One email as { subject, html, text }. unsubUrl is this person's own link.
export function render(step, first, unsubUrl) {
  const e = EMAILS[step - 1];
  if (!e) throw new Error('No welcome email ' + step);
  const cta = e.cta ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td align="center"><a href="${e.cta.href}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;background:#0e3860;text-decoration:none;padding:15px 34px;border-radius:999px;">${esc(e.cta.label)}</a></td></tr></table>` : '';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(e.subj)}</title></head><body style="margin:0;padding:0;background:#ece6dc;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(e.pre)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ece6dc;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;"><tr><td style="height:6px;background:#0f7a7c;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td align="center" style="background:#f7f3ec;padding:24px 20px 20px;"><img src="${LOGO}" width="220" alt="Caring Companions Consumer Directed Services" style="display:inline-block;width:220px;max-width:70%;height:auto;"></td></tr>${step === 1 ? `<tr><td style="padding:0;"><img src="${BANNER}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>` : ''}<tr><td style="padding:32px 40px 34px;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#0f7a7c;margin-bottom:10px;">Missouri CDS</div><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.22;font-weight:600;color:#14304d;">${esc(e.head)}</h1>${blocksHtml(e.blocks, first)}${cta}${blocksHtml(e.after, first)}<div style="margin-top:26px;padding-top:20px;border-top:1px solid #ece6dc;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#14304d;"><b>The Caring Companions CDS team</b></div></td></tr><tr><td align="center" style="background:#0e3860;padding:24px 36px 26px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#ffffff;margin-bottom:6px;">Caring Companions Consumer Directed Services</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#bccbdb;"><a href="tel:+14172182888" style="color:#f0a63a;text-decoration:none;font-weight:bold;">417-218-2888</a> &middot; Springfield, Missouri &middot; Monday to Friday, 9am to 4pm</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;line-height:1.6;color:#8fa3b8;margin-top:12px;">You're getting this because you asked for the Getting Paid worksheets on caringcds.com.<br><a href="${esc(unsubUrl)}" style="color:#bccbdb;">Unsubscribe</a> &middot; <a href="${SITE}" style="color:#bccbdb;">caringcds.com</a></div></td></tr></table></td></tr></table></body></html>`;
  const lines = [...e.blocks, ...(e.cta ? [{ t: 'p', text: e.cta.label + ': ' + e.cta.href }] : []), ...(e.after || [])]
    .flatMap(b => b.t === 'p' ? [plain(b.text.replace(/\{first\}/g, first || 'there'))] : b.items.map((it, i) => (b.t === 'o' ? (i + 1) + '. ' : '- ') + plain(it)));
  const text = lines.join('\n\n') + '\n\nThe Caring Companions CDS team\n417-218-2888\n\nUnsubscribe: ' + unsubUrl;
  return { subject: e.subj, html, text };
}

const ymd = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export function daysSince(signedUpAt, nowMs) {
  return Math.round((Date.parse(ymd(nowMs) + 'T00:00:00Z') - Date.parse(ymd(Date.parse(signedUpAt)) + 'T00:00:00Z')) / 86400000);
}
export function chicago(nowMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(nowMs)).map(x => [x.type, x.value]));
  return { weekday: !['Sat', 'Sun'].includes(p.weekday), minutes: Number(p.hour) * 60 + Number(p.minute) };
}
// The step this person is owed right now, or null. One step per run, never skipping ahead.
export function nextStep(s, nowMs) {
  if (s.stopped_at) return null;
  const n = (s.step_sent || 0) + 1;
  if (n > 4) return null;
  const c = chicago(nowMs);
  if (n === 1) return c.minutes >= 7 * 60 && c.minutes < 21 * 60 ? 1 : null;
  if (!c.weekday || c.minutes < 9 * 60 + 30 || c.minutes >= 17 * 60) return null;
  if (s.last_sent_at && nowMs - Date.parse(s.last_sent_at) < 2 * 86400000 - 3600000) return null;
  return daysSince(s.signed_up_at, nowMs) >= DAYS[n] ? n : null;
}

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms,
//   ghl: { search(email) -> [contacts], create(body) -> id, note(id, {body}), inboundSince(contactId, iso) -> bool,
//          sendEmail(contactId, {subject, html}) } }
export function createEmailWelcome(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const unsubUrl = s => SITE + '/unsubscribe/?t=' + encodeURIComponent(s.unsub_token);
  const stop = (id, why) => q(`update cds_email_signups set stopped_at=$2, stop_reason=$3, fail=null where id=$1 and stopped_at is null`, [id, new Date(now()).toISOString(), why]);

  async function settings() {
    const r = await one(`select value from cds_match_settings where key='email_welcome'`);
    const v = (r && r.value) || {};
    return { live: v.live === true, testTo: Array.isArray(v.test_to) ? v.test_to.map(String) : [] };
  }

  async function run() {
    const { live } = await settings();
    const t = now();
    const people = await q(`select * from cds_email_signups where stopped_at is null and step_sent < 4 order by signed_up_at limit 200`);
    const sum = { ok: true, live, active: people.length, sent: 0, practice: 0, stopped: 0, waiting: 0, failed: 0 };
    for (const s of people) {
      const email = String(s.email || '').toLowerCase();
      // Stops that need nothing from GoHighLevel
      const older = await one(`select id from cds_email_signups where lower(email)=$1 and id<>$2 and signed_up_at < $3 limit 1`, [email, s.id, s.signed_up_at]);
      if (older) { await stop(s.id, 'signed up twice'); sum.stopped++; continue; }
      const form = await one(`select 1 x from site_leads where lower(btrim(email))=$1
                               union all select 1 from attendant_pool where lower(btrim(email))=$1 limit 1`, [email]);
      if (form) { await stop(s.id, 'sent a form'); sum.stopped++; continue; }
      const step = nextStep(s, t);
      if (!step) { sum.waiting++; continue; }
      if (!live) { sum.practice++; continue; }
      try {
        let id = s.ghl_contact_id;
        if (!id) {
          const hits = (await deps.ghl.search(email)).filter(c => String(c.email || '').trim().toLowerCase() === email);
          if (hits.some(c => c.dnd === true || (c.dndSettings && c.dndSettings.Email && c.dndSettings.Email.status === 'active'))) {
            await stop(s.id, 'do not email in GoHighLevel'); sum.stopped++; continue;
          }
          if (hits.length) id = String(hits[0].id);
          else {
            const body = checkBody({ firstName: String(s.first_name || 'Email sign-up').slice(0, 80), email });
            try { id = String(await deps.ghl.create(body)); }
            catch (e) { if (e && e.contactId) id = String(e.contactId); else throw e; }
          }
          await q(`update cds_email_signups set ghl_contact_id=$2, ghl_status=$3 where id=$1`, [s.id, id, hits.length ? 'found' : 'created']);
        } else if (await deps.ghl.inboundSince(id, s.signed_up_at)) {
          await stop(s.id, 'replied'); sum.stopped++; continue;
        }
        if (!s.noted_at) {
          await deps.ghl.note(id, { body: 'Email sign-up on caringcds.com' + (s.page ? ' (' + s.page + ')' : '') + ': asked for the Getting Paid worksheets. Not a lead. Gets 4 welcome emails, then stops.' });
          await q(`update cds_email_signups set noted_at=$2 where id=$1`, [s.id, new Date(now()).toISOString()]);
        }
        // claim the step first, so two runs never send the same email
        const mine = await one(`update cds_email_signups set step_sent=$2, last_sent_at=$3 where id=$1 and step_sent=$4 and stopped_at is null returning id`,
          [s.id, step, new Date(now()).toISOString(), step - 1]);
        if (!mine) continue;
        const m = render(step, s.first_name, unsubUrl(s));
        try { await deps.ghl.sendEmail(id, { subject: m.subject, html: m.html }); }
        catch (e) { await q(`update cds_email_signups set step_sent=$2, last_sent_at=$3 where id=$1`, [s.id, step - 1, s.last_sent_at]); throw e; }
        await q(`update cds_email_signups set fail=null, sends = sends || $2::jsonb where id=$1`, [s.id, JSON.stringify([{ step, at: new Date(now()).toISOString() }])]);
        sum.sent++;
      } catch (e) {
        await q(`update cds_email_signups set fail=$2 where id=$1`, [s.id, String((e && e.message) || e).slice(0, 200)]);
        sum.failed++;
      }
    }
    return sum;
  }

  // All 4 to the test addresses in setting email_welcome.test_to, subject marked [Test]. Works with the switch off.
  async function preview() {
    const { testTo } = await settings();
    if (!testTo.length) return { ok: false, error: 'No test address in setting email_welcome.test_to' };
    const sent = [];
    for (const to of testTo) for (const e of EMAILS) {
      const m = render(e.step, 'Samantha', SITE + '/unsubscribe/?t=test');
      await deps.ghl.sendTest(to, { subject: '[Test] ' + m.subject, html: m.html });
      sent.push(e.step);
    }
    return { ok: true, sent: sent.length, to: testTo.length };
  }
  return { run, preview };
}
