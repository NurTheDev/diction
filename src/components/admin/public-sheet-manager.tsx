"use client";
import { PdfPreview } from "@/components/public/pdf-preview";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { DeleteRow } from "./delete-row";

type Item = {
  id: string;
  slug: string;
  title: { bn: string; en: string };
  subject: string;
  className: string;
  bytes: number;
  published: boolean;
};

function PdfIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export function PublicSheetManager({
  canDelete = true,
  canArchive = true,
}: {
  canDelete?: boolean;
  canArchive?: boolean;
}) {
  const locale = useLocale(),
    t = useTranslations("sheets");
  const [items, setItems] = useState<Item[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/public-sheets", { cache: "no-store" });
      if (!r.ok) throw Error();
      setItems((await r.json()).items);
      setLoaded(true);
    } catch {
      setMessage(t("loadError"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/public-sheets", {
        method: "POST",
        body: new FormData(form),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      form.reset();
      await load();
      setMessage(t("msg.draftSaved"));
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setMessage(
        code === "too_large"
          ? t("msg.tooLarge")
          : code === "invalid"
            ? t("msg.invalid")
            : t("msg.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function change(item: Item) {
    if (!confirm(item.published ? t("confirm.withdraw") : t("confirm.publish")))
      return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/admin/public-sheets/${item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published: !item.published }),
      });
      if (!r.ok) throw Error();
      await load();
      setMessage(t("msg.changeSaved"));
    } catch {
      setMessage(t("msg.changeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="psm" aria-busy={busy}>
      <header className="psm-head">
        <h1>{t("sheet.title")}</h1>
        <p>{t("sheet.steps")}</p>
      </header>

      <div className="psm-notice" role="note">
        <p>
          <strong>{t("sheet.warning")}</strong> {t("sheet.warningNote")}
        </p>
      </div>

      <form onSubmit={upload} className="psm-card">
        <h2>{t("form.newDraft")}</h2>
        <div className="psm-grid">
          <label className="psm-field psm-span-2">
            <span className="psm-label">{t("form.titleBn")}</span>
            <input name="titleBn" required minLength={2} maxLength={160} />
          </label>
          <label className="psm-field">
            <span className="psm-label">{t("form.subject")}</span>
            <input name="subject" maxLength={80} />
          </label>
          <label className="psm-field">
            <span className="psm-label">{t("form.className")}</span>
            <input name="className" maxLength={80} />
          </label>
          <label className="psm-field psm-span-2">
            <span className="psm-label">{t("form.descriptionBn")}</span>
            <textarea name="descriptionBn" maxLength={1000} />
          </label>
          <details className="psm-more psm-span-2">
            <summary>{t("form.enDetails")}</summary>
            <div className="psm-more-body">
              <label className="psm-field">
                <span className="psm-label">English title</span>
                <input name="titleEn" maxLength={160} />
              </label>
              <label className="psm-field">
                <span className="psm-label">English description</span>
                <textarea name="descriptionEn" maxLength={1000} />
              </label>
            </div>
          </details>
          <label className="psm-field psm-span-2">
            <span className="psm-label">{t("form.file")}</span>
            <input
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
            />
          </label>
        </div>
        <div className="psm-form-foot">
          <button disabled={busy} className="psm-btn psm-btn-primary">
            {busy ? t("msg.pleaseWait") : t("form.saveDraft")}
          </button>
        </div>
      </form>

      <p role="status" aria-live="polite" className="psm-status">
        {message}
      </p>

      <div className="psm-list-head">
        <h2>{t("sheet.savedHeading")}</h2>
        {loaded && <span className="psm-count">{items.length}</span>}
      </div>

      {loaded && !items.length && (
        <p className="psm-empty">{t("sheet.none")}</p>
      )}

      <div className="psm-list">
        {items.map((i) => (
          <article
            className="psm-item"
            data-state={i.published ? "published" : "draft"}
            key={i.id}>
            <div className="psm-icon">
              <PdfIcon />
            </div>

            <div className="psm-main">
              <div className="psm-main-top">
                <strong className="psm-name">{i.title.bn}</strong>
                <span
                  className="psm-badge"
                  data-state={i.published ? "published" : "draft"}>
                  {i.published
                    ? t("sheet.publishedState")
                    : t("sheet.draftState")}
                </span>
              </div>

              <ul className="psm-meta">
                {[
                  i.className,
                  i.subject,
                  `${(i.bytes / 1048576).toFixed(2)} MB`,
                ]
                  .filter(Boolean)
                  .map((m) => (
                    <li key={m}>{m}</li>
                  ))}
              </ul>

              <div className="psm-links">
                <a
                  className="psm-link"
                  href={`/api/admin/public-sheets/${i.id}/preview`}
                  target="_blank"
                  rel="noopener noreferrer">
                  {t("sheet.openPdf")}
                </a>
                {i.published && (
                  <a
                    className="psm-link"
                    href={`/${locale}/lecture-sheets/${i.slug}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    {t("sheet.viewPublic")}
                  </a>
                )}
              </div>

              <SheetPreview id={i.id} />
            </div>

            <div className="psm-actions">
              <button
                type="button"
                className="psm-btn psm-btn-ghost"
                disabled={busy}
                onClick={() => void change(i)}>
                {i.published ? t("sheet.withdraw") : t("sheet.publish")}
              </button>
              {canDelete && (
                <DeleteRow
                  kind="publicSheet"
                  id={i.id}
                  name={locale === "bn" ? i.title.bn : i.title.en || i.title.bn}
                  canArchive={canDelete}
                  onDone={load}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SheetPreview({ id }: { id: string }) {
  const locale = useLocale(),
    t = useTranslations("sheets"),
    [open, setOpen] = useState(false);
  return (
    <details
      className="psm-preview"
      onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t("sheet.previewSummary")}</summary>
      {open && (
        <div className="psm-preview-body">
          <PdfPreview
            locale={locale}
            url={`/api/admin/public-sheets/${id}/preview`}
          />
        </div>
      )}
    </details>
  );
}
