/* =============================================================================
   MY WEEK (2026-11-17; Samantha: "create me a calendar or scheduled time we will work together, with what we have
   already set up for billing and payroll ... brainstorm marketing and other areas as well ... a cute clear schedule
   ... inside both subaccounts cds and caring companions in-home senior care, a tab for me in operations").
   Her "Yes, build it" to the draft: Mon 9:00 Money in, Tue 9:30 CDS payroll, Wed 10:00 Marketing, Thu 10:00 Growth,
   Fri 10:00 Big picture, plus everything that already runs on its own.
   2026-11-17 (Samantha): write-ups are sent by the Care Coordinators and overseen by her, "put it in my
   responsibilities": the Friday session starts with the write-up and coaching review.
   The SAME file is in both hubs (Caring Companions hub and CDS hub), so the two tabs always match: change it in both.
   Shown only to Samantha. Reads nothing and saves nothing; the week is written here. Times are Central.
   No em dashes in anything she reads (her rule).
   ============================================================================= */
(function () {
  const ME_EMAILS = ['samantha@mo-care.com', 'samantha@caringcds.com'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Our time together. k = day number (0 Sunday). */
  const TOGETHER = [
    { k: 1, time: '9:00 AM', t: 'Money in', icon: '💵', what: [
      'Open the AxisCare prep email (it comes from 5 AM).',
      'Send the private pay invoices first, so the money comes in fastest.',
      'Krystal fixes any $10 pay rates and missing clock times, then exports payroll to Viventium.' ] },
    { k: 2, time: '9:30 AM', t: 'CDS payroll and Medicaid', icon: '🩺', what: [
      'Review CDS payroll in Empeon before it locks Wednesday at 3 PM.',
      'Fix visits missing from Sandata and shifts never clocked out.',
      'On cutoff weeks, get the Medicaid claims ready for Thursday.' ] },
    { k: 3, time: '10:00 AM', t: 'Marketing', icon: '📣', what: [
      'Social posts, videos and the holiday season push.',
      'Google posts, reviews and ads.',
      'Partner outreach and the email campaigns.' ] },
    { k: 4, time: '10:00 AM', t: 'Growth', icon: '🌱', what: [
      'New leads and how fast we call them.',
      'Referrals and Friends and Family.',
      'Hiring: applicants, interviews and new caregivers.' ] },
    { k: 5, time: '10:00 AM', t: 'Big picture', icon: '🧭', what: [
      'Write-ups and coaching: approve what waits for you, look over what Krystal and Angiel decided.',
      'The office team: Katlin, Angiel and coverage.',
      'Ideas for the hubs and anything that is not working.',
      'Plan next week.' ] },
  ];

  /* What runs on its own, by day. */
  const AUTO = {
    0: [ ['4:00 PM', 'EVV forms email to you and Katlin'], ['', 'AxisCare work week ends'] ],
    1: [ ['5:00 AM', 'AxisCare billing and payroll prep email to you and Krystal'], ['6:15 AM', 'Money tab: books catch-up'], ['', 'Katlin enters the EVV form fixes in WellSky'] ],
    2: [ ['9:00 AM', 'CDS billing prep: payroll check, Sandata gaps, claims'] ],
    3: [ ['3:00 PM', 'CDS payroll locks'] ],
    4: [ ['', 'CDS attendants paid'], ['', 'Medicaid claims entered in eMOMED on cutoff weeks'] ],
    5: [ ['', 'Caregivers paid (AxisCare, Viventium)'], ['5:00 PM', 'Medicaid claim cutoff, every other week'] ],
    6: [ ['11:59 PM', 'EVV forms due for this CDS pay week'], ['', 'CDS pay week ends'] ],
  };
  const EVERY_DAY = [
    '6:30 AM WellSky check',
    'Sandata check, once you are signed in',
    '8:30 AM Waiting on you (weekdays)',
    'Clock-out texts to consumers, 9 AM to 6 PM (practice for now)',
  ];
  /* Dates coming up (Central). Past ones drop off by themselves. */
  const DATES = [
    ['2026-11-20', 'Medicaid claim cutoff, 5 PM'],
    ['2026-11-20', 'Look at the practice clock-out texts and decide on the switch'],
    ['2026-11-22', 'First Sunday EVV forms email'],
    ['2026-11-23', 'First Monday AxisCare prep email'],
    ['2026-12-04', 'Medicaid payday: rebill the $0 lines from Nov 20'],
    ['2026-12-07', 'Monthly profit close in the Owners Hub'],
    ['2026-12-11', 'Medicaid claim cutoff, 5 PM'],
    ['2026-12-23', 'Enter claims early: the Dec 25 cutoff falls on Christmas'],
    ['2027-01-08', 'Medicaid claim cutoff, 5 PM'],
    ['2027-03-15', 'Clocks changed: EVV forms email moves to 5 PM Sunday'],
  ];
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ORDER = [1, 2, 3, 4, 5, 6, 0];

  function me() {
    try {
      const hu = document.getElementById('header_user');   /* the CDS hub shows the signed-in email there */
      const a = (typeof ccActor === 'function' && (ccActor() || {}).email) || (typeof ME !== 'undefined' && ME && ME.email) || window.MW_EMAIL || (hu && hu.textContent) || '';
      return String(a).trim().toLowerCase();
    } catch (_) { return String(window.MW_EMAIL || '').toLowerCase(); }
  }
  function allowed() { return ME_EMAILS.indexOf(me()) > -1; }
  function chi() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: p.year + '-' + p.month + '-' + p.day, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  }
  const nice = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };

  function css() {
    if (document.getElementById('mwCss')) return;
    const s = document.createElement('style'); s.id = 'mwCss';
    s.textContent = '.mw{font-family:inherit;color:#1f2a36;max-width:1180px}'
      + '.mw h2{margin:0 0 4px;font-size:22px;color:#0D365F}.mw .sub{margin:0 0 14px;color:#57606a;font-size:14px}'
      + '.mw-key{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:#57606a;margin:0 0 12px}.mw-key i{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:5px}'
      + '.mw-week{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}'
      + '.mw-day{background:#fff;border:1px solid #e3e8ee;border-radius:14px;padding:12px;min-width:0}'
      + '.mw-day.today{border:2px solid #1D9E75;background:#F4FBF8}.mw-dn{font-weight:700;font-size:14px;margin:0 0 8px;color:#0D365F;display:flex;justify-content:space-between;align-items:center}'
      + '.mw-now{font-size:11px;font-weight:700;color:#fff;background:#1D9E75;border-radius:99px;padding:2px 8px}'
      + '.mw-tog{background:#E1F5EE;border-radius:10px;padding:9px 10px;margin:0 0 8px}.mw-tog b{display:block;font-size:13.5px;color:#085041}.mw-tog .tm{font-size:12px;color:#0F6E56;font-weight:700}'
      + '.mw-tog ul{margin:6px 0 0 16px;padding:0;font-size:12.5px;line-height:1.45;color:#0F4F3E}'
      + '.mw-auto{font-size:12.5px;color:#57606a;line-height:1.45;margin:6px 0 0;padding:0;list-style:none}.mw-auto li{padding:3px 0;border-top:1px dashed #e3e8ee}.mw-auto li:first-child{border-top:0}.mw-auto b{color:#3d4752}'
      + '.mw-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:12px}'
      + '.mw-box{background:#fff;border:1px solid #e3e8ee;border-radius:14px;padding:12px 14px}.mw-box h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#57606a}'
      + '.mw-box ul{margin:0;padding:0;list-style:none;font-size:13px;line-height:1.5}.mw-box li{padding:4px 0;border-top:1px solid #f0f2f5}.mw-box li:first-child{border-top:0}.mw-box .d{font-weight:700;color:#0D365F;display:inline-block;min-width:92px}'
      + '.mw-soon{color:#A8660E;font-weight:700}';
    document.head.appendChild(s);
  }

  function render(targetId) {
    const w = document.getElementById(targetId || 'mwWrap'); if (!w) return;
    if (!allowed()) { w.innerHTML = '<p style="color:#57606a">My Week is Samantha\'s own page.</p>'; return; }
    css();
    const now = chi();
    const days = ORDER.map((k) => {
      const tog = TOGETHER.filter((s) => s.k === k).map((s) =>
        '<div class="mw-tog"><span class="tm">' + esc(s.time) + '</span><b>' + s.icon + ' ' + esc(s.t) + '</b><ul>' + s.what.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>').join('');
      const auto = (AUTO[k] || []).map(([t, x]) => '<li>⏱ ' + (t ? '<b>' + esc(t) + '</b> ' : '') + esc(x) + '</li>').join('');
      const isToday = k === now.dow;
      return '<div class="mw-day' + (isToday ? ' today' : '') + '"><p class="mw-dn">' + DAY[k] + (isToday ? '<span class="mw-now">Today</span>' : '') + '</p>'
        + tog + (auto ? '<ul class="mw-auto">' + auto + '</ul>' : '') + '</div>';
    }).join('');
    const soon = DATES.filter(([d]) => d >= now.date).slice(0, 8);
    const in7 = (d) => (Date.parse(d + 'T12:00:00Z') - Date.parse(now.date + 'T12:00:00Z')) / 864e5 <= 7;
    w.innerHTML = '<div class="mw">'
      + '<h2>My Week</h2><p class="sub">Our time together, and what already runs on its own. Times are Central.</p>'
      + '<div class="mw-key"><span><i style="background:#1D9E75"></i>Our time together</span><span>⏱ Runs on its own</span></div>'
      + '<div class="mw-week">' + days + '</div>'
      + '<div class="mw-row">'
      + '<div class="mw-box"><h4>Every day</h4><ul>' + EVERY_DAY.map((x) => '<li>⏱ ' + esc(x) + '</li>').join('') + '</ul></div>'
      + '<div class="mw-box"><h4>Coming up</h4><ul>' + (soon.length ? soon.map(([d, x]) => '<li><span class="d' + (in7(d) ? ' mw-soon' : '') + '">' + esc(nice(d)) + '</span> ' + esc(x) + '</li>').join('') : '<li>Nothing dated yet.</li>') + '</ul></div>'
      + '</div></div>';
  }
  function pillSync() {
    document.querySelectorAll('[data-tab="myweek"],[data-mw-pill]').forEach((p) => { p.style.display = allowed() ? '' : 'none'; });
  }
  window.MW = { TOGETHER, AUTO, EVERY_DAY, DATES, render, pillSync, allowed, me };
})();
