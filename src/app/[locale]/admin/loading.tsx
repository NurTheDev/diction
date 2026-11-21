"use client";
import "@/admin-loading.css";
import { useTranslations } from "next-intl";
/**
 * O1 · what an admin screen looks like while its own numbers are being fetched.
 *
 * Every admin page is server-rendered from a live database — a routine week, a day sheet, a class roll,
 * a marks grid — so the moment between asking and arriving is a moment the operator waits in. Three
 * grey bars said nothing about what was coming, and an empty white page reads as a screen that broke;
 * so the shape of the page arrives first: a heading where the title will be, a row of tiles where the
 * counts will be, and rows where the table will be. It is `aria-busy` and announced once, it shimmers
 * unless the reader has asked this machine not to move things, and it is the same shape on every admin
 * address because it is one file above them all.
 */
export default function Loading() {
  const t = useTranslations("adminRedesign");
  return (
    <div
      className="admin-content ldg"
      aria-busy="true"
      aria-live="polite"
      data-admin-loading>
      <div className="ldg-bar" aria-hidden="true">
        <span />
      </div>

      <div className="ldg-status">
        <span className="ldg-spin" aria-hidden="true" />
        <div className="ldg-status-text">
          <p className="ldg-status-main" role="status">
            {t("loading")}
          </p>
          <p className="ldg-status-help">{t("loadingHelp")}</p>
        </div>
      </div>

      <div className="ldg-shape" aria-hidden="true">
        <div className="ldg-head">
          <span className="ldg-sk ldg-tag" />
          <span className="ldg-sk ldg-title" />
          <span className="ldg-sk ldg-sub" />
          <span className="ldg-sk ldg-sub ldg-sub-short" />
        </div>

        <div className="ldg-kpis">
          {[0, 1, 2, 3].map((n) => (
            <div className="ldg-kpi" key={n}>
              <span className="ldg-sk ldg-kpi-ico" />
              <div className="ldg-kpi-lines">
                <span className="ldg-sk ldg-kpi-label" />
                <span className="ldg-sk ldg-kpi-num" />
              </div>
            </div>
          ))}
        </div>

        <div className="ldg-panel">
          <div className="ldg-panel-head">
            <span className="ldg-sk ldg-panel-title" />
            <span className="ldg-sk ldg-panel-btn" />
          </div>
          <div className="ldg-rows">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div className="ldg-row" key={n}>
                <span className="ldg-sk ldg-avatar" />
                <div className="ldg-row-lines">
                  <span className="ldg-sk ldg-line-a" />
                  <span className="ldg-sk ldg-line-b" />
                </div>
                <span className="ldg-sk ldg-pill" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
