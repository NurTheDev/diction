"use client";
import { useTranslations } from "next-intl";
/**
 * O1 · what an admin screen looks like while its own numbers are being fetched.
 *
 * Every admin page is server-rendered from a live database — a routine week, a day sheet, a class roll,
 * a marks grid — so the moment between asking and arriving is a moment the operator waits in. Three
 * grey bars said nothing about what was coming, and an empty white page reads as a screen that broke;
 * so the shape of the page arrives first: a heading where the title will be, a row of tiles where the
 * counts will be, and rows where the table will be. It is `aria-busy` and announced once, it pulses
 * unless the reader has asked this machine not to move things, and it is the same shape on every admin
 * address because it is one file above them all.
 */
export default function Loading() {
  const t = useTranslations("adminRedesign");
  return (
    <div
      className="admin-content"
      aria-busy="true"
      aria-live="polite"
      data-admin-loading>
      <div className="admin-skeleton">
        <span className="admin-skeleton-head" />
        <div className="admin-skeleton-kpis" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="admin-skeleton admin-skeleton-rows" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p role="status">{t("loading")}</p>
        <p className="admin-help">{t("loadingHelp")}</p>
      </div>
    </div>
  );
}
