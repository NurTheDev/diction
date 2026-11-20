"use client";

import {
  createDueSnapshot,
  type SnapshotState,
} from "@/actions/center-due-snapshot";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

const initial: SnapshotState = { status: "idle" };

export function DueSnapshotForm({
  classId,
  enabled,
}: {
  classId: string;
  enabled: boolean;
}) {
  const t = useTranslations("dues");
  const [id, setId] = useState("");
  const [state, action, pending] = useActionState(createDueSnapshot, initial);

  useEffect(() => {
    setId(crypto.randomUUID());
  }, []);

  return (
    <details className="dsf">
      <summary className="dsf-summary">{t("save.title")}</summary>

      <div className="dsf-body">
        <p className="dsf-note">{t("save.confirmNote")}</p>

        {!enabled && (
          <p className="dsf-alert" role="note">
            {t("save.disabledNote")}
          </p>
        )}

        <form className="dsf-form" action={action}>
          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="requestId" value={id} />

          <label className="dsf-check">
            <input type="checkbox" name="confirm" value="YES" required />
            <span>{t("save.confirmLabel")}</span>
          </label>

          <div className="dsf-actions">
            <button
              type="submit"
              className="dsf-btn"
              data-pending={pending ? "" : undefined}
              disabled={!enabled || !id || pending || state.status === "ok"}>
              {t("save.saveButton")}
            </button>

            {state.status === "ok" && (
              <p className="dsf-msg dsf-msg-ok" role="status">
                {t("save.saved")}
              </p>
            )}

            {state.status === "error" && (
              <p className="dsf-msg dsf-msg-error" role="alert">
                {t("save.failedPrefix")}
                {state.message}
              </p>
            )}
          </div>
        </form>
      </div>
    </details>
  );
}
