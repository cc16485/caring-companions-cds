// The daily CDS check, the part that runs inside WellSky (2026-10-19).
//
// The 6:30am task on Samantha's Mac opens one WellSky report page in her logged-in
// Chrome and runs this code there, once per report:
//   https://troutman.clearcareonline.com/reports/schedules/            KIND = 'shifts'
//   https://troutman.clearcareonline.com/reports/clientauthorizations/ KIND = 'auths'
// The task puts three lines in front of it: const KIND = '...'; const KEY = '...'; const FN = '...';
// (KEY lives on the Mac in cds-security/wellsky_ingest.key, never in this public repo.)
//
// It fills the report form the way a person would (CDS: Consumer tag, select all,
// a date range), runs it, waits for WellSky to build it, and posts the page text
// straight to the hub's cds-wellsky function. Anything that goes wrong is posted as a
// failed run with the reason, so the hub shows it. It reads WellSky; it never changes it.
//   schedules:      first day of last month to the last day of this month
//                   (last month gives each attendant's usual shift length)
//   authorizations: first day of this month to the last day of next month
//                   (next month shows whether a new authorization is in)
await (async () => {
  const send = async body => {
    try {
      const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wellsky-key': KEY }, body: JSON.stringify(body) });
      return await r.json().catch(() => ({ ok: false, error: 'the hub answered ' + r.status }));
    } catch (e) { return { ok: false, error: 'could not reach the hub: ' + e.message }; }
  };
  const failed = why => send({ kind: 'failed', why: (KIND === 'shifts' ? 'Schedule report: ' : 'Authorizations report: ') + why });
  const page = { shifts: '/reports/schedules/', auths: '/reports/clientauthorizations/' }[KIND];
  if (!page) return { ok: false, error: 'KIND must be shifts or auths' };
  if (location.host !== 'troutman.clearcareonline.com' || location.pathname !== page)
    return failed('WellSky did not open the report page (it may need logging in again).');
  const fm = document.getElementById('report-form');
  const $ = window.jQuery;
  if (!fm || !$) return failed('the WellSky report form was not on the page (it may need logging in again).');

  const pad = n => String(n).padStart(2, '0');
  const us = d => pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear();
  const now = new Date();
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
