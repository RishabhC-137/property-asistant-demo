import type { FormField, FormSubmission, LeadCaptureFormBlock, PropertyCard, SiteVisitFormBlock } from "@property-assistant/contracts";

const field = (f: Partial<FormField> & Pick<FormField, "name" | "label" | "input" | "required">): FormField => ({
    placeholder: null,
    maxLength: null,
    options: null,
    ...f,
});

const CONTACT_FIELDS: FormField[] = [
    field({ name: "name", label: "Full name", input: "text", required: true, maxLength: 100 }),
    field({ name: "phone", label: "Mobile number", input: "tel", required: true, maxLength: 20 }),
    field({ name: "email", label: "Email", input: "email", required: true, maxLength: 254 }),
];

export const SUBMISSION_DISABLED: FormSubmission = {
    mode: "disabled",
    notice: "Submitting is not available yet. Your details will not be sent anywhere.",
};

/** Sent to the API and confirmed with a code sent to the phone. */
export const SUBMISSION_API: FormSubmission = { mode: "api", verification: "phone_otp" };

const CONSENT = "By submitting, you agree to be contacted about this enquiry.";
const DEMO_CONSENT = `${CONSENT} (Demo form — nothing is submitted.)`;

/** A form set up to be sent as `submission` says, with consent wording to match. */
export function withSubmission<T extends LeadCaptureFormBlock | SiteVisitFormBlock>(form: T, submission: FormSubmission): T {
    return { ...form, data: { ...form.data, submission, consentText: submission.mode === "api" ? CONSENT : DEMO_CONSENT } };
}

/** Replaces the fallback project-name input with verified projects the visitor can choose from. */
export function withProjectOptions(
    form: SiteVisitFormBlock,
    projects: readonly Pick<PropertyCard, "id" | "name" | "image" | "photos" | "location" | "status">[],
    recommendedIds: ReadonlySet<string> = new Set(),
): SiteVisitFormBlock {
    const options = projects.slice(0, 100).map((project) => ({
        value: project.id,
        label: project.name,
        image: project.image?.url ?? project.photos[0]?.url ?? null,
        detail: [project.location.localityName, project.location.city, project.status].filter(Boolean).join(" · ") || null,
        recommended: recommendedIds.has(project.id),
    }));
    if (options.length === 0) return form;
    return {
        ...form,
        data: {
            ...form.data,
            fields: form.data.fields.map((current) =>
                current.name === "projectName"
                    ? field({ name: "projectId", label: "Choose up to 3 projects", input: "select", required: true, options })
                    : current,
            ),
        },
    };
}

/** Form definitions shared by the providers. Submission is disabled here; see `withSubmission`. */
export const LEAD_FORM: LeadCaptureFormBlock = {
    type: "lead_capture_form",
    data: {
        formId: "lead_capture",
        title: "Request a callback",
        description: "Share your details and an advisor can call you back.",
        fields: [
            ...CONTACT_FIELDS,
            field({ name: "message", label: "Message", input: "textarea", required: false, maxLength: 1000 }),
        ],
        submitLabel: "Request callback",
        consentText: DEMO_CONSENT,
        submission: SUBMISSION_DISABLED,
        projectId: null,
        requestType: "callback",
    },
};

export const SITE_VISIT_FORM: SiteVisitFormBlock = {
    type: "site_visit_form",
    data: {
        formId: "site_visit",
        title: "Request a site visit",
        description: "Choose a preferred date and time. A request is not a confirmed visit.",
        fields: [
            field({
                name: "visitType",
                label: "What would you like to book?",
                input: "select",
                required: true,
                options: [
                    { value: "site_visit", label: "Book Free Site Visit" },
                    { value: "online_presentation", label: "Online Presentation" },
                ],
            }),
            // This order mirrors the Property Desk booking form: first choose
            // the appointment details, then give contact details, then verify.
            // Replaced with a selectable project list whenever the provider has verified project cards.
            // It remains a safe fallback for a host that opens this template without any project context.
            field({ name: "projectName", label: "Which project are you interested in?", input: "text", required: true, maxLength: 160 }),
            field({ name: "visitDate", label: "Preferred date", input: "date", required: true }),
            field({ name: "visitTime", label: "Preferred time", input: "time", required: true }),
            field({
                name: "transportMode",
                label: "Transport for your site visit",
                input: "select",
                required: true,
                options: [
                    { value: "cab", label: "Free pickup and drop" },
                    { value: "not-required", label: "I will arrange my own transport" },
                ],
                visibleWhen: { field: "visitType", equals: "site_visit" },
            }),
            field({
                name: "meetingPlatform",
                label: "Online presentation platform",
                input: "select",
                required: true,
                options: [
                    { value: "google-meet", label: "Google Meet" },
                    { value: "teams", label: "Microsoft Teams" },
                    { value: "zoom", label: "Zoom" },
                ],
                visibleWhen: { field: "visitType", equals: "online_presentation" },
            }),
            ...CONTACT_FIELDS,
            field({ name: "message", label: "Message", input: "textarea", required: false, maxLength: 1000 }),
        ],
        submitLabel: "Request visit",
        consentText: DEMO_CONSENT,
        submission: SUBMISSION_DISABLED,
        projectIds: [],
        earliestDate: null,
    },
};
