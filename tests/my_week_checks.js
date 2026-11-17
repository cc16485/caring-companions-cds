/* My Week calendar checks, the SAME file in both hubs (CDS tests/my_week_checks.js, CC tests/browser/my_week_checks.js).
   Runs inside the real hub page as Samantha, with the clock at Tue 2026-11-17 11 AM Central and the calendar server
   replaced by an in-memory copy (window.MW_API). window.__openMW() opens the tab. Returns [[PASS|FAIL, name, detail]]. */
async () => {
  const R = [], ok = (n, c, d) => R.push([c ? 'PASS' : 'FAIL', n, c ? '' : JSON.stringify(d === undefined ? '' : d).slice(0, 500)]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const db = new Map(); const calls = []; let fail = false;
  window.MW_API = async (b) => {
    calls.push(JSON.parse(JSON.stringify(b)));
    if (fail) throw new Error('No connection.');
    if (b.action === 'list') return { ok: true, rows: [...db].map(([id, v]) => ({ id, kind: v.kind, data: v.data })) };
    if (b.action === 'mark') {
      const id = 'm:' + b.key, d = Object.assign({}, (db.get(id) || {}).data || {});
      if ('done' in b) d.done = !!b.done; if ('to' in b) { if (!b.to) delete d.to; else d.to = b.to; }
      if (!d.done) delete d.done; if (!d.done && !d.to) db.delete(id); else db.set(id, { kind: 'mark', data: d });
      return { ok: true, id, data: d };
    }
    if (b.action === 'add') { const id = 'i:tst' + (db.size + 1) + 'xyz'; const data = Object.assign({ every: 'once', cat: 'mine' }, b.item); db.set(id, { kind: 'item', data }); return { ok: true, id, data }; }
    if (b.action === 'remove') { db.delete(b.id); return { ok: true, id: b.id }; }
  };
  window.ccConfirm = async () => true; window.confirm = () => true;
  try { (0, eval)('ccConfirm=window.ccConfirm'); } catch (_) {}
  const W = () => document.getElementById('mwWrap'), q = (s) => W().querySelector(s), qa = (s) => [...W().querySelectorAll(s)];
  const col = (date) => q('.mw-day[data-date="' + date + '"]');
  const card = (txt) => qa('.mw-card').find((c) => c.innerText.includes(txt));
  const click = async (el) => { el.click(); await sleep(60); };
  await window.__openMW(); await sleep(250);
  const t = W().innerText;
  ok('it loads her saved marks from the server', calls[0] && calls[0].action === 'list', calls);
  ok('week view starts Monday Nov 16, Tuesday is today', qa('.mw-day')[0].dataset.date === '2026-11-16' && q('.mw-day.today').dataset.date === '2026-11-17');
  ok('Saturday and Sunday share one spot after Friday', W().querySelector('.mw-week').children.length === 6 && [...q('.mw-wkend').querySelectorAll('.mw-day')].map((x) => x.dataset.date).join() === '2026-11-21,2026-11-22');
  ok('the five times together, the Monday huddle and the Saturday EVV deadline (v3)', ['Money in: AxisCare billing and payroll prep', 'Team huddle, 15 minutes', 'CDS day: payroll, Medicaid and growth', 'Marketing, all three brands', 'Growth: leads, hiring and grants', 'Switch hour and big picture', 'CDS EVV forms due'].every((x) => t.includes(x)), t.slice(0, 400));
  ok('Monday 9 AM is AxisCare and 10 AM the huddle, Tuesday 9:30 is the CDS day, Saturday is EVV', /Money in/.test(col('2026-11-16').innerText) && /10:00 AM[\s\S]*Team huddle/.test(col('2026-11-16').innerText) && /9:30 AM[\s\S]*CDS day/.test(col('2026-11-17').innerText) && /EVV forms due/.test(col('2026-11-21').innerText));
  ok('dated things this week are on their day', /Medicaid claim cutoff/.test(col('2026-11-20').innerText) && /First Sunday EVV forms email/.test(col('2026-11-22').innerText));
  ok('what runs on its own shows, and can be hidden', /CDS payroll locks/.test(col('2026-11-18').innerText) && /6:30 AM WellSky check/.test(t));
  const auto = document.getElementById('mwAuto'); auto.checked = false; auto.dispatchEvent(new Event('change', { bubbles: true })); await sleep(50);
  ok('hiding what runs on its own', !/CDS payroll locks/.test(W().innerText)); const a2 = document.getElementById('mwAuto'); a2.checked = true; a2.dispatchEvent(new Event('change', { bubbles: true })); await sleep(50);
  ok('Monday\'s two unchecked sessions show under Still open from before', /Still open from before \(2\)/.test(W().innerText) && /Money in/.test(q('.mw-late').innerText) && /Team huddle/.test(q('.mw-late').innerText));
  // check off
  await click(card('CDS day').querySelector('.mw-chk'));
  let last = calls[calls.length - 1];
  ok('checking off saves to the server', last.action === 'mark' && last.key === 'w-cdspay@2026-11-17' && last.done === true, last);
  ok('the card shows checked and the ring counts it', card('CDS day').classList.contains('done') && /^1\//.test(q('.mw-ring').innerText), q('.mw-ring').innerText);
  ok('an Undo shows', !!document.getElementById('mwToast') && /Checked off/.test(document.getElementById('mwToast').innerText));
  await click(document.querySelector('#mwToast button'));
  ok('Undo takes the check back on the server', !card('CDS day').classList.contains('done') && !db.has('m:w-cdspay@2026-11-17'));
  await click(card('CDS day').querySelector('.mw-chk'));
  // next day
  await click(card('Growth').querySelector('[data-act="next"]'));
  last = calls[calls.length - 1];
  ok('→ moves Growth to Friday on the server', last.action === 'mark' && last.key === 'w-growth@2026-11-19' && last.to === '2026-11-20', last);
  ok('Growth now sits on Friday, marked as moved', /Growth/.test(col('2026-11-20').innerText) && !/Growth/.test(col('2026-11-19').innerText.replace(/runs on its own/i, '')) && /Moved from Thu/.test(card('Growth').innerText), col('2026-11-20').innerText.slice(0, 200));
  // drag
  const dt = new DataTransfer(); const mk = card('Marketing');
  mk.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  col('2026-11-21').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  col('2026-11-21').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(80);
  ok('dragging Marketing onto Saturday moves it', db.get('m:w-mkt@2026-11-18') && db.get('m:w-mkt@2026-11-18').data.to === '2026-11-21' && /Marketing/.test(col('2026-11-21').innerText));
  // pick a day
  await click(card('Switch hour').querySelector('[data-act="pick"]'));
  ok('📅 opens the day picker', !!q('.mw-pick') && /Next Monday/.test(q('.mw-pick').innerText));
  await click([...q('.mw-pick').querySelectorAll('button')].find((b) => b.innerText === 'Next Monday'));
  ok('Next Monday moves Big picture to Nov 23', db.get('m:w-big@2026-11-20').data.to === '2026-11-23' && !card('Switch hour'));
  await click(q('[data-act="nextweek"]'));
  ok('next week shows Big picture on Monday Nov 23, still movable back', /Switch hour/.test(col('2026-11-23').innerText) && /Moved from Fri/.test(card('Switch hour').innerText));
  await click(card('Switch hour').querySelector('[data-act="pick"]'));
  await click([...q('.mw-pick').querySelectorAll('button')].find((b) => /^Back to/.test(b.innerText)));
  ok('Back to its own day clears the move', !db.has('m:w-big@2026-11-20'));
  await click(q('[data-act="today"]'));
  // still open: move to today
  await click([...q('.mw-late').querySelectorAll('button')].find((b) => b.innerText === 'Move to today'));
  ok('Move to today puts Monday\'s Money in on Tuesday (the huddle stays under still open)', db.get('m:w-money@2026-11-16').data.to === '2026-11-17' && /Money in/.test(col('2026-11-17').innerText) && !/Money in/.test((q('.mw-late') || { innerText: '' }).innerText));
  // a failure shows and nothing pretends to be saved
  fail = true; await click(card('Money in').querySelector('.mw-chk')); fail = false;
  ok('when the server cannot be reached it says so and the check goes back', /did not save: No connection/.test(W().innerText) && !card('Money in').classList.contains('done') && !!q('[data-act="retry"]'));
  await click(q('[data-act="retry"]'));
  // month
  await click(q('[data-act="view"][data-v="month"]'));
  ok('Month view shows November 2026 with today ringed', /November 2026/.test(q('.mw-range').innerText) && q('.mw-cell.today') && q('.mw-cell.today').dataset.date === '2026-11-17');
  await click(q('[data-act="nextmonth"]'));
  const c15 = q('.mw-cell[data-date="2026-12-15"]');
  ok('December 15 has the Empeon CDS tax IDs, due Dec 31', c15 && /Empeon CDS tax IDs/.test(c15.innerText), c15 && c15.innerText);
  ok('December 7 has the monthly profit close', /Monthly profit close/.test(q('.mw-cell[data-date="2026-12-07"]').innerText));
  await click([...c15.querySelectorAll('.mw-chip')].find((c) => /Empeon CDS tax IDs/.test(c.innerText)).querySelector('.mw-chk'));
  ok('a month chip can be checked off', db.get('m:q-empeon@2026-12-15') && db.get('m:q-empeon@2026-12-15').data.done === true);
  await click(q('.mw-cell[data-date="2026-12-15"] [data-act="goweek"]'));
  ok('clicking a day number opens that week', /Dec 14 to Dec 20, 2026/.test(q('.mw-range').innerText) && /Due Dec 31/.test(card('Empeon CDS tax IDs').innerText) && card('Empeon CDS tax IDs').classList.contains('done'), q('.mw-range').innerText);
  // year
  await click(q('[data-act="view"][data-v="year"]'));
  await click(q('[data-act="nextyear"]'));
  const jan = qa('.mw-ym')[0].innerText, mar = qa('.mw-ym')[2].innerText;
  ok('Year 2027: January has the vendor letter, W-2s and the Q4 unemployment report', /2027/.test(q('.mw-range').innerText) && /vendor acknowledgement/.test(jan) && /W-2s go out/.test(jan) && /Q4 unemployment report due/.test(jan) && /Medicaid claim cutoff/.test(jan), jan);
  ok('every quarter: Empeon in March, June, September and December', [2, 5, 8, 11].every((i) => /Empeon CDS tax IDs/.test(qa('.mw-ym')[i].innerText)) && !/Empeon/.test(qa('.mw-ym')[3].innerText));
  await click(q('[data-act="prev"]'));
  ok('this year shows November with the weekly count', /Weekly: \d+ of \d+ done/.test(qa('.mw-ym')[10].innerText) && !/Weekly/.test(qa('.mw-ym')[0].innerText), qa('.mw-ym')[10].innerText);
  // add her own
  await click(q('[data-act="view"][data-v="week"]')); await click(q('[data-act="today"]'));
  await click(q('[data-act="add"]'));
  document.getElementById('mwF_t').value = 'Call the bank'; document.getElementById('mwF_date').value = '2026-11-19'; document.getElementById('mwF_every').value = 'month'; document.getElementById('mwF_time').value = '2:00 PM';
  await click(q('[data-act="save"]')); await sleep(60);
  last = calls[calls.length - 1];
  ok('Add saves her own item, every month', last.action === 'add' && last.item.t === 'Call the bank' && last.item.every === 'month', last);
  ok('her item is on Thursday with Every month', /Call the bank/.test(col('2026-11-19').innerText) && /Every month/.test(card('Call the bank').innerText));
  await click(q('[data-act="view"][data-v="month"]')); await click(q('[data-act="nextmonth"]'));
  ok('and again on December 19', /Call the bank/.test(q('.mw-cell[data-date="2026-12-19"]').innerText));
  await click(q('[data-act="view"][data-v="week"]')); await click(q('[data-act="today"]'));
  await click(card('Call the bank').querySelector('[data-act="remove"]')); await sleep(60);
  ok('her own item can be removed', !card('Call the bank') && calls[calls.length - 1].action === 'remove');
  ok('built-in items have no remove button', !card('Money in').querySelector('[data-act="remove"]'));
  ok('no em or en dash anywhere', !/[—–]/.test(W().innerText));
  ok('nothing was saved in the browser', !Object.keys(localStorage).some((k) => /^mw_/.test(k) && !/^mw_(view|auto)$/.test(k)));
  return R;
}
