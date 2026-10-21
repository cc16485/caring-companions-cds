// The documents an attendant signs in the CDS attendant packet (2026-10-21).
// Wording comes from Samantha's GoHighLevel packet as reviewed in the preview
// (claude.ai/artifact/KSUq7fbBKJYXuygFZC4N9t, versions 1 to 10) with her fixes:
// findcdscaregivers.com, "$15 to $16 an hour, paid every Thursday", WellSky app or
// the consumer's home phone, one company name. Changing ANY word means a new
// VERSION: the server fingerprints the text and every signature keeps the version
// and fingerprint it was signed against. No em dashes (her rule).

export const COMPANY = 'Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care';
export const HANDBOOK_URL = 'https://www.caringcds.com/handbook/';
export const ORIENTATION_URL = 'https://www.caringcds.com/attendant-orientation/';

// step 1 = signed right after the application, step 2 = after checks are clear.
// initials: the contract needs the attendant's initials after each numbered part.
export const FORMS = {
  application: { step: 1, version: '2026-10-21', title: 'CDS Attendant Application', initials: false, doc: [
   {
    "h": "Applicant statement"
   },
   {
    "p": "I certify that all information I have provided is true, complete and correct. I understand that any information I provided that is found to be false, incomplete or misrepresented in any respect will be enough to cancel further consideration of this application, or to discharge me immediately from the employer's service, whenever it is discovered."
   },
   {
    "p": "I expressly authorize, without reservation, the employer/CDS vendor, its representatives, employees or agents to contact and obtain information from all references (personal and professional), employers, public agencies, licensing authorities and educational institutions, and to otherwise verify the accuracy of all information I provided in this application. I waive any and all rights and claims I may have regarding the employer/CDS vendor, its agents, employees or representatives for seeking, gathering and using such information in the employment process, and against all other persons, corporations or organizations for furnishing such information."
   },
   {
    "p": "I understand that the employer/CDS vendor does not unlawfully discriminate in employment, and no question on this application is used to limit or excuse any applicant from consideration for employment on a basis prohibited by local, state or federal law. Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care is an Equal Opportunity Employer/Vendor and Drug-Free Workplace."
   },
   {
    "p": "I understand that this application remains current for only 60 days. After that, if I have not heard from the employer/CDS vendor and still wish to be considered, I will need to fill out a new application. This application is not an agreement or contract for employment."
   },
   {
    "p": "I understand that this employer is required to run state and federal background checks and that my potential employment depends on the results. I also understand that if I am hired, this company/CDS vendor participates in E-Verify, and I will be required to provide photo proof of identity and legal authority to work in the United States, and to complete an I-9 form."
   },
   {
    "p": "I understand that Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care is not my employer. It is a third-party vendor acting on behalf of the CDS consumer. The CDS consumer decides who to offer employment to."
   },
   {
    "p": "All qualified applicants are considered without regard to race, color, gender (sex), religion, veteran status, disability, age, sexual orientation, national origin, ancestry, or any other classification protected by law."
   }
  ] },
  background:  { step: 1, version: '2026-10-21', title: 'Background Screening Authorization', initials: false, doc: [
   {
    "h": "Background screening policy"
   },
   {
    "p": "State rules require that every attendant is screened and passes specific state and federal background checks before employment. I understand that as part of my consideration for employment, Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care may obtain a background check that includes, but is not limited to, employment and reference and education verifications, Social Security verification, criminal and civil history, consumer reports that include nationwide background screenings, personal interviews, DMV records, any other public records, and any other information bearing on my character, general reputation, personal characteristics and trustworthiness."
   },
   {
    "p": "I have told the company every name I have used in the past, including maiden names and aliases. Any offer of employment depends on clear results of a thorough background check under federal and state rules for the healthcare industry. An applicant found guilty of, regardless of adjudication, or who entered a plea of nolo contendere to, a prohibited offense is not eligible for employment."
   },
   {
    "p": "If I have not already registered with the Missouri Family Care Safety Registry or the Health Care Worker Registry, I am required to register as a condition of employment. I authorize Caring Companions staff to register me with the right state registries, and I understand there may be a one-time lifetime registration fee. If I have lived outside Missouri during the past 5 years, Caring Companions will run a nationwide background screening."
   },
   {
    "p": "I understand that if I am offered employment, background checks will also be done at times during employment, as required by the healthcare industry and state law."
   },
   {
    "p": "I have read and understand this policy, and I authorize the company to obtain and rely on the information in these screenings, reports, references and verifications in considering me for employment."
   }
  ] },
  contract:    { step: 2, version: '2026-10-21', title: 'Attendant Care Contract', initials: true, countersign: true, doc: [
   {
    "h": "1. Definitions"
   },
   {
    "p": "a) Consumer. The person who needs attendant care in their home. The Consumer is your employer and is responsible for directing, managing, scheduling (within their authorized hours) and supervising you. The Consumer, through the fiscal intermediary, pays you for the services authorized in the Consumer's Plan of Care and by this Contract."
   },
   {
    "p": "b) Attendant. You, the person who agrees to provide attendant care services to the Consumer."
   },
   {
    "p": "c) Consumer-Directed Services (CDS). Services the Consumer needs in their home to live independently, such as help with eating, dressing, meal preparation, toileting, bathing, grooming, transferring, housekeeping and specific health maintenance tasks, plus tasks for the Consumer's health and safety like grocery shopping and laundry. The services you perform are described and authorized in the Consumer's Plan of Care. Your employer will tell you which services are authorized."
   },
   {
    "p": "d) Caring Companions. Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care, the agency signing this Contract. Caring Companions is a vendor of Consumer Directed Services, enrolled as an Organized Health Care Delivery System with the Department of Health and Senior Services, Division of Senior and Disability Services. It provides administrative support to the Consumer and may contract with payroll service companies for fiscal intermediary services."
   },
   {
    "p": "e) Fiscal intermediary. A payroll service company under contract with Caring Companions. It calculates your pay, makes direct deposits or payroll checks, withholds and pays state and federal income taxes, Social Security (FICA) and Medicare, and makes unemployment and workers' compensation payments as the law requires. It gives you secure access to your payroll documents, provides year-end tax forms such as W-2s on time, and keeps the official records of the Consumer and Attendant employment relationship."
   },
   {
    "h": "2. Purpose"
   },
   {
    "p": "This Contract lets the Consumer interview, hire, direct, manage, schedule, supervise and discharge their Attendant. Caring Companions is authorized by the Missouri Department of Health and Senior Services to provide administrative support and case management for consumer-directed services, and may contract with payroll service companies to act as fiscal intermediary. The Consumer employs you to work in their home, under their direction and supervision, to provide the care described in their Plan of Care. You must clock in and out in the Consumer's home, using the WellSky app or the Consumer's home phone, and you can only be clocked in for one person at a time. You are an employee of the Consumer, not an independent contractor, so the Consumer, through the fiscal intermediary, withholds and pays the taxes and other payments the law requires."
   },
   {
    "h": "3. Pay"
   },
   {
    "p": "You agree to perform the services described and authorized in the Consumer's Plan of Care at an hourly rate of $15.00 to $16.00 an hour, which may be increased from time to time. You are paid through the fiscal intermediary only for services described and authorized in the Consumer's Plan of Care for that month. Medicaid funds the fiscal intermediary to pay you, on behalf of the Consumer, for authorized care you actually performed."
   },
   {
    "h": "4. How you are paid"
   },
   {
    "p": "Caring Companions gives the Consumer documents authorizing payment for the services in the Plan of Care, including the maximum hours for a set time period. Caring Companions also shows both the Consumer and you how to clock in and out with WellSky, using the app or the Consumer's home phone. You are paid every Thursday, based on your WellSky clock-in and clock-out records. You and the Consumer must record hours accurately. Falsifying or misrepresenting any clock-in or clock-out is fraud. Payments made because of inaccurate or false records will be recovered from you and/or the Consumer as the law allows, and apparent fraud will be reported to Medicaid and/or other authorities."
   },
   {
    "h": "5. Conditions"
   },
   {
    "p": "You understand an investigation may be done to determine if fraud has occurred in the CDS program, and you agree to help with any such investigation. Because Medicaid funds are used to pay you, the Missouri Department of Social Services, the U.S. Department of Health and Human Services and their designees may inspect the services provided."
   },
   {
    "p": "You are not an employee of Caring Companions and will not say that you are. You are employed only by the Consumer."
   },
   {
    "p": "Depending on a background check or your application, you may not be eligible to provide services and be paid under CDS until you obtain a Good Cause Waiver. You will not receive wages through Caring Companions or a fiscal intermediary until you are eligible, and you will not hold Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care or a fiscal intermediary responsible for wages for services before you met the CDS pre-employment requirements."
   },
   {
    "h": "6. Injury or illness at work"
   },
   {
    "p": "You and/or the Consumer are solely responsible for any injury or illness you have while providing services, and neither Caring Companions nor the State of Missouri is liable for it."
   },
   {
    "h": "7. Mandated reporter"
   },
   {
    "p": "You are required by law to report suspected abuse, neglect or exploitation, as set out in Sections 660.00, 565.188, 208.912, 208.915 and 198.070 RSMo, to the Missouri Senior and Disabilities Hotline at 1-800-392-0210."
   },
   {
    "h": "8. Direction and supervision"
   },
   {
    "p": "You perform the services in the Consumer's Plan of Care under the Consumer's direction and supervision, on dates and times you and the Consumer agree, but billed time can never be more than the authorized hours."
   },
   {
    "h": "9. Ending the job"
   },
   {
    "p": "You are an at-will employee of the Consumer. You can resign at any time, and the Consumer can let you go at any time for no reason or any lawful reason, unless you both agree in writing to something else. This Contract ends when your job with the Consumer ends. You or the Consumer must tell Caring Companions when it ends."
   },
   {
    "h": "10. Confidentiality"
   },
   {
    "p": "The Consumer's personal and health information is confidential. You will protect it under HIPAA and any other applicable laws, and never discuss or share it without legal authorization. This lasts after the Contract ends."
   },
   {
    "h": "11. Hospital stays"
   },
   {
    "p": "If you provide services while the Consumer is in the hospital, the Consumer alone is responsible for paying you, and those services cannot be paid through Caring Companions or a fiscal intermediary. If you are paid for that time through Caring Companions or a fiscal intermediary, Caring Companions will recover the full amount as the law allows, and you and the Consumer will be referred to the Missouri Division of Senior and Disability Services hotline and/or the Attorney General for an investigation of record falsification."
   },
   {
    "h": "12. Other terms"
   },
   {
    "p": "This Contract is governed by Missouri law. The place of contract is the county where Caring Companions has its principal office."
   },
   {
    "h": "13. Later background screenings"
   },
   {
    "p": "State law requires a background screening for every new attendant, and another one when you ask to work for an additional consumer. Depending on the results or your application, you may not be eligible to provide services and be paid under CDS until you obtain a Good Cause Waiver. If any part of this Contract cannot be enforced, the rest still applies, and each part is enforced as fully as the law allows. Headings are for convenience only. This Contract can only be changed in writing, signed and dated by everyone."
   }
  ] },
  pay:         { step: 2, version: '2026-10-21', title: 'Attendant Pay Rate Information', initials: false, doc: [
   {
    "h": "Attendant Pay Rate Information"
   },
   {
    "p": "Reason: Initial setup."
   },
   {
    "p": "Attendant: {attendant}. Consumer: {consumer}."
   },
   {
    "p": "Your pay is $15 to $16 an hour, paid every Thursday."
   },
   {
    "p": "Pay rates may change when Missouri's minimum wage changes. If your rate changes, you will sign a new pay rate form."
   },
   {
    "p": "By signing, I agree to the yearly wage changes required by Missouri, and I agree that my Consumer and I have gone over this form and agree to it."
   }
  ] },
  units:       { step: 2, version: '2026-10-21', title: 'Unit Utilization and Payroll Agreement', initials: false, doc: [
   {
    "h": "Unit Utilization and Payroll Agreement"
   },
   {
    "p": "Each consumer is approved by the Department of Health and Senior Services for a number of units each month. We turn those units into hours and minutes for you and your consumer. Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care pays up to that amount each month, only for time you clocked in for properly and honestly."
   },
   {
    "p": "You can work at most 40 hours a week for one consumer, even if their plan of care allows more."
   },
   {
    "p": "Time clocked over the allowed units is not paid. As a courtesy we try to fix accidental overages, but we are not responsible for overages, including forgetting to clock out. If you make a clock-in or clock-out mistake, contact the office. You and your consumer are responsible for watching your clock-ins."
   },
   {
    "p": "If an overage is not fixed, it may be paid, which uses up units before the end of the month, and then you will not be paid for the rest of that month. Time over 40 hours a week, or when no units are left, is not paid."
   },
   {
    "p": "I understand it is my job to watch my times and remember to clock out. If I forget to clock out, I must contact Caring Companions and complete the EVV correction form. I will not be paid for more than the monthly units in the Plan of Care."
   }
  ] },
  handbook:    { step: 2, version: '2026-10-21', title: 'Attendant Handbook acknowledgment', initials: false, doc: [
   {
    "h": "Attendant Handbook acknowledgment"
   },
   {
    "p": "I received the Caring Companions In-Home Senior Care CDS Attendant Handbook at caringcds.com/handbook. I have read it, and I will follow it while I work as a CDS attendant. I know I can go back to it any time I have a question, and that I can call (417) 218-2888 with anything it does not answer."
   }
  ] },
};
export const STEP1 = ['application', 'background'];
export const STEP2 = ['contract', 'pay', 'units', 'handbook'];
// The numbered parts of the contract, each initialed.
export const CONTRACT_PARTS = FORMS.contract.doc.filter(b => b.h && /^\d+\./.test(b.h)).map(b => b.h.split('.')[0]);

// The text a signature is made against: the document with names filled in.
export function formText(key, vars = {}) {
  const f = FORMS[key];
  if (!f) return null;
  return f.doc.map(b => (b.h ? '## ' + b.h : b.p)).join('\n').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}
