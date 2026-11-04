// The GoHighLevel contact custom fields Samantha approved deleting from the CDS sub-account (2026-11-04, her
// "Yes, build a step that deletes the safe-to-delete group only", from the 1289 field audit). Each is matched by
// its exact name AND key, and is deleted only if it holds no more values than the audit counted (maxFilled).
// Used by the one-time ghl-field-cleanup function, which Desktop 1290 deploys, runs and then removes.
// Never a file upload or signature field: GHL's contact list cannot count those, so a zero there proves nothing.

export const APPROVED = [
  {"name": "Date Picker 35ls3", "fieldKey": "date_of_shift", "dataType": "DATE", "maxFilled": 1},
  {"name": "Multi Dropdown 11d5b", "fieldKey": "tasks_performed_tasks_completed_per_service_plans_check_all_that_apply", "dataType": "MULTIPLE_OPTIONS", "maxFilled": 1},
  {"name": "Start Time:", "fieldKey": "shift_start_time", "dataType": "TEXT", "maxFilled": 1},
  {"name": "End Time:", "fieldKey": "shift_end_time", "dataType": "TEXT", "maxFilled": 1},
  {"name": "Upload Date", "fieldKey": "date_signed", "dataType": "DATE", "maxFilled": 1},
  {"name": "Describe in detail your request for the EVV time adjustment.", "fieldKey": "reason_for_needing_an_adjustment_to_the_shift", "dataType": "LARGE_TEXT", "maxFilled": 1},
  {"name": "Client Care: How confident do you feel in meeting the needs of the clients you care for?", "fieldKey": "contact.client_care_how_confident_do_you_feel_in_meeting_the_needs_of_the_clients_you_care_for", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Communication: How would you rate the effectiveness of communication channels between you and the agency?", "fieldKey": "contact.communication_how_would_you_rate_the_effectiveness_of_communication_channels_between_you_and_the_agency", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Do you feel supported in providing quality care to clients?", "fieldKey": "contact.do_you_feel_supported_in_providing_quality_care_to_clients", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Do you have access to the necessary equipment and supplies to perform your job effectively?", "fieldKey": "contact.do_you_have_access_to_the_necessary_equipment_and_supplies_to_perform_your_job_effectively", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Overall Satisfaction: On a scale of 1 to 5, how satisfied are you with your experience as a caregiver with our agency? (1 = Not Satisfied, 5 = Very Satisfied)", "fieldKey": "contact.overall_satisfaction_on_a_scale_of_1_to_5_how_satisfied_are_you_with_your_experience_as_a_caregiver_with_our_agency_1__not_satisfied_5__very_satisfied", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Any additional comments or suggestions for improving your experience as a caregiver at our agency?", "fieldKey": "contact.any_additional_comments_or_suggestions_for_improving_your_experience_as_a_caregiver_at_our_agency", "dataType": "LARGE_TEXT", "maxFilled": 0},
  {"name": "Are You At Least 18 Years Of Age?", "fieldKey": "contact.are_you_at_least_18_years_of_age", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Does the person needing care currently have MO HealthNet (Missouri Medicaid)?", "fieldKey": "contact.does_the_person_needing_care_currently_have_mo_healthnet_missouri_medicaid", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "Do you (or the person needing care) already have someone in mind you’d like to hire as a caregiver (such as a family member or friend)?", "fieldKey": "contact.do_you_already_have_someone_you_would_like_to_hire_as_your_caregiver", "dataType": "RADIO", "maxFilled": 0},
  {"name": "Age of the person who needs care?", "fieldKey": "contact.age_of_the_person_who_needs_care", "dataType": "TEXT", "maxFilled": 0},
  {"name": "Is a family member or someone else already helping with their daily care?", "fieldKey": "contact.is_a_family_member_or_someone_else_already_helping_with_their_daily_care", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "If no, please give us more details", "fieldKey": "contact.if_no_please_give_us_more_details", "dataType": "LARGE_TEXT", "maxFilled": 0},
  {"name": "Does anyone else in your household need services - a CDS referral?", "fieldKey": "contact.does_anyone_else_in_your_household_need_services_a_cds_referral", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "Relationship", "fieldKey": "contact.relationship", "dataType": "TEXT", "maxFilled": 0},
  {"name": "Non-Resident Alien", "fieldKey": "contact.nonresident_alien", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "B-015-ES. Email Subscription Preferences", "fieldKey": "contact.b015es_email_subscription_preferences", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "B-015-ES. Unsubscribe from all email?", "fieldKey": "contact.b015es_unsubscribe_from_all_email", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "B-018-COI. SMS Optin", "fieldKey": "contact.b018coi_sms_optin", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "📌 CDS Program Compliance - ADMIN", "fieldKey": "contact._cds_program_compliance__admin", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "📌 CDS Program Compliance - Attendants", "fieldKey": "contact._cds_program_compliance__attendants", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "📌 CDS Program Compliance - Consumers", "fieldKey": "contact._cds_program_compliance__consumers", "dataType": "CHECKBOX", "maxFilled": 0},
  {"name": "Consumer's State EIN:", "fieldKey": "contact.consumers_state_ein", "dataType": "TEXT", "maxFilled": 0},
  {"name": "SUTA Number:", "fieldKey": "contact.suta_number", "dataType": "TEXT", "maxFilled": 0},
  {"name": "The following documents are acceptable for verification of the assignment of a Federal EIN:", "fieldKey": "contact.the_following_documents_are_acceptable_for_verification_of_the_assignment_of_a_federal_ein", "dataType": "SINGLE_OPTIONS", "maxFilled": 0},
  {"name": "The following documents are acceptable for verification of the assignment of a Missouri EIN/TIN: ", "fieldKey": "contact.the_following_documents_are_acceptable_for_verification_of_the_assignment_of_a_missouri_eintin", "dataType": "SINGLE_OPTIONS", "maxFilled": 0},
  {"name": "Consumer's Address", "fieldKey": "contact.consumers_address", "dataType": "TEXT", "maxFilled": 5}
];

const NEVER = new Set(['FILE_UPLOAD', 'SIGNATURE']);

// fields: the location's contact custom fields. filled: { [fieldId]: count } across every contact.
// -> one row per approved field: { name, id, filled, maxFilled, ok, why }
export function plan(fields, filled) {
  return APPROVED.map(a => {
    const hits = (fields || []).filter(f => f && f.name === a.name && f.fieldKey === a.fieldKey);
    const row = { name: a.name, id: null, filled: null, maxFilled: a.maxFilled, ok: false, why: '' };
    if (!hits.length) return { ...row, why: 'already gone' };
    if (hits.length > 1) return { ...row, why: 'more than one field matches, left alone' };
    const f = hits[0];
    row.id = f.id; row.filled = (filled || {})[f.id] || 0;
    if (NEVER.has(f.dataType) || f.dataType !== a.dataType) return { ...row, why: 'type is ' + f.dataType + ', left alone' };
    if (row.filled > a.maxFilled) return { ...row, why: row.filled + ' contacts have it filled now (audit said ' + a.maxFilled + '), left alone' };
    return { ...row, ok: true };
  });
}
