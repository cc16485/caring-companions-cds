/* =============================================================================
   MY WEEK, Samantha's own calendar (2026-11-17).
   v1 (her "Yes, build it"): a weekly schedule of our time together. Mon money, Tue CDS payroll, Wed marketing,
   Thu growth, Fri big picture, plus what runs on its own.
   v2 (her words: "Put things on my week - it needs to be as high tech and interactive as possible of a weekly
   calendar that i can check off and move it to next day - also monthly or yearly as well"):
   a real calendar. Week, Month and Year views; check things off; move them to the next day or drag them to any day;
   add her own things (once, every week, month, quarter or year). Everything she does is saved on the server
   (cds-my-calendar in the CDS project), so it is the same on every device AND in both hubs.
   v3 (2026-11-17, "update my week in both hubs"): the operating week. Same five sessions; each starts with 15 minutes
   on what waits on her for that area. Monday team huddle; Tuesday is the whole CDS day (she owns CDS until 60
   consumers); Wednesday is ads, referral sources and approvals for all three brands; Thursday is leads and hiring (grants removed, her word); Friday is Switch hour and the write-up review.
   The SAME file is in both hubs (Caring Companions hub and CDS hub): change it in both.
   Shown only to Samantha. Times are Central. No em dashes in anything she reads (her rule).
   ============================================================================= */
