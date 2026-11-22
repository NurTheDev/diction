"use client";
import type { ActionState } from "@/actions/admin";
import { deleteMedia } from "@/actions/media";
import { restoreBinItem } from "@/actions/recycle";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { ConfirmSubmit } from "./confirm-submit";
import { showRecycleToast } from "./recycle-toast-host";

export function MediaUpload() {
  const t = useTranslations("cms");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size > 4 * 1024 * 1024) {
      setFeedback("uploadError");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/media", {
          method: "POST",
          body: data,
        });
        if (!res.ok) throw new Error("failed");
        form.reset();
        setFeedback("uploadSuccess");
        router.refresh();
      } catch {
        setFeedback("uploadError");
      }
    });
  }

  return (
    <form method="post" onSubmit={submit} className="mdl-upload">
      <p className="mdl-help">{t("uploadHelp")}</p>
      <input
        className="mdl-file"
        name="file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        required
      />
      <div className="mdl-upload-foot">
        <button className="mdl-btn mdl-btn-primary" disabled={pending}>
          {pending ? t("uploading") : t("upload")}
        </button>
        {feedback && (
          <p
            role="status"
            className="mdl-feedback"
            data-tone={feedback === "uploadError" ? "error" : "ok"}>
            {t(feedback)}
          </p>
        )}
      </div>
    </form>
  );
}

export function MediaActions({ id, url }: { id: string; url: string }) {
  const t = useTranslations("cms");
  const w = useTranslations("adminWork");
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteMedia, {
    status: "idle",
  } as ActionState);
  const [copied, setCopied] = useState("");
  const seen = useRef("idle");

  // The card soft-deletes through the shared engine, so it owes the operator the same 10-second
  // Undo as every other row. The toast lives on the layout host, so it survives the card leaving.
  async function undo() {
    const data = new FormData();
    data.set("kind", "media");
    data.set("id", id);
    const result = await restoreBinItem(
      { status: "idle" } as ActionState,
      data,
    );
    showRecycleToast({
      state: result,
      success: w("restoredBin"),
      error: w("deleteFailed"),
    });
    router.refresh();
  }

  useEffect(() => {
    const prev = seen.current;
    if (prev === state.status) return;
    seen.current = state.status;
    if (prev !== "idle") return;
    if (state.status === "ok")
      showRecycleToast({
        state,
        success: w("movedBin"),
        error: w("deleteFailed"),
        actions: [{ label: w("undoDelete"), run: () => void undo() }],
      });
    else if (state.status === "conflict")
      showRecycleToast({
        state,
        success: w("movedBin"),
        error: w("deleteFailed"),
        conflict: t("mediaInUse"),
      });
    else if (state.status === "error")
      showRecycleToast({
        state,
        success: w("movedBin"),
        error: w("deleteFailed"),
      });
  }, [state]);

  return (
    <div className="mdl-actions">
      <div className="mdl-actions-row">
        <button
          type="button"
          className="mdl-btn mdl-btn-ghost"
          data-state={copied || undefined}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied("copied");
            } catch {
              setCopied("copyError");
            }
          }}>
          {copied ? t(copied) : t("copyUrl")}
        </button>
        <form action={action} className="mdl-del">
          <input type="hidden" name="id" value={id} />
          <ConfirmSubmit
            label={t("delete")}
            disabled={pending}
            itemName={url.split("/").pop()}
          />
        </form>
      </div>
    </div>
  );
}
