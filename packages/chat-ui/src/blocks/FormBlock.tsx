import type { FormField, LeadCaptureFormBlock, SiteVisitFormBlock } from "@property-assistant/contracts";
import { useId, useState } from "react";
import { Notice } from "../components/Notice.js";
import { Icon } from "../icons/Icon.js";
import type { BlockActions } from "./types.js";

/**
 * Renders lead-capture and site-visit form definitions. Submission is not
 * implemented on the server yet (`submission.mode === "disabled"`), so the
 * submit button stays disabled and the notice explains why.
 */
function Field({ field, idPrefix }: { field: FormField; idPrefix: string }) {
    const id = `${idPrefix}-${field.name}`;
    const common = {
        id,
        name: field.name,
        required: field.required,
        placeholder: field.placeholder ?? undefined,
        maxLength: field.maxLength ?? undefined,
    };
    if (field.input === "checkbox") {
        return (
            <label className="rec-field rec-field--inline" htmlFor={id}>
                <input type="checkbox" id={id} name={field.name} />
                <span>{field.label}</span>
            </label>
        );
    }
    return (
        <label className="rec-field" htmlFor={id}>
            <span>
                {field.label}
                {field.required && <span aria-hidden="true"> *</span>}
            </span>
            {field.input === "textarea" ? (
                <textarea rows={3} {...common} />
            ) : field.input === "select" ? (
                <select id={id} name={field.name} required={field.required} defaultValue="">
                    <option value="" disabled>
                        Select…
                    </option>
                    {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input type={field.input} {...common} />
            )}
        </label>
    );
}

export function FormBlock({ block, actions }: { block: LeadCaptureFormBlock | SiteVisitFormBlock; actions: BlockActions }) {
    // With the step-by-step panel, the reply shows a small card that opens it.
    if (actions.openForm) {
        const sent = actions.formSent?.(block) ?? false;
        const cancelled = actions.formCancelled?.(block) ?? false;
        const open = actions.openForm;
        return (
            <section className="rec-block rec-form-card">
                <span className="rec-form-card__icon" aria-hidden="true">
                    <Icon name={block.type === "site_visit_form" ? "calendar" : "user"} size={15} />
                </span>
                <div className="rec-form-card__text">
                    <strong>{block.data.title}</strong>
                    <span className="rec-muted rec-small">
                        {sent ? "Request sent" : cancelled ? "Closed before sending" : (block.data.description ?? "A few quick details")}
                    </span>
                </div>
                {sent ? (
                    <span className="rec-form-card__done">
                        <Icon name="check" size={14} /> Sent
                    </span>
                ) : cancelled ? (
                    <span className="rec-form-card__incomplete">
                        <Icon name="alert" size={13} /> Not sent
                    </span>
                ) : (
                    <button type="button" className="rec-button rec-button--ghost rec-button--small" onClick={() => open(block)}>
                        Fill in
                    </button>
                )}
            </section>
        );
    }
    return <InlineForm block={block} />;
}

/** The whole form in the reply, for hosts without the step-by-step panel. */
function InlineForm({ block }: { block: LeadCaptureFormBlock | SiteVisitFormBlock }) {
    const idPrefix = useId();
    const [tried, setTried] = useState(false);
    const { title, description, fields, submitLabel, consentText, submission } = block.data;
    const disabled = submission.mode === "disabled";

    return (
        <section className="rec-block">
            <form
                className="rec-form"
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    setTried(true);
                }}
            >
                <header className="rec-block__header">
                    <h3>{title}</h3>
                </header>
                {description && <p className="rec-muted rec-small">{description}</p>}
                {fields.map((field) => (
                    <Field key={field.name} field={field} idPrefix={idPrefix} />
                ))}
                {consentText && <p className="rec-small rec-muted">{consentText}</p>}
                <button type="submit" className="rec-button rec-button--primary" disabled={disabled}>
                    {submitLabel}
                </button>
                {(disabled || tried) && submission.mode === "disabled" && <Notice>{submission.notice}</Notice>}
            </form>
        </section>
    );
}
