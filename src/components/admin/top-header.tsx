"use client";
import { Link, usePathname } from "@/i18n/navigation";
import type { Digits } from "@/lib/admin/format";
import {
  ChevronDown,
  ExternalLink,
  Hash,
  Home,
  KeyRound,
  Languages,
  LockKeyhole,
  LogOut,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { AdminHelp } from "./help";
import { navGroups, permitted } from "./nav-items";
export function TopHeader({
  name,
  role,
  preview,
  logout,
  userId,
  digits,
}: {
  name: string;
  role: string;
  preview: boolean;
  logout: () => Promise<void>;
  userId: string;
  digits: Digits;
}) {
  const t = useTranslations("adminRedesign"),
    locale = useLocale(),
    router = useRouter(),
    path = usePathname(),
    params = useSearchParams(),
    menu = useRef<HTMLDetailsElement>(null);

  /* Small addition: the user menu closes on outside click, Escape and page change. */
  useEffect(() => {
    const el = menu.current;
    if (!el) return;
    const down = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);

  let key = "overview",
    best = -1;
  for (const group of navGroups)
    for (const [href, k] of group.items) {
      const [p, q] = href.split("?");
      if (
        permitted(k, role) &&
        (path === p || (p !== "/admin" && path.startsWith(p + "/"))) &&
        (!q ||
          q.split("&").every((pair) => {
            const [name, value] = pair.split("=");
            return (
              (name === "kind"
                ? params.get(name) || "blog"
                : params.get(name)) === value
            );
          })) &&
        p.length >= best
      ) {
        key = k;
        best = p.length;
      }
    }
  if (path === "/admin-preview") key = "overview";
  if (path === "/achievement-preview") key = "achievements";

  const initial = Array.from(name.trim())[0]?.toUpperCase() || "?";

  return (
    <header className="admin-top tph">
      <div className="admin-top-page">
        <nav className="tph-crumbs">
          <span className="tph-here">{t("breadcrumb")}</span>
          <ol className="tph-crumb-list">
            <li
              className="tph-crumb"
              aria-current={key === "overview" ? "page" : undefined}>
              <Home size={15} aria-hidden="true" />
              <span>{t("items.overview")}</span>
            </li>
            {key !== "overview" && (
              <li className="tph-crumb" aria-current="page">
                <span>{t(`items.${key}`)}</span>
              </li>
            )}
          </ol>
        </nav>
      </div>
      <div className="admin-top-right">
        <AdminHelp />
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="admin-mini-button tph-btn">
          <ExternalLink size={16} aria-hidden="true" />
          {t("viewSite")}
        </Link>
        <details className="admin-user-menu tph-user" ref={menu}>
          <summary>
            <span className="tph-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="tph-name">{name}</span>
            <ChevronDown className="tph-caret" size={16} aria-hidden="true" />
          </summary>
          <div className="admin-user-dropdown tph-drop">
            <div className="tph-drop-head">
              <span className="tph-avatar tph-avatar-lg" aria-hidden="true">
                {initial}
              </span>
              <div className="tph-who">
                <strong>{name}</strong>
                <span className="tph-role" data-role={role}>
                  {t(`role.${role}`)}
                </span>
              </div>
            </div>
            <label className="admin-digit-setting tph-setting">
              <span className="tph-setting-label">
                <Hash size={16} aria-hidden="true" />
                {t("digits")}
              </span>
              <select
                className="tph-select"
                value={digits}
                onChange={(e) => {
                  document.cookie = `diction_digits_${userId}=${e.target.value}; Path=/; Max-Age=31536000; SameSite=Lax`;
                  router.refresh();
                }}>
                <option value="bn">{t("banglaDigits")}</option>
                <option value="en">{t("englishDigits")}</option>
              </select>
            </label>
            <a
              className="tph-item"
              href={`/${locale === "bn" ? "en" : "bn"}${path}`}
              onClick={(e) => {
                e.currentTarget.href = `/${locale === "bn" ? "en" : "bn"}${path}${window.location.search}${window.location.hash}`;
              }}>
              <span className="tph-ico">
                <Languages size={17} aria-hidden="true" />
              </span>
              {locale === "bn" ? "English" : "বাংলা"}
            </a>
            <Link
              className="admin-site-mobile tph-item"
              href="/"
              target="_blank"
              rel="noopener noreferrer">
              <span className="tph-item-in">
                <span className="tph-ico">
                  <ExternalLink size={17} aria-hidden="true" />
                </span>
                {t("viewSite")}
              </span>
            </Link>
            {!preview && (
              <>
                <div className="tph-sep" role="separator" />
                <Link className="tph-item" href="/account/security">
                  <span className="tph-ico">
                    <LockKeyhole size={17} aria-hidden="true" />
                  </span>
                  {t("password")}
                </Link>
                <Link className="tph-item" href="/forgot-password">
                  <span className="tph-ico">
                    <KeyRound size={17} aria-hidden="true" />
                  </span>
                  {t("resetPassword")}
                </Link>
                <div className="tph-sep" role="separator" />
                <form
                  className="tph-logout-form"
                  action={logout}
                  onSubmit={(e) => {
                    if (!window.confirm(t("logoutConfirm"))) e.preventDefault();
                  }}>
                  <button className="tph-item tph-logout" type="submit">
                    <span className="tph-ico">
                      <LogOut size={17} aria-hidden="true" />
                    </span>
                    {t("logout")}
                  </button>
                </form>
              </>
            )}
          </div>
        </details>
      </div>
    </header>
  ); // i18n-scan-allow: the switcher names the language it switches to, in that language, like header-nav
}