(function () {
  const ME_EMAILS = ['samantha@mo-care.com', 'samantha@caringcds.com'];
  const FN_URL = 'https://siivpekcaryeyttszwav.supabase.co/functions/v1/cds-my-calendar';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Colours by kind of work. */
  const CATS = {
    money:     { label: 'Money',      c: '#1D9E75', bg: '#E1F5EE', ink: '#085041' },
    cds:       { label: 'CDS',        c: '#3B6FD8', bg: '#E8EEFC', ink: '#1B3E87' },
    marketing: { label: 'Marketing',  c: '#B0479E', bg: '#F8E9F5', ink: '#6E1F60' },
    growth:    { label: 'Growth',     c: '#5E9E1D', bg: '#EEF6E3', ink: '#355C0D' },
    big:       { label: 'Big picture', c: '#0D365F', bg: '#E6EDF5', ink: '#0D365F' },
    deadline:  { label: 'Due dates',  c: '#D9822B', bg: '#FDF0E1', ink: '#8A4A0C' },
    mine:      { label: 'Added by you', c: '#7A5AF8', bg: '#F0ECFE', ink: '#43309C' },
  };

  /* Every week. dow = day number (0 Sunday). These are our times together, plus the Saturday deadline. */
  const WEEKLY = [
    /* v3 (2026-11-17, her "update my week in both hubs" after the operating week plan): each session runs the same way,
       15 minutes on what waits on her for that area, 40 on the main work, 5 on what is next and who to tell. She owns CDS
       until 60 consumers (then Zach steps in); write-ups are sent by the Care Coordinators and she oversees them.
       Ids are kept, so her check-offs and moves stay with the same items. */
    { id: 'w-money', dow: 1, time: '9:00 AM', icon: '💵', cat: 'money', t: 'Money in: AxisCare billing and payroll prep', what: [
      'First 15 minutes: the money items on your Waiting on you page.',
      'Open the AxisCare prep email (it comes from 5 AM). Send the private pay invoices first, so the money comes in fastest.',
      'Krystal fixes any $10 pay rates and missing clock times, then exports payroll to Viventium. Caregivers are paid Friday.',
      'Money tab: answer the books questions, and reconcile one month of 2026 checking each week until it is caught up.' ] },
    { id: 'w-huddle', dow: 1, time: '10:00 AM', icon: '🤝', cat: 'big', t: 'Team huddle, 15 minutes', what: [
      'With Krystal and Angiel (Katlin by video if her hours allow). The same three questions every week:',
      'What is at risk this week: shifts, clients, payroll?',
      'Who needs help?',
      'One win from last week.' ] },
    { id: 'w-cdspay', dow: 2, time: '9:30 AM', icon: '🩺', cat: 'cds', t: 'CDS day: payroll, Medicaid and growth', what: [
      'Review CDS payroll in Empeon before it locks Wednesday at 3 PM. Attendants are paid Thursday.',
      'Fix visits missing from Sandata and shifts never clocked out. On cutoff weeks, get the Medicaid claims ready for Thursday.',
      'Fusion care plans, consumer calls and any DHSS report that is due.',
      'The CDS growth number: new leads, waiting on DHSS, authorized with no attendant yet, first shifts. The goal is 60, when Zach steps in.',
      'Katlin: what she fixed and what is stuck.' ] },
    /* 2026-11-17 her ask: "be clear on what marketing tasks i can do, look at ad results? reach out to potential referral
       sources?" Posts, videos, Google posts, partner emails, review asks and lead emails already run on their own,
       so this session is only what needs her. */
    { id: 'w-mkt', dow: 3, time: '10:00 AM', icon: '📣', cat: 'marketing', t: 'Marketing: ads, referral sources, approvals', what: [
      'Ad results, 10 minutes: Google Ads and the Caring Companions and CDS Facebook ads. What we spent, the calls and forms it brought, and one change.',
      'Referral sources, 20 minutes: add 2 new places to the partner list (they then get the partner emails by themselves), and call or email 1 or 2 of them yourself. Krystal does the in-person visits.',
      'Approve what is waiting for you: new videos, posts or emails.',
      'New Google reviews: read them and thank the family.',
      'Posts, videos, Google posts, partner emails, review asks and lead emails go out by themselves. Nothing to post by hand.' ] },
    { id: 'w-growth', dow: 4, time: '10:00 AM', icon: '🌱', cat: 'growth', t: 'Growth: leads and hiring', what: [
      'New leads and how fast we call them.',
      'Referrals and Friends and Family.',
      'Hiring: applicants, interviews and new caregivers.' ] },
    { id: 'w-big', dow: 5, time: '10:00 AM', icon: '🧭', cat: 'big', t: 'Switch hour and big picture', what: [
      'Write-ups and coaching: approve what waits for you, look over what Krystal and Angiel decided.',
      'Switch on or drop each thing that is built and waiting. Anything waiting 3 weeks gets decided today.',
      'One note to the team, ready to send to Krystal, Angiel and Katlin.',
      'Plan next week. First Friday of the month: Show-Me Neighbors and side projects, 30 minutes.' ] },
    /* Her yes 11-17: payroll reports every payday, for the CDS hub and for the books (we clean up QuickBooks ourselves). */
    { id: 'w-empeon-rpt', dow: 4, time: 'After payday', icon: '📥', cat: 'cds', t: 'Empeon payroll reports to the CDS hub', links: [
      ['Sign in to Empeon', 'https://app.empeon.com'], ['Upload in the CDS hub', 'https://hub.caringcds.com/#payroll'] ], what: [
      'Attendants are paid today. Sign in to Empeon, open Reports, then File Room, and download this week\'s Check Register and Payroll Summary.',
      'Upload both in the CDS hub: Money, then Payroll, Upload Empeon PDFs.',
      'Claude uses them to put CDS attendant pay in the books.' ] },
    { id: 'w-viv-rpt', dow: 5, time: 'After payday', icon: '📥', cat: 'money', t: 'Viventium payroll register for the books', links: [
      ['Sign in to Viventium', 'https://hcm.viventium.com/apps/viventium'] ], what: [
      'Caregivers are paid today. Sign in to Viventium and download this week\'s payroll register (Excel if it offers it, PDF is fine).',
      'Save it in iCloud Drive, in the folder "Payroll reports".',
      'Claude uses it to put caregiver pay in QuickBooks.' ] },
    { id: 'w-evv', dow: 6, time: 'by midnight', icon: '📝', cat: 'deadline', t: 'CDS EVV forms due', what: [
      'EVV forms must be in by Saturday at midnight to be fixed for this pay week.',
      'Katlin enters the fixes in WellSky on Monday.' ] },
  ];

  /* MUST-DO items (2026-11-17, her words: "make sure i can't move things that HAVE to be done - email and text me if
     they arent done or checked off...things that have a due date/time like billing/payroll"). These can be checked off
     but never moved (no arrow, no drag, no Move to today; the server refuses too). If one is not checked off by its time,
     the server texts and emails her (cds-my-reminders). The list and times are the server's my-week-musts.js; the test
     proves the two match. Dated items in the Due dates colour are must-do too. */
  const MUST = {
    'w-money': 'Due Monday by noon',
    'w-cdspay': 'Due Wednesday by noon, before the 3 PM payroll lock',
    'w-empeon-rpt': 'Due Friday by noon',
    'w-viv-rpt': 'Due Friday by 5 PM',
    'w-evv': 'Fixed deadline',
    'q-empeon': 'Due by the end of the quarter',
    'y-w2': 'Due Jan 31',
    'y-q4sui': 'Fixed deadline',
  };
  const mustOf = (r) => (r && !r.own ? (MUST[r.id] || (r.every === 'once' && r.cat === 'deadline' ? 'Fixed deadline' : '')) : '');

  /* Every month, quarter and year. day 31 means the last day of the month. */
  const RULES = [
    { id: 'm-payroll-bank', every: 'month', day: 10, icon: '🏦', cat: 'money', t: 'Payroll matched to the bank', what: [
      'Claude checks last month\'s Viventium and Empeon reports against what left the bank and emails you what is off or missing.',
      'Check it off once you have read that email.' ] },
    { id: 'm-close', every: 'month', day: 7, icon: '📊', cat: 'money', t: 'Monthly profit close in the Owners Hub', what: [
      'Close last month in the Owners Hub and look at the profit.' ] },
    { id: 'q-empeon', every: 'quarter', months: [3, 6, 9, 12], day: 15, icon: '🧾', cat: 'cds', t: 'Empeon CDS tax IDs', due: 'quarter-end', what: [
      'Load every consumer\'s Federal EIN, Missouri withholding ID and unemployment account number into Empeon.',
      'Update the unemployment (SUI) rates in Empeon.',
      'For consumers who left: end their Empeon job code and close their state account in UInteract.',
      'Register new consumers in UInteract.',
      'Empeon only files unemployment for consumers whose IDs are in by the last day of the quarter.',
      'A reminder email comes on the 15th and the 26th.' ] },
    { id: 'y-vendor', every: 'year', month: 1, day: 10, icon: '✉️', cat: 'cds', t: 'State CDS vendor acknowledgement letter', what: [
      'The state sends the yearly CDS vendor acknowledgement letter in January. Sign it and send it back.' ] },
    { id: 'y-w2', every: 'year', month: 1, day: 15, icon: '🗂️', cat: 'money', t: 'W-2s go out', due: 'Jan 31', what: [
      'Make sure W-2s go out by January 31: Viventium for caregivers, Empeon for CDS attendants.' ] },
    { id: 'y-q4sui', every: 'year', month: 1, day: 31, icon: '🏛️', cat: 'deadline', t: 'Q4 unemployment report due', what: [
      'The fourth quarter unemployment report is due January 31.',
      'Empeon files it for every consumer whose IDs were in by December 31.' ] },
  ];

  const hash = (x) => { let h = 7; for (const ch of x) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h.toString(36).slice(0, 6); };
  /* One-time dates. */
  const DATES = [
    ['2026-11-19', 'Catch up: upload every Empeon Check Register and Payroll Summary since Jul 30 (pick them all at once)', 'cds'],
    ['2026-11-20', 'Medicaid claim cutoff, 5 PM', 'deadline'],
    ['2026-11-20', 'Look at the practice clock-out texts and decide on the switch', 'cds'],
    ['2026-11-22', 'First Sunday EVV forms email', 'cds'],
    ['2026-11-23', 'First Monday AxisCare prep email', 'money'],
    ['2026-12-04', 'Medicaid payday: rebill the $0 lines from Nov 20', 'money'],
    ['2026-12-11', 'Medicaid claim cutoff, 5 PM', 'deadline'],
    ['2026-12-23', 'Enter claims early: the Dec 25 cutoff falls on Christmas', 'deadline'],
    ['2027-01-08', 'Medicaid claim cutoff, 5 PM', 'deadline'],
    ['2027-03-15', 'Clocks changed: EVV forms email moves to 5 PM Sunday', 'cds'],
    ['2026-11-19', 'AxisCare support replies: the $10 pay rate and the Monday to Sunday week', 'money'],
    ['2026-11-19', 'Google Ads: yes or no on the caregiver jobs campaign', 'marketing'],
    ['2026-11-20', 'First Thanksgiving emails to clients, families and caregivers', 'marketing'],
    ['2026-11-26', 'IHS ends in AxisCare: bill the rest in eMOMED', 'money'],
    ['2026-11-26', 'Google Ads two-week review', 'marketing'],
    ['2026-12-07', 'Holiday season check-in: what came in after Thanksgiving', 'marketing'],
    ['2026-12-10', 'First monthly lead email goes out', 'marketing'],
    ['2027-01-04', 'Holiday season check-in: what came in after Christmas', 'marketing'],
    ['2027-02-22', 'Plan the address switch for the March office move', 'big'],
  ].map(([date, t, cat]) => ({ id: 'd-' + date.replace(/-/g, '') + '-' + hash(t),   /* id from the words, so adding a date never moves her check marks */ every: 'once', date, t, cat, icon: cat === 'deadline' ? '⏰' : '📌', what: [] }));

  /* What runs on its own, by day (not checkable, just so she knows). */
  const AUTO = {
    0: [['4:00 PM', 'EVV forms email to you and Katlin'], ['', 'AxisCare work week ends']],
    1: [['5:00 AM', 'AxisCare billing and payroll prep email to you and Krystal'], ['6:15 AM', 'Money tab: books catch-up'], ['', 'Katlin enters the EVV form fixes in WellSky']],
    2: [['9:00 AM', 'CDS billing prep: payroll check, Sandata gaps, claims']],
    3: [['3:00 PM', 'CDS payroll locks']],
    4: [['', 'CDS attendants paid'], ['', 'Medicaid claims entered in eMOMED on cutoff weeks']],
    5: [['', 'Caregivers paid (AxisCare, Viventium)'], ['5:00 PM', 'Medicaid claim cutoff, every other week']],
    6: [['11:59 PM', 'EVV forms due for this CDS pay week'], ['', 'CDS pay week ends']],
  };
  const EVERY_DAY = ['Facebook, Instagram, TikTok, YouTube and Google posts publish by themselves (scheduled into 2027)', '6:30 AM WellSky check', 'Sandata check, once you are signed in', '8:30 AM Waiting on you (weekdays)', 'Clock-out texts to consumers, 9 AM to 6 PM'];
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const EVERY_LABEL = { once: 'Just once', week: 'Every week', month: 'Every month', quarter: 'Every quarter', year: 'Every year' };

  /* ---------- dates (plain YYYY-MM-DD strings, Central) ---------- */
  const D = (iso) => new Date(iso + 'T12:00:00Z');
  const iso = (d) => d.toISOString().slice(0, 10);
  const add = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dow = (s) => D(s).getUTCDay();
  const monday = (s) => add(s, -((dow(s) + 6) % 7));
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   /* m is 1-12 */
  const ymd = (s) => s.split('-').map(Number);
  const nice = (s, o) => D(s).toLocaleDateString('en-US', Object.assign({ weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }, o || {}));
  function today() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return p.year + '-' + p.month + '-' + p.day;
  }
  /* does a repeating thing fall on day s? */
  function hits(r, s) {
    const [y, m, d] = ymd(s);
    const dd = (want) => (want >= 28 && d === lastDay(y, m) && want >= d) || want === d;   /* 31 = last day of a short month */
    if (r.every === 'week') return dow(s) === r.dow;
    if (r.every === 'month') return dd(r.day);
    if (r.every === 'quarter') return r.months.includes(m) && dd(r.day);
    if (r.every === 'year') return m === r.month && dd(r.day);
    return r.date === s;
  }
  function dueLabel(r, s) {
    if (r.due === 'quarter-end') { const [y, m] = ymd(s); return 'Due ' + MON[m - 1].slice(0, 3) + ' ' + lastDay(y, m); }
    return r.due ? 'Due ' + r.due : '';
  }
  /* her own items, saved on the server, as rules */
  function mine() {
    const out = [];
    S.rows.forEach((row, id) => {
      if (row.kind !== 'item') return;
      const x = row.data || {}, day = String(x.date || '').slice(0, 10), [, m, d] = ymd(day);   /* a date sent as a full timestamp still lands on its day (2026-11-17) */
      const r = { id: id.slice(2), own: true, t: x.t, time: x.time || '', icon: '⭐', cat: x.cat || 'mine', what: x.note ? [x.note] : [], every: x.every || 'once', start: day, date: day };
      if (r.every === 'week') r.dow = dow(day);
      if (r.every === 'month') r.day = d;
      if (r.every === 'quarter') { r.day = d; r.months = [0, 1, 2, 3].map((k) => ((m - 1 + k * 3) % 12) + 1); }
      if (r.every === 'year') { r.month = m; r.day = d; }
      out.push(r);
    });
    return out;
  }
  const START = '2026-11-16';   /* the calendar began this week; nothing before it counts as missed */
  function allRules() { return WEEKLY.map((w) => Object.assign({ every: 'week', start: START }, w)).concat(RULES.map((r) => Object.assign({ start: START }, r)), DATES, mine()); }
  /* everything that shows between from and to (after her moves) */
  function occ(from, to) {
    const rules = allRules(), out = [];
    for (let s = add(from, -62); s <= add(to, 62); s = add(s, 1)) {
      rules.forEach((r) => {
        if (r.start && s < r.start) return;
        if (!hits(r, s)) return;
        const key = r.id + '@' + s, mk = (S.rows.get('m:' + key) || {}).data || {};
        const date = mk.to || s;
        if (date < from || date > to) return;
        out.push({ key, r, orig: s, date, done: !!mk.done, moved: !!mk.to });
      });
    }
    const tm = (o) => { const x = /^(\d+):(\d+) (AM|PM)/.exec(o.r.time || ''); return x ? ((+x[1] % 12) + (x[3] === 'PM' ? 12 : 0)) * 60 + +x[2] : 2000; };
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : tm(a) - tm(b)));
  }

  /* ---------- who and the server ---------- */
  function me() {
    try {
      const hu = document.getElementById('header_user');   /* the CDS hub shows the signed-in email there */
      const a = (typeof ccActor === 'function' && (ccActor() || {}).email) || (typeof ME !== 'undefined' && ME && ME.email) || window.MW_EMAIL || (hu && hu.textContent) || '';
      return String(a).trim().toLowerCase();
    } catch (_) { return String(window.MW_EMAIL || '').toLowerCase(); }
  }
  function allowed() { return ME_EMAILS.indexOf(me()) > -1; }
  const hub = () => (/caringcds/.test(location.hostname) || document.getElementById('page-myweek') ? 'cds' : 'cc');
  async function token() {
    let c = null;
    try { c = (typeof sb !== 'undefined' && sb) || null; } catch (_) {}
    try { c = c || ((typeof _db !== 'undefined' && _db) || null); } catch (_) {}
    if (!c || !c.auth) return '';
    const s = await c.auth.getSession();
    return (s && s.data && s.data.session && s.data.session.access_token) || '';
  }
  async function call(body) {
    if (window.MW_API) return window.MW_API(body);   /* tests */
    const tk = await token();
    if (!tk) throw new Error('Please sign in again.');
    const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk, 'x-hub': hub() }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || ('The calendar server answered ' + r.status + '.'));
    return j;
  }

  /* ---------- state ---------- */
  const store = { get(k) { try { return localStorage.getItem('mw_' + k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem('mw_' + k, v); } catch (_) {} } };
  const S = { target: 'mwWrap', view: store.get('view') || 'week', anchor: null, rows: new Map(), loaded: false, loading: false, err: '', note: '', auto: store.get('auto') !== '0', open: {}, form: null, pick: null, undo: null, rem: {} };
  if (!['week', 'month', 'year'].includes(S.view)) S.view = 'week';

  async function load() {
    if (S.loading) return; S.loading = true;
    try {
      const j = await call({ action: 'list' });
      S.rows = new Map((j.rows || []).map((x) => [x.id, { kind: x.kind, data: x.data }]));
      S.rem = {}; (j.reminders || []).forEach((x) => { S.rem[String(x.key).split('#')[0]] = x; });   /* the latest reminder per item and day */
      S.loaded = true; S.err = '';
    } catch (e) { S.err = 'Your check marks could not be loaded: ' + e.message; }
    S.loading = false;
    draw();
  }
  function setMark(key, data) { if (data && (data.done || data.to)) S.rows.set('m:' + key, { kind: 'mark', data }); else S.rows.delete('m:' + key); }
  async function mark(key, change, msg) {
    const before = Object.assign({}, (S.rows.get('m:' + key) || {}).data || {});
    const after = Object.assign({}, before, change);
    if (!after.done) delete after.done;
    if (after.to === null || after.to === key.split('@')[1]) delete after.to;
    setMark(key, after); S.note = 'Saving...'; S.err = ''; draw();
    try {
      await call(Object.assign({ action: 'mark', key }, change));
      S.note = 'Saved'; S.undo = msg ? { msg, key, before } : null;
    } catch (e) { setMark(key, before); S.note = ''; S.err = 'That did not save: ' + e.message + ' Please try again.'; S.undo = null; }
    draw();
    if (S.undo) { const u = S.undo; setTimeout(() => { if (S.undo === u) { S.undo = null; draw(); } }, 7000); }
  }
  async function undo() {
    const u = S.undo; if (!u) return; S.undo = null;
    await mark(u.key, { done: !!u.before.done, to: u.before.to || null });
  }

  /* ---------- look ---------- */
  function css() {
    if (document.getElementById('mwCss')) return;
    const s = document.createElement('style'); s.id = 'mwCss';
    s.textContent = [
      '.mw{font-family:inherit;color:#1f2a36;max-width:1280px;--n:#0D365F;--g:#1D9E75;--line:#e3e8ee;--mut:#57606a}',
      '.mw *{box-sizing:border-box}',
      '.mw-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:0 0 12px}',
      '.mw-head h2{margin:0;font-size:24px;color:var(--n);letter-spacing:-.01em}.mw-head .sub{margin:2px 0 0;color:var(--mut);font-size:13.5px}',
      '.mw-ring{--p:0;width:58px;height:58px;border-radius:50%;background:conic-gradient(var(--g) calc(var(--p)*1%),#e6ebf0 0);display:grid;place-items:center;flex:none;transition:background .4s}',
      '.mw-ring span{width:44px;height:44px;border-radius:50%;background:#fff;display:grid;place-items:center;font-weight:800;font-size:13px;color:var(--n)}',
      '.mw-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}',
      '.mw-seg{display:inline-flex;background:#eef2f6;border-radius:12px;padding:3px}.mw-seg button{border:0;background:transparent;padding:7px 14px;border-radius:9px;font:inherit;font-size:13.5px;font-weight:700;color:var(--mut);cursor:pointer}',
      '.mw-seg button.on{background:#fff;color:var(--n);box-shadow:0 1px 3px rgba(13,54,95,.15)}',
      '.mw-btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 12px;font:inherit;font-size:13.5px;font-weight:700;color:var(--n);cursor:pointer}.mw-btn:hover{border-color:#b9c6d3}',
      '.mw-btn.go{background:var(--n);color:#fff;border-color:var(--n)}.mw-btn.sm{padding:4px 9px;font-size:12px}',
      '.mw-range{font-weight:800;color:var(--n);font-size:15px;margin:0 6px}',
      '.mw-tog-auto{font-size:12.5px;color:var(--mut);display:inline-flex;gap:6px;align-items:center;cursor:pointer;margin-left:auto}',
      '.mw-msg{font-size:12.5px;color:var(--mut);min-height:18px;margin:-4px 0 8px}.mw-msg.mw-bad{color:#B42318;font-weight:700}',
      '.mw-key{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--mut);margin:0 0 12px}.mw-key i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}',
      '.mw-week{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) minmax(0,.8fr);gap:8px}',
      '.mw-wkend{display:flex;flex-direction:column;gap:8px;min-width:0}.mw-wkend .mw-day{min-height:0;flex:none}.mw-wkend .mw-day:last-child{flex:1 0 auto}',
      '@media (max-width:1100px){.mw-week{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}}',
      '.mw-day{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px;min-width:0;min-height:170px;transition:background .15s,border-color .15s}',
      '.mw-day.today{border:2px solid var(--g);background:#F4FBF8}.mw-day.past{background:#fafbfc}',
      '.mw-drop.over{background:#EAF3FF!important;border-color:#3B6FD8!important;border-style:dashed!important}',
      '.mw-dn{margin:0;font-weight:800;color:var(--n);font-size:14.5px}.mw-dd{display:flex;justify-content:space-between;margin:1px 0 9px;font-size:12px;color:var(--mut);font-weight:600}.mw-dd span{color:var(--g);font-weight:800}',
      '.mw-now{font-size:10.5px;font-weight:800;color:#fff;background:var(--g);border-radius:99px;padding:2px 7px;margin-left:4px}',
      '.mw-card{position:relative;display:flex;gap:8px;align-items:flex-start;border-radius:11px;padding:8px 8px 7px;margin:0 0 7px;background:var(--bg);border-left:4px solid var(--c);cursor:grab;transition:transform .12s,box-shadow .12s,opacity .2s}',
      '.mw-card:hover{box-shadow:0 2px 8px rgba(13,54,95,.12)}.mw-card.dragging{opacity:.45;transform:scale(.97)}',
      '.mw-card.done{opacity:.62}.mw-card.done .mw-t{text-decoration:line-through;text-decoration-thickness:2px}',
      '.mw-chk{flex:none;width:22px;height:22px;border-radius:7px;border:2px solid var(--c);background:#fff;cursor:pointer;display:grid;place-items:center;color:#fff;font-size:13px;font-weight:900;padding:0;margin-top:1px}',
      '.mw-card.done .mw-chk{background:var(--c);animation:mwpop .35s ease}',
      '@keyframes mwpop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}',
      '.mw-body{flex:1;min-width:0}.mw-tm{display:block;font-size:11.5px;font-weight:800;color:var(--ink);opacity:.85}',
      '.mw-t{display:block;font-size:13px;font-weight:800;color:var(--ink);line-height:1.3;overflow-wrap:anywhere}',
      '.mw-tag{display:inline-block;font-size:10.5px;font-weight:800;border-radius:99px;padding:1px 7px;margin:4px 4px 0 0;background:#fff;color:var(--ink)}',
      '.mw-link{display:inline-block;font-size:11.5px;font-weight:800;border-radius:8px;padding:3px 8px;margin:5px 5px 0 0;background:var(--c);color:#fff!important;text-decoration:none}.mw-link:hover{filter:brightness(1.1)}',
      '.mw-tag.due{background:#D9822B;color:#fff}.mw-tag.mv{background:#fff;color:#3B6FD8}',
      '.mw-what{margin:5px 0 0 15px;padding:0;font-size:12px;line-height:1.45;color:var(--ink)}',
      '.mw-more{white-space:nowrap;border:0;background:none;padding:0;font:inherit;font-size:11.5px;font-weight:700;color:var(--ink);opacity:.8;cursor:pointer;text-decoration:underline}',
      '.mw-foot{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;margin-top:5px}.mw-acts{display:flex;gap:4px;flex:none}',
      '.mw-ic{width:24px;height:24px;border-radius:7px;border:1px solid rgba(13,54,95,.14);background:rgba(255,255,255,.75);cursor:pointer;font-size:12px;padding:0;color:var(--n);display:grid;place-items:center}',
      '.mw-ic:hover{background:#fff;border-color:#3B6FD8}',
      '.mw-auto{list-style:none;margin:6px 0 0;padding:0;font-size:11.5px;color:var(--mut);line-height:1.4}.mw-auto li{padding:3px 0;border-top:1px dashed var(--line)}.mw-auto b{color:#3d4752}',
      '.mw-empty{font-size:12px;color:#9aa4ae;margin:4px 0}',
      '.mw-late{background:#FFF8EC;border:1px solid #F3D7A7;border-radius:14px;padding:10px 12px;margin:0 0 12px}',
      '.mw-tag.must{background:#FDECEC;color:#9B1C1C;font-weight:700}.mw-tag.rem{background:#E1F5EE;color:#085041}.mw-tag.remx{background:#B91C1C;color:#fff;font-weight:700}',
      '.mw-card.must{cursor:default}.mw-over{color:#9B1C1C;font-size:12.5px}',
      '.mw-late h4{margin:0 0 6px;font-size:13px;color:#8A4A0C}.mw-late .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;padding:4px 0;border-top:1px solid #F6E4C4}.mw-late .row:first-of-type{border-top:0}',
      '.mw-late .row span{flex:1;min-width:160px}',
      '.mw-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}',
      '.mw-mh{font-size:11.5px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;padding:0 4px}',
      '.mw-cell{background:#fff;border:1px solid var(--line);border-radius:10px;min-height:108px;padding:5px;min-width:0}',
      '.mw-cell.out{background:#f7f9fb;opacity:.6}.mw-cell.today{border:2px solid var(--g);background:#F4FBF8}',
      '.mw-cn{border:0;background:none;font:inherit;font-size:12.5px;font-weight:800;color:var(--n);cursor:pointer;padding:1px 4px;border-radius:6px}.mw-cn:hover{background:#eef2f6}',
      '.mw-chip{display:flex;gap:4px;align-items:center;font-size:11.5px;font-weight:700;border-radius:7px;padding:2px 4px;margin:2px 0;background:var(--bg);color:var(--ink);border-left:3px solid var(--c);cursor:grab;min-width:0}',
      '.mw-chip .mw-chk{width:15px;height:15px;border-radius:5px;font-size:9px;border-width:1.5px;margin:0}',
      '.mw-chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mw-chip.done{opacity:.55}.mw-chip.done span{text-decoration:line-through}',
      '.mw-chip.done .mw-chk{background:var(--c)}.mw-plus{font-size:11px;color:var(--mut);font-weight:700;padding:0 4px;border:0;background:none;cursor:pointer}',
      '@media (max-width:700px){.mw-month{gap:2px}.mw-cell{min-height:64px;padding:3px}.mw-chip span{display:none}.mw-chip{display:inline-flex;margin:1px}.mw-mh{font-size:10px;padding:0}}',
      '.mw-year{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}',
      '.mw-ym{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px}.mw-ym.now{border:2px solid var(--g)}',
      '.mw-ym h4{margin:0 0 6px;display:flex;justify-content:space-between;align-items:center}.mw-ym h4 button{border:0;background:none;font:inherit;font-size:15px;font-weight:800;color:var(--n);cursor:pointer;padding:0}',
      '.mw-ym .wk{font-size:11.5px;color:var(--mut);font-weight:700}.mw-ym .meter{height:6px;border-radius:9px;background:#eef2f6;overflow:hidden;margin:0 0 8px}.mw-ym .meter i{display:block;height:100%;background:var(--g)}',
      '.mw-ym ul{list-style:none;margin:0;padding:0;font-size:12.5px}.mw-ym li{display:flex;gap:6px;align-items:center;padding:3px 0;border-top:1px solid #f0f2f5}.mw-ym li:first-child{border-top:0}',
      '.mw-ym li .d{font-weight:800;color:var(--n);min-width:44px}.mw-ym li.done{opacity:.55}.mw-ym li.done .x{text-decoration:line-through}',
      '.mw-ym li .dot{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}',
      '.mw-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:12px}',
      '.mw-box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px}.mw-box h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}',
      '.mw-box ul{margin:0;padding:0;list-style:none;font-size:13px;line-height:1.5}.mw-box li{padding:4px 0;border-top:1px solid #f0f2f5}.mw-box li:first-child{border-top:0}',
      '.mw-form{background:#fff;border:2px solid #7A5AF8;border-radius:14px;padding:12px 14px;margin:0 0 12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end}',
      '.mw-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:800;color:var(--n)}',
      '.mw-form input,.mw-form select{font:inherit;font-size:14px;padding:7px 9px;border:1px solid #cfd8e2;border-radius:9px;background:#fff;color:#1f2a36;width:100%}',
      '.mw-form .wide{grid-column:1/-1}.mw-form .acts{display:flex;gap:8px;grid-column:1/-1}',
      '.mw-pick{position:absolute;z-index:30;right:4px;top:100%;margin-top:4px;background:#fff;border:1px solid #cfd8e2;border-radius:12px;box-shadow:0 8px 24px rgba(13,54,95,.18);padding:10px;width:220px;cursor:default}',
      '.mw-pick b{display:block;font-size:12px;color:var(--n);margin:0 0 6px}.mw-pick input{font:inherit;width:100%;padding:6px 8px;border:1px solid #cfd8e2;border-radius:8px;margin:0 0 8px}',
      '.mw-pick .q{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 8px}',
      '.mw-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#0D365F;color:#fff;border-radius:12px;padding:10px 14px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;display:flex;gap:12px;align-items:center;animation:mwup .25s ease}',
      '.mw-toast button{border:0;background:#fff;color:#0D365F;border-radius:8px;padding:5px 10px;font:inherit;font-weight:800;cursor:pointer}',
      '@keyframes mwup{from{transform:translate(-50%,20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}',
      '.mw-cheer{background:linear-gradient(90deg,#E1F5EE,#EAF3FF);border-radius:12px;padding:8px 12px;font-weight:800;color:#085041;margin:0 0 10px;font-size:14px}',
    ].join('');
    document.head.appendChild(s);
  }
  const vars = (cat) => { const c = CATS[cat] || CATS.mine; return '--c:' + c.c + ';--bg:' + c.bg + ';--ink:' + c.ink; };

  /* ---------- pieces ---------- */
  function card(o, now) {
    const r = o.r, open = !!S.open[o.key];
    const tags = [];
    const must = mustOf(r);
    const due = dueLabel(r, o.orig); if (due && !must) tags.push('<span class="mw-tag due">' + esc(due) + '</span>');
    if (must) tags.push('<span class="mw-tag must" title="This has a deadline, so it cannot be moved. If it is not checked off in time, you get a text and an email.">🔒 Must do · ' + esc(due || must) + '</span>');
    const rm = S.rem[o.key];
    if (rm && !o.done) tags.push(rm.ok ? '<span class="mw-tag rem">Reminder sent ' + esc(new Date(rm.at).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</span>'
      : '<span class="mw-tag remx">The reminder could not be sent: ' + esc(rm.error) + '</span>');
    if (o.moved) tags.push('<span class="mw-tag mv" title="Moved from ' + esc(nice(o.orig)) + '">Moved from ' + esc(DAY[dow(o.orig)].slice(0, 3)) + (o.orig.slice(0, 7) === o.date.slice(0, 7) && Math.abs(D(o.date) - D(o.orig)) < 6048e5 ? '' : ' ' + esc(nice(o.orig, { weekday: undefined }))) + '</span>');
    if (r.own && r.every !== 'once') tags.push('<span class="mw-tag">' + esc(EVERY_LABEL[r.every]) + '</span>');
    (r.links || []).forEach(([l, u]) => tags.push('<a class="mw-link" href="' + esc(u) + '" target="_blank" rel="noopener" draggable="false">' + esc(l) + ' ↗</a>'));
    const what = r.what && r.what.length ? '<button class="mw-more" data-act="' + (open ? 'less' : 'more') + '" data-key="' + esc(o.key) + '">' + (open ? 'Less' : 'What to do') + '</button>' : '<span></span>';
    const list = open && r.what && r.what.length ? '<ul class="mw-what">' + r.what.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
    const pick = S.pick === o.key ? pickHtml(o, now) : '';
    return '<div class="mw-card' + (o.done ? ' done' : '') + (must ? ' must' : '') + '" style="' + vars(r.cat) + '" draggable="' + (must ? 'false' : 'true') + '" data-key="' + esc(o.key) + '" data-date="' + o.date + '">'
      + '<button class="mw-chk" data-act="check" data-key="' + esc(o.key) + '" aria-label="' + (o.done ? 'Not done' : 'Check off') + '" title="' + (o.done ? 'Not done after all' : 'Check it off') + '">' + (o.done ? '✓' : '') + '</button>'
      + '<div class="mw-body">' + (r.time ? '<span class="mw-tm">' + esc(r.time) + '</span>' : '') + '<span class="mw-t">' + (r.icon ? r.icon + ' ' : '') + esc(r.t) + '</span>' + tags.join('') + list
      + '<div class="mw-foot">' + what + '<span class="mw-acts">' + (must ? '' : '<button class="mw-ic" data-act="next" data-key="' + esc(o.key) + '" title="Move to the next day" aria-label="Move to the next day">→</button>'
      + '<button class="mw-ic" data-act="pick" data-key="' + esc(o.key) + '" title="Move to another day" aria-label="Move to another day">📅</button>')
      + (r.own ? '<button class="mw-ic" data-act="remove" data-id="' + esc('i:' + r.id) + '" title="Remove this (every time it repeats)" aria-label="Remove">🗑</button>' : '')
      + '</span></div></div>' + pick + '</div>';
  }
  function pickHtml(o, now) {
    const nextMon = add(monday(now), 7);
    return '<div class="mw-pick" data-stop="1"><b>Move "' + esc(o.r.t.slice(0, 40)) + '" to</b>'
      + '<div class="q"><button class="mw-btn sm" data-act="to" data-key="' + esc(o.key) + '" data-to="' + now + '">Today</button>'
      + '<button class="mw-btn sm" data-act="to" data-key="' + esc(o.key) + '" data-to="' + add(now, 1) + '">Tomorrow</button>'
      + '<button class="mw-btn sm" data-act="to" data-key="' + esc(o.key) + '" data-to="' + nextMon + '">Next Monday</button>'
      + (o.moved ? '<button class="mw-btn sm" data-act="to" data-key="' + esc(o.key) + '" data-to="' + o.orig + '">Back to ' + esc(nice(o.orig)) + '</button>' : '') + '</div>'
      + '<input type="date" id="mwPickDate" value="' + o.date + '"><div class="q"><button class="mw-btn sm go" data-act="topick" data-key="' + esc(o.key) + '">Move</button><button class="mw-btn sm" data-act="unpick">Cancel</button></div></div>';
  }
  function chip(o) {
    return '<div class="mw-chip' + (o.done ? ' done' : '') + '" style="' + vars(o.r.cat) + '" draggable="' + (mustOf(o.r) ? 'false' : 'true') + '" data-key="' + esc(o.key) + '" title="' + esc((o.r.time ? o.r.time + ' ' : '') + o.r.t) + '">'
      + '<button class="mw-chk" data-act="check" data-key="' + esc(o.key) + '" aria-label="' + (o.done ? 'Not done' : 'Check off') + '">' + (o.done ? '✓' : '') + '</button><span>' + (o.r.icon || '') + ' ' + esc(o.r.t) + '</span></div>';
  }
  function formHtml(now) {
    const f = S.form || {};
    return '<div class="mw-form" data-stop="1"><label class="wide">What do you want on your calendar?<input id="mwF_t" maxlength="120" placeholder="For example: Call the bank about the line of credit" value="' + esc(f.t || '') + '"></label>'
      + '<label>Day<input type="date" id="mwF_date" value="' + esc(f.date || now) + '"></label>'
      + '<label>Time (optional)<input id="mwF_time" maxlength="12" placeholder="2:00 PM" value="' + esc(f.time || '') + '"></label>'
      + '<label>Repeat<select id="mwF_every">' + Object.keys(EVERY_LABEL).map((k) => '<option value="' + k + '"' + (f.every === k ? ' selected' : '') + '>' + EVERY_LABEL[k] + '</option>').join('') + '</select></label>'
      + '<label>Colour<select id="mwF_cat">' + Object.keys(CATS).map((k) => '<option value="' + k + '"' + ((f.cat || 'mine') === k ? ' selected' : '') + '>' + CATS[k].label + '</option>').join('') + '</select></label>'
      + '<label class="wide">Notes (optional)<input id="mwF_note" maxlength="400" value="' + esc(f.note || '') + '"></label>'
      + '<div class="acts"><button class="mw-btn go" data-act="save">Add it</button><button class="mw-btn" data-act="cancel">Cancel</button></div></div>';
  }

  /* ---------- views ---------- */
  function weekView(now) {
    const from = monday(S.anchor), to = add(from, 6), list = occ(from, to);
    const day = (i) => {
      const d = add(from, i), mine = list.filter((o) => o.date === d), k = dow(d);
      const auto = S.auto ? (AUTO[k] || []).map(([t, x]) => '<li>⏱ ' + (t ? '<b>' + esc(t) + '</b> ' : '') + esc(x) + '</li>').join('') : '';
      const left = mine.filter((o) => !o.done).length;
      return '<div class="mw-day mw-drop' + (d === now ? ' today' : d < now ? ' past' : '') + '" data-date="' + d + '">'
        + '<p class="mw-dn"><span>' + DAY[k] + (d === now ? '<span class="mw-now">Today</span>' : '') + '</span></p><p class="mw-dd">' + esc(nice(d, { weekday: undefined })) + (mine.length ? '<span>' + (mine.length - left) + ' of ' + mine.length + ' done</span>' : '') + '</p>'
        + (mine.length ? mine.map((o) => card(o, now)).join('') : '<p class="mw-empty">Nothing planned. Drop something here.</p>')
        + (auto ? '<ul class="mw-auto">' + auto + '</ul>' : '') + '</div>';
    };
    /* Her ask 11-17: Saturday and Sunday share one spot, so Monday to Friday get more room. */
    const days = [0, 1, 2, 3, 4].map(day).join('') + '<div class="mw-wkend">' + day(5) + day(6) + '</div>';
    const done = list.filter((o) => o.done).length;
    const late = from <= now && now <= to ? occ(add(now, -21), add(now, -1)).filter((o) => !o.done) : [];
    const todays = list.filter((o) => o.date === now);
    const cheer = todays.length && todays.every((o) => o.done) ? '<div class="mw-cheer">🎉 Everything for today is checked off. Nice work.</div>' : '';
    return { range: nice(from, { weekday: undefined }) + ' to ' + nice(to, { weekday: undefined, year: 'numeric' }), p: list.length ? Math.round(done * 100 / list.length) : 0, ring: done + '/' + list.length,
      html: cheer + (late.length ? '<div class="mw-late"><h4>Still open from before (' + late.length + ')</h4>' + late.map((o) => '<div class="row" style="' + vars(o.r.cat) + '"><span>' + esc(nice(o.date)) + ': ' + (o.r.icon || '') + ' ' + esc(o.r.t) + '</span>'
        + (mustOf(o.r) ? '<b class="mw-over">🔒 Overdue</b>' : '<button class="mw-btn sm" data-act="to" data-key="' + esc(o.key) + '" data-to="' + now + '">Move to today</button>') + '<button class="mw-btn sm" data-act="check" data-key="' + esc(o.key) + '">Done</button></div>').join('') + '</div>' : '')
        + '<div class="mw-week">' + days + '</div>' };
  }
  function monthView(now) {
    const [y, m] = ymd(S.anchor), first = y + '-' + String(m).padStart(2, '0') + '-01', last = add(first, lastDay(y, m) - 1);
    const from = monday(first), to = add(monday(last), 6), list = occ(from, to);
    let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => '<div class="mw-mh">' + x + '</div>').join('');
    for (let d = from; d <= to; d = add(d, 1)) {
      const its = list.filter((o) => o.date === d), more = S.open['day:' + d] ? its.length : 4;
      cells += '<div class="mw-cell mw-drop' + (d.slice(0, 7) !== first.slice(0, 7) ? ' out' : '') + (d === now ? ' today' : '') + '" data-date="' + d + '">'
        + '<button class="mw-cn" data-act="goweek" data-date="' + d + '" title="Open this week">' + ymd(d)[2] + '</button>'
        + its.slice(0, more).map(chip).join('') + (its.length > more ? '<button class="mw-plus" data-act="moreday" data-date="' + d + '">+' + (its.length - more) + ' more</button>' : '') + '</div>';
    }
    const inMonth = list.filter((o) => o.date >= first && o.date <= last), done = inMonth.filter((o) => o.done).length;
    return { range: MON[m - 1] + ' ' + y, p: inMonth.length ? Math.round(done * 100 / inMonth.length) : 0, ring: done + '/' + inMonth.length, html: '<div class="mw-month">' + cells + '</div>' };
  }
  function yearView(now) {
    const y = ymd(S.anchor)[0], list = occ(y + '-01-01', y + '-12-31');
    let all = 0, done = 0;
    const months = MON.map((name, i) => {
      const mm = String(i + 1).padStart(2, '0'), its = list.filter((o) => o.date.slice(5, 7) === mm);
      const wk = its.filter((o) => o.r.every === 'week' && !o.r.own), wkDone = wk.filter((o) => o.done).length;
      const big = its.filter((o) => !(o.r.every === 'week' && !o.r.own));
      all += its.length; done += its.filter((o) => o.done).length;
      const past = (y + '-' + mm) < now.slice(0, 7);
      return '<div class="mw-ym' + ((y + '-' + mm) === now.slice(0, 7) ? ' now' : '') + '"><h4><button data-act="gomonth" data-date="' + y + '-' + mm + '-01">' + name + '</button>'
        + '<span class="wk">' + (!wk.length ? '' : past || (y + '-' + mm) === now.slice(0, 7) ? 'Weekly: ' + wkDone + ' of ' + wk.length + ' done' : wk.length + ' weekly') + '</span></h4>'
        + (wk.length ? '<div class="meter"><i style="width:' + Math.round(wkDone * 100 / wk.length) + '%"></i></div>' : '')
        + '<ul>' + (big.length ? big.map((o) => '<li class="' + (o.done ? 'done' : '') + '" style="' + vars(o.r.cat) + '"><span class="dot"></span><span class="d">' + esc(nice(o.date, { weekday: undefined }).replace(/^\w+ /, '')) + '</span>'
          + '<span class="x">' + esc(o.r.t) + '</span>' + (o.done ? ' ✓' : '') + '</li>').join('') : '<li class="mw-empty">' + (wk.length ? 'Only the weekly sessions.' : 'Nothing here.') + '</li>') + '</ul></div>';
    }).join('');
    return { range: String(y), p: all ? Math.round(done * 100 / all) : 0, ring: done + '/' + all, html: '<div class="mw-year">' + months + '</div>' };
  }

  function draw() {
    const w = document.getElementById(S.target); if (!w) return;
    if (!allowed()) { w.innerHTML = '<p style="color:#57606a">My Week is Samantha\'s own page.</p>'; return; }
    css();
    const now = today(); if (!S.anchor) S.anchor = now;
    const v = S.view === 'month' ? monthView(now) : S.view === 'year' ? yearView(now) : weekView(now);
    const keyRow = Object.keys(CATS).map((k) => '<span><i style="background:' + CATS[k].c + '"></i>' + CATS[k].label + '</span>').join('') + (S.view === 'week' ? '<span>⏱ Runs on its own</span>' : '');
    const unit = S.view === 'month' ? 'month' : S.view === 'year' ? 'year' : 'week';
    const msg = S.err ? '<p class="mw-msg mw-bad">' + esc(S.err) + ' <button class="mw-btn sm" data-act="retry">Try again</button></p>'
      : '<p class="mw-msg">' + (!S.loaded ? 'Loading your check marks...' : esc(S.note || 'Check things off, move them with → or 📅, or drag them to another day. Saved for you in both hubs.')) + '</p>';
    w.innerHTML = '<div class="mw">'
      + '<div class="mw-head"><div class="mw-ring" style="--p:' + v.p + '" title="Done this ' + unit + '"><span>' + v.ring + '</span></div>'
      + '<div><h2>My Week</h2><p class="sub">Our time together, your due dates and your own things. Each session: 15 minutes on what waits on you, 40 on the main work, 5 on what is next. Times are Central.</p></div></div>'
      + '<div class="mw-bar"><div class="mw-seg">' + ['week', 'month', 'year'].map((x) => '<button data-act="view" data-v="' + x + '" class="' + (S.view === x ? 'on' : '') + '">' + x[0].toUpperCase() + x.slice(1) + '</button>').join('') + '</div>'
      + '<button class="mw-btn" data-act="prev" aria-label="Back one ' + unit + '">‹</button><button class="mw-btn" data-act="today">Today</button><button class="mw-btn" data-act="next' + unit + '" aria-label="Forward one ' + unit + '">›</button>'
      + '<span class="mw-range">' + esc(v.range) + '</span><button class="mw-btn go" data-act="add">+ Add to my calendar</button>'
      + (S.view === 'week' ? '<label class="mw-tog-auto"><input type="checkbox" id="mwAuto"' + (S.auto ? ' checked' : '') + '> Show what runs on its own</label>' : '') + '</div>'
      + msg + (S.form ? formHtml(now) : '')
      + '<div class="mw-key">' + keyRow + '</div>'
      + v.html
      + (S.view === 'week' ? '<div class="mw-row"><div class="mw-box"><h4>Every day, on its own</h4><ul>' + EVERY_DAY.map((x) => '<li>⏱ ' + esc(x) + '</li>').join('') + '</ul></div></div>' : '')
      + '</div>'
      + (S.undo ? '<div class="mw-toast" id="mwToast"><span>' + esc(S.undo.msg) + '</span><button data-act="undo">Undo</button></div>' : '');
    wire(w);
  }

  /* ---------- clicks and dragging ---------- */
  function step(n) {
    if (S.view === 'week') S.anchor = add(S.anchor, 7 * n);
    else if (S.view === 'month') { let [y, m] = ymd(S.anchor); m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } S.anchor = y + '-' + String(m).padStart(2, '0') + '-01'; }
    else { const [y] = ymd(S.anchor); S.anchor = (y + n) + '-01-01'; }
    S.pick = null; draw();
  }
  const findOcc = (key) => { const d = key.split('@')[1]; return occ(add(d, -62), add(d, 62)).find((o) => o.key === key); };
  function moveTo(key, to) {
    const o = findOcc(key); if (!o || !to) return;
    S.pick = null;
    if (mustOf(o.r) && to !== o.orig) { S.note = ''; S.err = '"' + o.r.t.slice(0, 50) + '" has a deadline, so it cannot be moved. Check it off when it is done.'; draw(); return; }
    if (o.date === to) { draw(); return; }
    mark(key, { to: to === o.orig ? null : to }, 'Moved "' + o.r.t.slice(0, 40) + '" to ' + nice(to) + '.');
  }
  async function act(a, el) {
    const key = el.getAttribute('data-key');
    if (a === 'view') { S.view = el.getAttribute('data-v'); store.set('view', S.view); S.pick = null; draw(); return; }
    if (a === 'prev') return step(-1);
    if (a === 'nextweek' || a === 'nextmonth' || a === 'nextyear') return step(1);
    if (a === 'today') { S.anchor = today(); draw(); return; }
    if (a === 'retry') { S.err = ''; return load(); }
    if (a === 'undo') return undo();
    if (a === 'more' || a === 'less') { S.open[key] = a === 'more'; draw(); return; }
    if (a === 'moreday') { S.open['day:' + el.getAttribute('data-date')] = true; draw(); return; }
    if (a === 'goweek') { S.view = 'week'; store.set('view', 'week'); S.anchor = el.getAttribute('data-date'); draw(); return; }
    if (a === 'gomonth') { S.view = 'month'; store.set('view', 'month'); S.anchor = el.getAttribute('data-date'); draw(); return; }
    if (a === 'check') { const o = findOcc(key); if (!o) return; return mark(key, { done: !o.done }, o.done ? null : 'Checked off "' + o.r.t.slice(0, 40) + '".'); }
    if (a === 'next') { const o = findOcc(key); if (o) moveTo(key, add(o.date, 1)); return; }
    if (a === 'pick') { S.pick = S.pick === key ? null : key; draw(); return; }
    if (a === 'unpick') { S.pick = null; draw(); return; }
    if (a === 'to') return moveTo(key, el.getAttribute('data-to'));
    if (a === 'topick') { const v = (document.getElementById('mwPickDate') || {}).value; if (/^\d{4}-\d{2}-\d{2}$/.test(v || '')) moveTo(key, v); return; }
    if (a === 'add') { S.form = S.form ? null : { date: S.view === 'week' && S.anchor !== today() ? monday(S.anchor) : today(), every: 'once', cat: 'mine' }; draw(); const t = document.getElementById('mwF_t'); if (t) t.focus(); return; }
    if (a === 'cancel') { S.form = null; draw(); return; }
    if (a === 'save') {
      const g = (id) => (document.getElementById(id) || {}).value || '';
      const item = { t: g('mwF_t').trim(), date: g('mwF_date'), time: g('mwF_time').trim(), every: g('mwF_every'), cat: g('mwF_cat'), note: g('mwF_note').trim() };
      S.form = item;
      if (!item.t) { S.err = 'Please give it a name.'; draw(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) { S.err = 'Please pick a day.'; draw(); return; }
      S.note = 'Saving...'; S.err = ''; draw();
      try {
        const j = await call({ action: 'add', item });
        S.rows.set(j.id, { kind: 'item', data: j.data }); S.form = null; S.note = 'Added "' + item.t.slice(0, 40) + '" (' + EVERY_LABEL[j.data.every].toLowerCase() + ').';
        S.anchor = item.date;
      } catch (e) { S.note = ''; S.err = 'That did not save: ' + e.message + ' Please try again.'; }
      draw(); return;
    }
    if (a === 'remove') {
      const id = el.getAttribute('data-id'), row = S.rows.get(id); if (!row) return;
      const ask = 'Remove "' + row.data.t + '"' + (row.data.every !== 'once' ? ' every time it repeats' : '') + '?';
      const yes = typeof ccConfirm === 'function' ? await ccConfirm(ask) : window.confirm(ask);
      if (!yes) return;
      S.note = 'Removing...'; draw();
      try { await call({ action: 'remove', id }); S.rows.delete(id); [...S.rows.keys()].forEach((k) => { if (k.startsWith('m:' + id.slice(2) + '@')) S.rows.delete(k); }); S.note = 'Removed.'; }
      catch (e) { S.note = ''; S.err = 'That did not remove: ' + e.message; }
      draw();
    }
  }
  function wire(w) {
    if (w.__mw) return; w.__mw = true;
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && w.contains(b)) { e.preventDefault(); act(b.getAttribute('data-act'), b); return; }
      if (S.pick && !e.target.closest('[data-stop]')) { S.pick = null; draw(); }
    });
    w.addEventListener('change', (e) => { if (e.target.id === 'mwAuto') { S.auto = e.target.checked; store.set('auto', S.auto ? '1' : '0'); draw(); } });
    w.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.mw-form') && e.target.tagName === 'INPUT') { e.preventDefault(); act('save', e.target); } if (e.key === 'Escape') { S.pick = null; S.form = null; draw(); } });
    let dragKey = null;
    w.addEventListener('dragstart', (e) => {
      const c = e.target.closest && e.target.closest('[draggable="true"][data-key]'); if (!c) return;
      dragKey = c.getAttribute('data-key'); c.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', dragKey); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
    });
    w.addEventListener('dragend', (e) => { const c = e.target.closest && e.target.closest('.dragging'); if (c) c.classList.remove('dragging'); w.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); });
    w.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('.mw-drop'); if (!z) return; e.preventDefault(); w.querySelectorAll('.over').forEach((x) => { if (x !== z) x.classList.remove('over'); }); z.classList.add('over'); });
    w.addEventListener('drop', (e) => {
      const z = e.target.closest && e.target.closest('.mw-drop'); if (!z) return; e.preventDefault();
      let k = dragKey; try { k = e.dataTransfer.getData('text/plain') || k; } catch (_) {}
      dragKey = null; z.classList.remove('over');
      if (k) moveTo(k, z.getAttribute('data-date'));
    });
  }

  /* ---------- open ---------- */
  function render(targetId) {
    S.target = targetId || 'mwWrap';
    const w = document.getElementById(S.target); if (!w) return;
    draw();
    if (allowed() && !S.loading) load();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !allowed()) return;
    const w = document.getElementById(S.target); if (w && w.offsetParent !== null && S.loaded) load();   /* changes from the other hub or another device */
  });
  function pillSync() {
    document.querySelectorAll('[data-tab="myweek"],[data-mw-pill]').forEach((p) => { p.style.display = allowed() ? '' : 'none'; });
  }
  window.MW = { MUST, mustOf, WEEKLY, RULES, DATES, AUTO, EVERY_DAY, CATS, render, pillSync, allowed, me, occ, hits, _state: S, _load: load };
})();
