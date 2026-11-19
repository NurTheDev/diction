import { formatNumber, type Digits } from "@/lib/admin/format";
import { databaseUsage } from "@/lib/center/database-usage";
import { Database, ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

const MAX_BYTES = 512 * 1024 * 1024;

export async function CenterDatabaseUsage({ digits }: { digits: Digits }) {
  const [t, data] = await Promise.all([
    getTranslations("center"),
    databaseUsage(),
  ]);
  const ratio = data ? data.bytes / MAX_BYTES : 0,
    mb = data ? Math.round((data.bytes / 1024 / 1024) * 10) / 10 : 0,
    percent = Math.round(Math.min(ratio, 1) * 1000) / 10,
    level = ratio >= 0.9 ? "danger" : ratio >= 0.7 ? "caution" : "ok";
  return (
    <section className="cdu" data-db-usage data-level={level}>
      <div className="cdu-head">
        <span className="cdu-icon" aria-hidden="true">
          <Database size={20} />
        </span>
        <h2>{t("dbTitle")}</h2>
      </div>
      <div className="cdu-body">
        {data ? (
          <>
            <div className="cdu-usage">
              <strong>
                {t("dbUsage", { used: formatNumber(mb, digits) })}
              </strong>
              <span className="cdu-percent">
                {formatNumber(percent, digits)}%
              </span>
            </div>
            <progress
              className="cdu-bar"
              value={Math.min(data.bytes, MAX_BYTES)}
              max={MAX_BYTES}
              aria-label={t("dbTitle")}
            />
            {level !== "ok" && (
              <p className="cdu-alert" role="status">
                <ShieldAlert size={18} aria-hidden="true" />
                <span>
                  {level === "danger" ? t("dbWarning") : t("dbCaution")}
                </span>
              </p>
            )}
            <p className="cdu-help">{t("dbCounts")}</p>
            <ul className="cdu-counts">
              {(Object.keys(data.counts) as (keyof typeof data.counts)[]).map(
                (key) => (
                  <li key={key}>
                    <span>{t(key)}</span>
                    <strong>{formatNumber(data.counts[key], digits)}</strong>
                  </li>
                ),
              )}
            </ul>
            <p className="cdu-foot">{t("dbUpgrade")}</p>
          </>
        ) : (
          <p className="cdu-unavailable" role="status">
            {t("dbUnavailable")}
          </p>
        )}
      </div>
    </section>
  );
}
