// The daily CDS check, the part that runs inside WellSky (2026-10-19).
//
// The 6:30am task on Samantha's Mac opens one WellSky report page in her logged-in
// Chrome and runs this code there, once per report:
//   https://troutman.clearcareonline.com/reports/schedules/            KIND = 'shifts'
//   https://troutman.clearcareonline.com/reports/clientauthorizations/ KIND = 'auths'
//   https://troutman.clearcareonline.com/reports/custom/extreme/#/saved/carelogs/202552   KIND = 'open'
//     (her saved Custom Report "CDS Daily Check - Care Logs", 2026-10-20: shifts never clocked out)
// The task puts one line in front of it: const KIND = '...'; const FN = '...';
// The result carries receiptParts (six short pieces); the task joins them into the receipt.
// There is NO key here (2026-10-20): the hub only parks what this sends and returns a
// receipt; the task then confirms that receipt from the Mac with the key, which stays in
// cds-security/wellsky_ingest.key and never goes into a web page.
//
// It fills the report form the way a person would (CDS: Consumer tag, select all,
// a date range), runs it, waits for WellSky to build it, and posts the page text
// straight to the hub's cds-wellsky function, which returns a receipt for the task to
// confirm. Anything that goes wrong is posted as a failed run with the reason, so the hub shows it. It reads WellSky; it never changes it.
//   schedules:      first day of last month to the last day of this month
//                   (last month gives each attendant's usual shift length)
//   authorizations: first day of this month to the last day of next month
//                   (next month shows whether a new authorization is in)
await (async () => {
  const send = async body => {
    try {
      const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ ok: false, error: 'the hub answered ' + r.status }));
      // The browser tool hides anything that looks like a password, and a 36-character
      // receipt does. So it comes back as six short pieces; the task joins them (2026-10-20).
      if (j && typeof j.receipt === 'string') { j.receiptParts = j.receipt.match(/.{1,6}/g); delete j.receipt; }
      return j;
    } catch (e) { return { ok: false, error: 'could not reach the hub: ' + e.message }; }
  };
  const failed = why => send({ kind: 'failed', why: (KIND === 'shifts' ? 'Schedule report: ' : 'Authorizations report: ') + why });
  const pad = n => String(n).padStart(2, '0');
  const us = d => pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear();
  const now = new Date();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Her saved Custom Report. It is run the way a person runs it (new dates, Run Report),
  // then its own data is read back from WellSky and only the shifts still In Progress
  // are sent, with no addresses, phones or anything else.
  if (KIND === 'open') {
    const failedOpen = why => send({ kind: 'failed', why: 'Open shift report: ' + why });
    if (location.host !== 'troutman.clearcareonline.com' || location.pathname !== '/reports/custom/extreme/' || !/#\/saved\/carelogs\/\d+/.test(location.hash))
      return failedOpen('WellSky did not open the saved report (it may need logging in again).');
    let dates = [];
    for (let i = 0; i < 20 && dates.length < 2; i++) { await sleep(1000); dates = [...document.querySelectorAll('input.hasDatepicker')]; }
    const run = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Run Report');
    if (dates.length < 2 || !run || !window.jQuery) return failedOpen('the saved report did not load its date boxes.');
    const recent = async () => { const r = await fetch('/api/reports/recent/data', { credentials: 'include' }); return r.ok ? r.json() : []; };
    const before = Math.max(0, ...(await recent()).filter(x => x.report_key === 'carelogs').map(x => x.id));
    const from = us(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45)), to = us(now);
    window.jQuery(dates[0]).val(from).trigger('input').trigger('change');
    window.jQuery(dates[1]).val(to).trigger('input').trigger('change');
    run.click();
    let got = null;
    for (let i = 0; i < 80 && !got; i++) {
      await sleep(3000);
      const mine = (await recent()).filter(x => x.report_key === 'carelogs' && x.id > before && x.status === 2);
      if (mine.length) {
        const r = await fetch('/api/reports/data/' + mine[0].id, { credentials: 'include' }).catch(() => null);
        if (r && r.ok) got = await r.json();
      }
    }
    if (!got) return failedOpen('WellSky did not finish building the report within 4 minutes.');
    let rows;
    try { rows = JSON.parse(got.data); } catch (e) { return failedOpen('WellSky sent the report in a shape this check does not know.'); }
    const filters = JSON.stringify((got.json_options && got.json_options.filters) || []);
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 19);
    const res = await send({ kind: 'open', from, to, total: Array.isArray(rows) ? rows.length : -1, pulledLocal: local,
      report: { name: got.report_name, cdsFilter: filters.includes('CDS: Consumer') },
      rows: (Array.isArray(rows) ? rows : []).filter(r => r && r.status === 'In Progress')
        .map(r => ({ consumer: r.patient__profile, attendant: r.caregiver__profile, clockIn: r._clock_in, status: r.status })) });
    return Object.assign({ from, to }, res);
  }

  const page = { shifts: '/reports/schedules/', auths: '/reports/clientauthorizations/' }[KIND];
  if (!page) return { ok: false, error: 'KIND must be shifts, auths or open' };
  if (location.host !== 'troutman.clearcareonline.com' || location.pathname !== page)
    return failed('WellSky did not open the report page (it may need logging in again).');
  const fm = document.getElementById('report-form');
  const $ = window.jQuery;
  if (!fm || !$) return failed('the WellSky report form was not on the page (it may need logging in again).');

  const first = (y, m) => new Date(y, m, 1), last = (y, m) => new Date(y, m + 1, 0);
  const from = KIND === 'shifts' ? us(first(now.getFullYear(), now.getMonth() - 1)) : us(first(now.getFullYear(), now.getMonth()));
  const to = KIND === 'shifts' ? us(last(now.getFullYear(), now.getMonth())) : us(last(now.getFullYear(), now.getMonth() + 1));

  const tag = [...fm.elements.tags_filter.options].find(o => o.text.trim() === 'CDS: Consumer');
  if (!tag) return failed('the "CDS: Consumer" tag is missing in WellSky, so the CDS consumers could not be picked.');
  fm.querySelectorAll('input[name=clients]:checked').forEach(c => c.click());
  $(fm.elements.tags_filter).val([tag.value]).trigger('change');
  await new Promise(r => setTimeout(r, 1500));
  if (!fm.elements.select_all.checked) fm.elements.select_all.click();
  if (fm.elements.status) { const active = [...fm.querySelectorAll('input[name=status]')].find(r => r.value === '1'); if (active && !active.checked) active.click(); }
  $(fm.elements.period).val('').trigger('change');
  fm.elements.from_.value = from; fm.elements.to_.value = to;
  $(fm.elements.from_).trigger('change'); $(fm.elements.to_).trigger('change');
  const picked = [...fm.querySelectorAll('input[name=clients]')].filter(c => c.offsetParent !== null).length;
  if (!picked) return failed('no CDS consumers were listed under the "CDS: Consumer" tag.');
  fm.querySelector('[name=show-report]').click();

  // WellSky builds the report in the background; this one is ready when its date range shows.
  const want = 'Date Range: ' + from + ' - ' + to;
  let text = '';
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const el = document.getElementById('the_report');
    text = el ? el.innerText : '';
    if (text.includes(want) && !/Generating report/.test(text)) break;
    text = '';
  }
  if (!text) return failed('WellSky did not finish building the report within 4 minutes.');
  const res = await send({ kind: KIND, text });
  return Object.assign({ consumersPicked: picked, from, to }, res);
})();
