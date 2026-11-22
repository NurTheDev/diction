"use client";
/**
 * SMS centre client components (R2): the settings form, the operator's own test message, an
 * explicit retry of one batch's failures, and the template editor.
 *
 * Every one of them goes through a server action, so authorization is re-checked on the server —
 * hiding a button is presentation, never permission.
 */
import type { ActionState } from "@/actions/admin";
import {
  retryAutoSms,
  retrySmsBatch,
  saveSmsSettings,
  saveSmsTemplate,
  sendTestSmsAction,
} from "@/actions/sms";
import { formatNumber } from "@/lib/admin/format";
import type { SmsSettingsRow, SmsTemplateRow } from "@/lib/center/sms-send";
import { smsTemplateName } from "@/lib/center/sms-templates";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

/** Status text for a form that has just been answered by its action. */
function Feedback({ state }: { state: ActionState; bn?: boolean }) {
  const ts = useTranslations("sms");
  if (state.status === "idle") return null;
  const ok = state.status === "ok";
  const text =
    state.message || (ok ? ts("panel.saved") : ts("panel.failedTryAgain"));
  return (
    <p
      className="smp-feedback"
      data-state={ok ? "ok" : "error"}
      role="status"
      aria-live="polite">
      {text}
    </p>
  );
}

export function SmsSettingsForm({
  locale,
  settings,
  providerName,
  balanceOk,
  balance,
}: {
  locale: string;
  settings: SmsSettingsRow;
  providerName: string;
  balanceOk: boolean;
  balance: number | null;
}) {
  const ts = useTranslations("sms");
  const bn = locale !== "en";
  const [state, action, pending] = useActionState(saveSmsSettings, {
    status: "idle",
  } as ActionState);
  return (
    <section className="smx-sec">
      <div className="smx-sec-head">
        <h2>{ts("panel.settings")}</h2>
      </div>
      <div className="smx-sec-body">
        <form action={action} className="smp-form">
          <div className="smp-grid">
            <label className="smp-field">
              <span>{ts("panel.costPerSms")}</span>
              <input
                name="smsUnitCost"
                type="number"
                step="0.01"
                min="0"
                max="1000"
                required
                defaultValue={settings.unitCost}
              />
            </label>
            <label className="smp-field">
              <span>{ts("panel.dailySmsLimit")}</span>
              <input
                name="dailySmsLimitPerUser"
                type="number"
                min="0"
                max="10000"
                step="1"
                required
                defaultValue={settings.dailySmsLimitPerUser ?? 30}
              />
            </label>
            <label className="smp-field">
              <span>{ts("panel.quietHoursStart")}</span>
              <input
                name="quietStart"
                type="time"
                required
                defaultValue={settings.quietStart}
              />
            </label>
            <label className="smp-field">
              <span>{ts("panel.quietHoursEnd")}</span>
              <input
                name="quietEnd"
                type="time"
                required
                defaultValue={settings.quietEnd}
              />
            </label>
            <label className="smp-field">
              <span>{ts("panel.institutePhone")}</span>
              <input
                name="institutePhone"
                type="tel"
                maxLength={20}
                defaultValue={settings.institutePhone}
                placeholder="01XXXXXXXXX"
              />
            </label>
            <label className="smp-field">
              <span>{ts("panel.dueReminderDay")}</span>
              <input
                name="autoDueDay"
                type="number"
                min="1"
                max="31"
                required
                defaultValue={settings.autoDueDay}
              />
            </label>
          </div>

          <fieldset className="smp-fieldset">
            <legend>{ts("panel.autoSend")}</legend>
            <label className="smp-check">
              <input
                name="autoReceipt"
                type="checkbox"
                defaultChecked={settings.autoReceipt}
              />
              {ts("panel.autoReceipt")}
            </label>
            <label className="smp-check">
              <input
                name="autoResult"
                type="checkbox"
                defaultChecked={settings.autoResult}
              />
              {ts("panel.autoResult")}
            </label>
            <label className="smp-check">
              <input
                name="autoDue"
                type="checkbox"
                defaultChecked={settings.autoDue}
              />
              {ts("panel.autoDue")}
            </label>
            <small className="smp-note">{ts("panel.autoSendWarning")}</small>
          </fieldset>

          <p className="smx-help">
            {ts("panel.providerBalance", {
              provider: providerName,
              balance:
                balanceOk && balance !== null
                  ? formatNumber(balance, bn ? "bn" : "en")
                  : ts("panel.balanceUnreadable"),
            })}
          </p>

          <div className="smp-actions">
            <button
              type="submit"
              className="smp-btn smp-btn-primary"
              data-pending={pending}
              disabled={pending}>
              {pending ? ts("panel.saving") : ts("panel.saveSettings")}
            </button>
            <Feedback state={state} bn={bn} />
          </div>
        </form>
      </div>
    </section>
  );
}

