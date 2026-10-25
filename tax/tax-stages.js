// Tax & Enrollment Setup in stages (2026-10-25, her yes to the mockup 5FdC5XFmaZcKfo6vXLVz2V).
// Her switch 'taxStages'. Off = the screen as before.
//
// The same cards and fields as today, grouped by when they happen instead of by form:
//   A  Today: the packet is in        packet, split, existing-EIN check (transfers), EIN, 8821
//   B  The day the EIN arrives        2678, 2643A, 2827
//   C  Waiting on the state and IRS   MO Tax ID, 2678 approval
//   D  Fusion proof (audited)         both numbers in Fusion, proof uploaded
//   E  Payroll ready                  Empeon
//   F  Later: first $1,000 quarter    DES
// This file only works out where a consumer stands: the one next step, the 90-day Fusion clock and
// the packet date check. It reads a consumer record (with the screen's unsaved fields laid over it)
// and never writes. No em dashes in anything a person reads.
(function (root) {
  const DAY = 864e5;
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const day = s => new Date(String(s).slice(0, 10) + 'T12:00:00');
  const addDays = (s, n) => iso(new Date(day(s).getTime() + n * DAY));
  const between = (a, b) => Math.round((day(b) - day(a)) / DAY);
  const mdy = s => s ? s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4) : '';
  const first = c => String((c && c.name) || '').trim().split(/\s+/)[0] || 'the consumer';
  const filed = (c, key) => !!(((c.filings || {})[key] || {}).sentAt);
  const sentOn = (c, key) => ((c.filings || {})[key] || {}).sentAt || '';
  const has = v => !!String(v || '').trim();

  // Same "done" rules as the chips on the old screen, plus the two new ones.
  const DONE = {
    packet:  c => has(c.packetSigned),
    split:   c => (c.packetForms || []).length > 0,
    check:   c => has(c.ein) || c.einCheck === 'has' || c.einCheck === 'none',
    ein:     c => has(c.ein),
    f8821:   c => !!c.irs8821 || filed(c, 'IRS-8821'),
    f2678:   c => !!c.irs2678 || filed(c, 'IRS-2678'),
    f2643a:  c => !!c.mo2643a || filed(c, 'MO-2643A'),
    f2827:   c => !!c.mo2827 || filed(c, 'MO-2827'),
    motaxid: c => has(c.moTaxId),
    fusion:  c => !!c.fusionEntered,
    proof:   c => has(c.proofUploaded) || !!c.priorVendorProof,
    empeon:  c => has(c.empeonUpdated),
    des:     c => !!c.desRegistered || filed(c, 'DES'),
  };

  // card = the data-card of the section on the screen (10 = the existing-EIN check, 11 = waiting).
  const STEPS = [
    { id: 'packet',  chip: 'Packet signed',  stage: 'A', card: 1 },
    { id: 'split',   chip: 'Split',          stage: 'A', card: 1 },
    { id: 'check',   chip: 'EIN check',      stage: 'A', card: 10, transferOnly: true },
    { id: 'ein',     chip: 'EIN',            stage: 'A', card: 2 },
    { id: 'f8821',   chip: '8821',           stage: 'A', card: 3 },
    { id: 'f2678',   chip: '2678',           stage: 'B', card: 4 },
    { id: 'f2643a',  chip: '2643A',          stage: 'B', card: 5 },
    { id: 'f2827',   chip: '2827',           stage: 'B', card: 6 },
    { id: 'motaxid', chip: 'MO Tax ID',      stage: 'C', card: 11 },
    { id: 'fusion',  chip: 'In Fusion',      stage: 'D', card: 8 },
    { id: 'proof',   chip: 'Proof uploaded', stage: 'D', card: 8 },
    { id: 'empeon',  chip: 'Empeon',         stage: 'E', card: 9 },
    { id: 'des',     chip: 'DES',            stage: 'F', card: 7 },
  ];

  const STAGES = [
    { id: 'A', name: 'Today: the packet is in', when: 'Do these the same day the signed packet comes back.', cards: [1, 10, 2, 3] },
    { id: 'B', name: 'The day the EIN arrives', when: 'All three open together once the federal EIN is in.', cards: [4, 5, 6],
      needs: ['ein'], lock: 'Waiting on the federal EIN from the first stage. The forms are ready below.' },
    { id: 'C', name: 'Waiting on Missouri and the IRS', when: 'Nothing to send here. Watch for the letters.', cards: [11] },
    { id: 'D', name: 'Fusion proof', when: 'This is the step that gets audited.', cards: [8], audited: true,
      needs: ['ein', 'motaxid'], lock: 'Needs both the federal EIN and the MO Tax ID in hand.' },
    { id: 'E', name: 'Payroll ready', when: 'Last thing before the first payroll.', cards: [9],
      needs: ['ein', 'motaxid'], lock: 'Empeon needs the real EIN and MO Tax ID first.' },
    { id: 'F', name: 'Later: after the first $1,000 quarter', when: 'Months from now. This is not a delay.', cards: [7] },
  ];

  const applies = (s, c) => !(s.transferOnly && c.taxKind !== 'transfer');
  const steps = c => STEPS.filter(s => applies(s, c));
  const isDone = (c, id) => DONE[id](c);
  const stageOpen = (c, st) => !st.needs || st.needs.every(id => isDone(c, id));

  // 2678 approval: the approval letter is the document saved on the 2678 filing.
  const approved2678 = c => !!(((c.filings || {})['IRS-2678'] || {}).docPath);

  // The one thing to do now, or what we are waiting on and when to chase it.
  // { id, card, wait, what, why }
  function next(c, today) {
    today = today || iso(new Date());
    const n = first(c);
    const go = (id, what, why, wait) => ({ id, card: (STEPS.find(s => s.id === id) || {}).card || 11, wait: !!wait, what, why });
    const since = has(c.packetSigned) ? between(c.packetSigned, today) : 0;
    if (!DONE.packet(c)) return go('packet', 'Record the signed packet', 'Fill in the date the signed enrollment packet came back.');
    if (!DONE.split(c)) return go('split', 'Get the signed forms out of the packet', 'Use the Hub packet button, or drop the GoHighLevel PDF to split it.');
    if (c.taxKind === 'transfer' && !DONE.check(c))
      return go('check', 'Call 800-829-4933 with ' + n + ' to check for an existing EIN',
        n + ' came from another vendor and may already have one. Do this before applying.');
    if (!DONE.ein(c)) {
      let why = 'Online is issued in minutes.';
      if (since >= 7) why += ' The packet was signed ' + mdy(c.packetSigned.slice(0, 10)) + ', ' + since + ' days ago, with no EIN yet.';
      if (!c.taxKind) why += ' Transferring from another vendor? Answer the question above first.';
      return go('ein', 'Apply for ' + n + '\'s federal EIN', why);
    }
    if (!DONE.f8821(c)) return go('f8821', 'Send Form 8821', 'Quickest: fax to 855-214-7522. It lets the IRS talk to us without ' + n + ' on every call.');
    if (!DONE.f2678(c)) return go('f2678', 'Mail Form 2678 today', 'Mail only, and approval takes weeks. Payroll cannot run until it comes.');
    if (!DONE.f2643a(c)) return go('f2643a', 'Register ' + n + ' with Missouri (Form 2643A)', 'Online, signed out. Save the confirmation number.');
    if (!DONE.f2827(c)) return go('f2827', 'Send Form 2827', 'Quickest: email it to businesstaxregister@dor.mo.gov.');
    if (!DONE.motaxid(c)) {
      const sent = sentOn(c, 'MO-2643A');
      return go('motaxid', 'Waiting on Missouri for the MO Tax ID',
        sent ? 'Registered ' + mdy(sent) + '. Usually 2 to 3 business days. If nothing by ' + mdy(addDays(sent, 7)) + ', call (573) 751-5860 with the confirmation number.'
             : 'Usually 2 to 3 business days after the 2643A. If nothing after a week, call (573) 751-5860 with the confirmation number.', true);
    }
    if (!DONE.fusion(c)) return go('fusion', 'Enter both numbers in Fusion', 'Participant page, HCBS Eligibility section.');
    if (!DONE.proof(c)) return go('proof', 'Upload the proof in Fusion', 'Under EIN Tax Documents, or the auditor will not find it. A W-9 is not proof.');
    if (!DONE.empeon(c)) return go('empeon', 'Upload the tax info into Empeon', 'The EIN and MO Tax ID are both in, so this only needs doing once.');
    if (!approved2678(c)) {
      const sent = sentOn(c, 'IRS-2678');
      return go('f2678', 'Waiting on the IRS to approve the 2678',
        (sent ? 'Mailed ' + mdy(sent) + '. ' : '') + 'Approval takes weeks and payroll cannot run until it comes. Upload the approval letter on the 2678 step when it arrives.', true);
    }
    if (!DONE.des(c)) return go('des', 'All set until the first $1,000 quarter', 'Then register ' + n + ' with DES. Nothing else to do right now.', true);
    return go('des', n + '\'s tax setup is complete', 'Every step is done.', true);
  }

  // The 90-day Fusion clock, from the CDS start date. tone: idle | ok | warn | bad
  function clock(c, today) {
    today = today || iso(new Date());
    if (DONE.proof(c)) return { tone: 'ok', text: 'Fusion proof done' };
    if (!has(c.cdsStartDate)) return { tone: 'idle', text: 'Add the CDS start date to start the 90-day Fusion clock' };
    const due = addDays(c.cdsStartDate, 90), left = between(today, due);
    if (left < 0) return { tone: 'bad', due, left, text: 'Fusion proof ' + (-left) + ' day' + (left === -1 ? '' : 's') + ' overdue (due ' + mdy(due) + ')' };
    return { tone: left <= 10 ? 'bad' : left <= 30 ? 'warn' : 'ok', due, left,
      text: 'Fusion proof due ' + mdy(due) + ' · ' + left + ' day' + (left === 1 ? '' : 's') + ' left' };
  }

  // A sent date far from the signed date is usually a typed year.
  function packetFlag(c) {
    if (!has(c.packetSent) || !has(c.packetSigned)) return '';
    const gap = between(c.packetSent, c.packetSigned);
    if (gap < 0) return 'The sent date is after the signed date. Typo?';
    if (gap > 120) return 'Sent ' + mdy(c.packetSent) + ' is about ' + Math.round(gap / 30) + ' months before it was signed. Typo for ' +
      (+c.packetSent.slice(0, 4) + 1) + '?';
    return '';
  }

  root.CDSTaxStages = { STEPS, STAGES, steps, isDone, stageOpen, next, clock, packetFlag, approved2678, mdy, addDays };
})(typeof globalThis !== 'undefined' ? globalThis : this);
