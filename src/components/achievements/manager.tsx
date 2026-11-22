"use client";
import { DeleteRow } from "@/components/admin/delete-row";
import type { AdditionalCard, StoredCard } from "@/schemas/achievement-record";
import { Award, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

export type EditableDraft = {
  id: string;
  version: number;
  card: StoredCard;
  additional: AdditionalCard;
  photo: string;
  processingReference: string;
};

type Item = {
  id: string;
  slug: string;
  status: "draft" | "published";
  name: string;
  title: string;
  date: string;
};

export function AchievementManager({
  enabled,
  revision,
  onEdit,
}: {
  enabled: boolean;
  revision: number;
  onEdit: (draft: EditableDraft) => void;
}) {
  const t = useTranslations("achievement");
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [guardian, setGuardian] = useState(false),
    [everyone, setEveryone] = useState(false),
    [evidence, setEvidence] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/achievement-records", {
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const d = await r.json();
      setItems(d.items);
      setError("");
    } catch {
      setError(t("workflowError"));
    }
  }, [t]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, revision, load]);

  async function edit(id: string) {
    if (!window.confirm(t("replaceEditorConfirm"))) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/achievement-records/${id}`, {
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      onEdit(await r.json());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(t("workflowError"));
    } finally {
      setBusy(false);
    }
  }

  async function mutate(id: string, action: "publish" | "unpublish") {
    setBusy(true);
    setError("");
    try {
      const body =
        action === "publish"
          ? {
              action,
              consent: {
                guardianConfirmed: guardian,
                allSubjectsConfirmed: everyone,
                evidenceReference: evidence,
              },
            }
          : { action };
      const r = await fetch(`/api/admin/achievement-records/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error();
      setSelected("");
      setGuardian(false);
      setEveryone(false);
      setEvidence("");
      await load();
    } catch {
      setError(t("workflowError"));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled)
    return (
      <div className="amg-disabled" role="note">
        {t("workflowDisabled")}
      </div>
    );

  return (
    <section className="amg" aria-busy={busy}>
      <div className="amg-head">
        <h2>{t("savedCards")}</h2>
        {items.length > 0 && <span className="amg-count">{items.length}</span>}
      </div>
      <p className="amg-note">{t("privateWarning")}</p>
      {!items.length && <p className="amg-empty">{t("noSavedCards")}</p>}

      <div className="amg-list">
        {items.map((item) => (
          <article className="amg-item" data-status={item.status} key={item.id}>
            <div className="amg-top">
              <span className="amg-medal" aria-hidden="true">
                <Award />
              </span>
              <div className="amg-main">
                <strong className="amg-name">{item.name}</strong>
                <div className="amg-chips">
                  <span className="amg-chip" data-kind="title">
                    {item.title}
                  </span>
                  <span className="amg-chip">{item.date}</span>
                </div>
              </div>
              <span className="amg-badge" data-status={item.status}>
                {item.status === "published" ? t("published") : t("draft")}
              </span>
            </div>

            {item.status === "draft" ? (
              <>
                <div className="amg-actions">
                  <button
                    type="button"
                    className="amg-btn amg-btn-ghost"
                    disabled={busy}
                    onClick={() => void edit(item.id)}>
                    {t("editDraft")}
                  </button>
                  <button
                    type="button"
                    className="amg-btn amg-btn-solid"
                    aria-expanded={selected === item.id}
                    onClick={() =>
                      setSelected(selected === item.id ? "" : item.id)
                    }>
                    {t("publish")}
                  </button>
                  <DeleteRow
                    kind="achievementRecord"
                    id={item.id}
                    name={item.name}
                    onDone={load}
                  />
                </div>

                {selected === item.id && (
                  <div className="amg-consent">
                    <p>{t("consentNotice")}</p>
                    <label className="amg-check">
                      <input
                        type="checkbox"
                        checked={guardian}
                        onChange={(e) => setGuardian(e.target.checked)}
                      />
                      <span>{t("guardianConfirmed")}</span>
                    </label>
                    <label className="amg-check">
                      <input
                        type="checkbox"
                        checked={everyone}
                        onChange={(e) => setEveryone(e.target.checked)}
                      />
                      <span>{t("everyoneConfirmed")}</span>
                    </label>
                    <label className="amg-field">
                      {t("evidenceReference")}
                      <input
                        maxLength={200}
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                      />
                    </label>
                    <small className="amg-help">{t("evidenceHelp")}</small>
                    <button
                      type="button"
                      className="amg-btn amg-btn-confirm"
                      disabled={
                        busy ||
                        !guardian ||
                        !everyone ||
                        evidence.trim().length < 5
                      }
                      onClick={() => void mutate(item.id, "publish")}>
                      {t("confirmPublish")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="amg-actions">
                  <a
                    className="amg-link"
                    href={`/${locale}/achievements/${item.slug}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    {t("openPublic")}
                    <ExternalLink aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    className="amg-btn amg-btn-danger"
                    disabled={busy}
                    onClick={() => void mutate(item.id, "unpublish")}>
                    {t("unpublish")}
                  </button>
                </div>
                <small className="amg-warn">{t("withdrawalWarning")}</small>
              </>
            )}
          </article>
        ))}
      </div>

      {error && (
        <p role="alert" className="amg-error">
          {error}
        </p>
      )}
    </section>
  );
}