export function SmsTestForm({
  locale,
  ownPhone,
}: {
  locale: string;
  ownPhone: string;
}) {
  const ts = useTranslations("sms");
  const bn = locale !== "en";
  const [state, action, pending] = useActionState(sendTestSmsAction, {
    status: "idle",
  } as ActionState);
  return (
    <section className="smx-sec">
      <div className="smx-sec-head">
        <h2>{ts("panel.testMessage")}</h2>
      </div>
      <div className="smx-sec-body">
        <form action={action} className="smp-inline">
          <label className="smp-field">
            <span>{ts("panel.ownNumber")}</span>
            <input
              name="phone"
              type="tel"
              required
              maxLength={20}
              defaultValue={ownPhone}
              placeholder="01XXXXXXXXX"
            />
          </label>
          <button
            type="submit"
            className="smp-btn smp-btn-primary"
            data-pending={pending}
            disabled={pending}>
            {pending ? ts("panel.sending") : ts("panel.sendTest")}
          </button>
          <Feedback state={state} bn={bn} />
        </form>
        <p className="smx-help">{ts("panel.testHint")}</p>
      </div>
    </section>
  );
}

export function SmsRetryButton({
  locale,
  batchId,
  failed,
}: {
  locale: string;
  batchId: string;
  failed: number;
}) {
  const ts = useTranslations("sms");
  const bn = locale !== "en";
  const [state, action, pending] = useActionState(retrySmsBatch, {
    status: "idle",
  } as ActionState);
  return (
    <form action={action} className="smp-inline smp-retry">
      <input type="hidden" name="batchId" value={batchId} />
      <button
        type="submit"
        className="smp-btn smp-btn-sm smp-btn-retry"
        data-pending={pending}
        disabled={pending}
        title={ts("panel.retryDuplicateWarning")}>
        {pending
          ? ts("panel.sending")
          : ts("panel.retryCount", {
              count: formatNumber(failed, bn ? "bn" : "en"),
            })}
      </button>
      {state.status !== "idle" && (
        <span
          className="smp-feedback"
          data-state={state.status === "ok" ? "ok" : "error"}>
          {state.message || (state.status === "ok" ? "✓" : "✗")}
        </span>
      )}
    </form>
  );
}

export function SmsTemplateEditor({
  locale,
  template,
}: {
  locale: string;
  template: SmsTemplateRow;
}) {
  const ts = useTranslations("sms");
  const bn = locale !== "en";
  /* A default template's name is a catalog key; an operator's own name is a sentence. */
  const templateName = (value: string): string =>
    smsTemplateName(ts.raw("templates") as Record<string, string>, value);
  const [state, action, pending] = useActionState(saveSmsTemplate, {
    status: "idle",
  } as ActionState);
  if (template.key === "custom") {
    return (
      <article className="smp-tpl smp-tpl-free">
        <h3>{templateName(template.name)}</h3>
        <p className="smx-help">{ts("panel.freeTextNote")}</p>
      </article>
    );
  }
  return (
    <article className="smp-tpl" data-active={template.active}>
      <h3>
        {templateName(template.name)}
        {template.edited && (
          <span className="smx-badge">{ts("panel.templateEdited")}</span>
        )}
      </h3>
      <form action={action}>
        <input type="hidden" name="key" value={template.key} />
        <label className="smp-field">
          <span>{ts("panel.templateName")}</span>
          <input
            name="name"
            maxLength={120}
            required
            defaultValue={templateName(template.name)}
          />
        </label>
        <label className="smp-field">
          <span>{ts("panel.messageBangla")}</span>
          <textarea
            name="body"
            maxLength={2000}
            rows={3}
            required
            defaultValue={template.body}
          />
        </label>
        <label className="smp-check">
          <input
            name="active"
            type="checkbox"
            defaultChecked={template.active}
          />
          {ts("panel.templateActive")}
        </label>
        {template.variables.length > 0 && (
          <small>
            {ts("panel.templateChips")}:{" "}
            <code>{template.variables.map((v) => `{${v}}`).join(" ")}</code>
          </small>
        )}
        {template.feeRelated && <small>{ts("panel.feeRelatedNote")}</small>}
        <div className="smp-actions">
          <button
            type="submit"
            className="smp-btn smp-btn-sm smp-btn-ghost"
            data-pending={pending}
            disabled={pending}>
            {pending ? ts("panel.saving") : ts("panel.saveTemplate")}
          </button>
          <Feedback state={state} bn={bn} />
        </div>
      </form>
    </article>
  );
}

/**
 * Retry one automatic-SMS problem (R2 follow-up). A client component for two reasons: `disabled` while
 * pending is what stops a double click from paying for the same message twice, and the answer is a
 * sentence the operator has to read — a retry that fails again must say why in their own language
 * instead of silently doing nothing.
 */
export function SmsProblemRetry({
  locale,
  problemId,
  attempts,
}: {
  locale: string;
  problemId: string;
  attempts: number;
}) {
  const ts = useTranslations("sms");
  const bn = locale !== "en";
  const [state, action, pending] = useActionState(retryAutoSms, {
    status: "idle",
  } as ActionState);
  return (
    <form action={action} className="smp-inline smp-retry">
      <input type="hidden" name="problemId" value={problemId} />
      <button
        type="submit"
        className="smp-btn smp-btn-sm smp-btn-retry"
        data-pending={pending}
        disabled={pending}
        title={ts("panel.retryCostsWarning")}>
        {pending
          ? ts("panel.sending")
          : attempts > 1
            ? ts("panel.tryAgain")
            : ts("panel.retry")}
      </button>
      {state.status !== "idle" && (
        <span
          className="smp-feedback"
          data-state={state.status === "ok" ? "ok" : "error"}>
          {state.message || (state.status === "ok" ? "✓" : "✗")}
        </span>
      )}
    </form>
  );
}
