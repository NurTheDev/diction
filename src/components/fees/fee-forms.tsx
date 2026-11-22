"use client";
import type { ActionState } from "@/actions/admin";
import {
  createFeeInvoice,
  recordFeePayment,
  voidFeeInvoice,
  voidFeePayment,
} from "@/actions/fees";
import { BanglaDate } from "@/components/admin/bangla-date";
import { StudentSearchPicker } from "@/components/admin/student-search-picker";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

const initial: ActionState = { status: "idle" };

/** One idempotency key per attempt: a double-click or a retry can never create the invoice twice. */
function useKey(state: ActionState) {
  const [key, setKey] = useState("");
  useEffect(() => {
    if (globalThis.crypto?.randomUUID) setKey(globalThis.crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (state.status === "ok" && globalThis.crypto?.randomUUID)
      setKey(globalThis.crypto.randomUUID());
  }, [state]);
  return key;
}

function Feedback({ state }: { state: ActionState }) {
  const t = useTranslations("fees");
  return state.status === "idle" ? null : (
    <p
      role="status"
      className="fee-feedback"
      data-state={state.status === "ok" ? "ok" : "error"}>
      {t(
        state.status === "ok"
          ? "saved"
          : state.status === "conflict"
            ? "conflict"
            : "error",
      )}
    </p>
  );
}

export function FeeInvoiceForm({
  students,
}: {
  students: { id: string; name: string }[];
}) {
  const t = useTranslations("fees");
  const [state, action, pending] = useActionState(createFeeInvoice, initial);
  const key = useKey(state);
  return (
    <form className="admin-edit fee-form" action={action}>
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="admin-slot-grid">
        <label>
          {t("student")}
          <StudentSearchPicker name="student" items={students} />
        </label>
        <label>
          {t("titleBn")}
          <input
            className="admin-input"
            name="titleBn"
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          {t("titleEn")}
          <input
            className="admin-input"
            name="titleEn"
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          {t("amountInput")}
          <input
            className="admin-input"
            name="amount"
            inputMode="decimal"
            maxLength={20}
            required
            aria-describedby="invoice-amount-help"
          />
        </label>
        <label>
          {t("dueDate")}
          <BanglaDate name="dueDate" required />
        </label>
      </div>
      <small id="invoice-amount-help" className="fee-help">
        {t("amountHelp")} {t("retryHelp")}
      </small>
      <div className="fee-form-actions">
        <button
          className="fee-btn"
          disabled={!key || pending || !students.length}>
          {pending ? t("saving") : t("create")}
        </button>
        <Feedback state={state} />
      </div>
      {!key && (
        <p role="status" className="fee-help">
          {t("javascript")}
        </p>
      )}
    </form>
  );
}

export function FeePaymentForm({
  invoice,
  today,
}: {
  invoice: string;
  today: string;
}) {
  const t = useTranslations("fees");
  const [state, action, pending] = useActionState(recordFeePayment, initial);
  const key = useKey(state);
  return (
    <form className="admin-edit fee-form" action={action}>
      <input type="hidden" name="invoice" value={invoice} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="admin-slot-grid">
        <label>
          {t("amountInput")}
          <input
            className="admin-input"
            name="amount"
            inputMode="decimal"
            maxLength={20}
            required
            aria-describedby="payment-amount-help"
          />
        </label>
        <label>
          {t("paidDate")}
          <BanglaDate name="paidDate" defaultValue={today} required />
        </label>
        <label>
          {t("method")}
          <select className="admin-select" name="method" defaultValue="cash">
            <option value="cash">{t("cash")}</option>
            <option value="bank">{t("bank")}</option>
            <option value="mobile">{t("mobile")}</option>
            <option value="other">{t("other")}</option>
          </select>
        </label>
        <label>
          {t("reference")}
          <input className="admin-input" name="reference" maxLength={120} />
        </label>
      </div>
      <small id="payment-amount-help" className="fee-help">
        {t("paymentHelp")} {t("amountHelp")} {t("retryHelp")}
      </small>
      <div className="fee-form-actions">
        <button className="fee-btn" disabled={!key || pending}>
          {pending ? t("saving") : t("record")}
        </button>
        <Feedback state={state} />
      </div>
      {!key && (
        <p role="status" className="fee-help">
          {t("javascript")}
        </p>
      )}
    </form>
  );
}

export function FeeVoidForm({
  id,
  kind,
}: {
  id: string;
  kind: "invoice" | "payment";
}) {
  const t = useTranslations("fees");
  const [state, action, pending] = useActionState(
    kind === "invoice" ? voidFeeInvoice : voidFeePayment,
    initial,
  );
  return (
    <details className="fee-void">
      <summary className="fee-void-summary">
        {t(kind === "invoice" ? "voidInvoice" : "voidPayment")}
      </summary>
      <form
        className="admin-edit fee-void-form"
        action={action}
        onSubmit={(e) => {
          if (
            !window.confirm(
              t(
                kind === "invoice"
                  ? "confirmVoidInvoice"
                  : "confirmVoidPayment",
              ),
            )
          )
            e.preventDefault();
        }}>
        <input type="hidden" name="id" value={id} />
        <label>
          {t("reason")}
          <textarea
            className="admin-textarea"
            name="reason"
            minLength={5}
            maxLength={300}
            required
          />
        </label>
        <div className="fee-form-actions">
          <button className="fee-btn fee-btn-danger" disabled={pending}>
            {pending ? t("saving") : t("confirmVoid")}
          </button>
          <Feedback state={state} />
        </div>
      </form>
    </details>
  );
}
