"use client";
import { Link, usePathname } from "@/i18n/navigation";
import { formatNumber, type Digits } from "@/lib/admin/format";
import "@/sidebar.css";
import {
  ChevronDown,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navGroups, permitted } from "./nav-items";
/* O1 · the exam fold, by item key. It used to name four screens and one of them — the old "Results"
   door — led to a screen whose numbers the exam hub already holds, so the menu offered two ways to the
   same grade. The fold is one list here rather than three copies of one array below, so a screen joins
   the exam subject in one place and cannot be left out of another. */
const EXAM_FOLD = ["centerExams", "modelTests", "practice"];
export function Sidebar({
  preview = false,
  staffRole = "admin",
  counts,
  digits = "bn",
  mobileHeader,
}: {
  preview?: boolean;
  superadmin?: boolean;
  staffRole?: string;
  counts?: Record<string, number>;
  digits?: Digits;
  mobileHeader?: React.ReactNode;
}) {
  const t = useTranslations("adminRedesign"),
    leads = useTranslations("leads"),
    pathname = usePathname(),
    params = useSearchParams();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
      Object.fromEntries(
        navGroups.map((g) => [
          g.key,
          !g.items.some(([href, key]) => {
            const [path, q] = href.split("?");
            return (
              permitted(key, staffRole) &&
              (pathname === path ||
                (path !== "/admin" && pathname.startsWith(path + "/"))) &&
              (!q || q.split("=")[1] === (params.get("kind") || "blog"))
            );
          }),
        ]),
      ),
    ),
    [mobile, setMobile] = useState(false);
  const drawer = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setCollapsed((v) => ({
        ...v,
        ...JSON.parse(localStorage.getItem("diction-admin-nav-groups") || "{}"),
      }));
    } catch {}
  }, []);
  useEffect(() => {
    const currentKind = params.get("kind") || "blog";
    const group = navGroups.find((g) =>
      g.items.some(([href, key]) => {
        if (!permitted(key, staffRole)) return false;
        const [p, q] = href.split("?");
        return (
          (pathname === p ||
            (p !== "/admin" && pathname.startsWith(p + "/"))) &&
          (!q || q.split("=")[1] === currentKind)
        );
      }),
    );
    if (group)
      setCollapsed((v) => (v[group.key] ? { ...v, [group.key]: false } : v));
  }, [pathname, params, staffRole]);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (e.key === "Tab" && drawer.current) {
        const nodes = Array.from(
          drawer.current.querySelectorAll<HTMLElement>(
            "a[href],button:not([disabled]),input:not([disabled])",
          ),
        );
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  function toggle(key: string) {
    setCollapsed((v) => {
      const next = { ...v, [key]: !v[key] };
      try {
        localStorage.setItem("diction-admin-nav-groups", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  /**
   * A nav item carrying a query is only the current page when that query is the one in the address bar,
   * otherwise “Follow-ups” and “Visitors” both light up on one screen. `kind` keeps its old
   * default because content pages omit it for blog.
   */
  const matches = (pair: string) => {
    const [key, value] = pair.split("=");
    const current = params.get(key);
    return key === "kind" ? (current || "blog") === value : current === value;
  };
  const under = (path: string) =>
    pathname === path || (path !== "/admin" && pathname.startsWith(path + "/"));
  /* Only the deepest menu path that contains this page lights up: /admin/students/fees-grid is not also "Student list". */
  const deepest = navGroups
    .flatMap((g) => g.items.map(([href]) => href.split("?")[0]))
    .filter(under)
    .sort((a, b) => b.length - a.length)[0];
  const active = (href: string): boolean => {
    const [path, q] = href.split("?");
    if (q) return pathname === path && q.split("&").every(matches);
    /* "Leads" stays dark when "Follow-ups" (/admin/leads?followUp=today) is the page. */ return (
      under(path) &&
      path === deepest &&
      !navGroups.some((g) =>
        g.items.some(
          ([other]) => other.startsWith(path + "?") && active(other),
        ),
      )
    );
  };
  /** On the Visitors screens the bottom bar’s plus is quick-add: one tap, and Enter saves. */
  const onLeads =
    permitted("leads", staffRole) &&
    (pathname === "/admin/leads" || pathname.startsWith("/admin/leads/"));
  const groups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        ([, key]) =>
          permitted(key, staffRole) &&
          t(`items.${key}`)
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()),
      ),
    }))
    .filter((g) => g.items.length);
  const home =
    staffRole === "content_editor"
      ? "/admin/content?kind=blog"
      : staffRole === "exam_manager"
        ? "/admin/practice-tests"
        : "/admin";
  return (
    <>
      <div className="admin-mobilebar sbx-mobilebar">
        <Link href={home} className="admin-mobilebrand sbx-mobilebrand">
          Diction
        </Link>
        <span className="admin-mobilebar-spacer" />
        {mobileHeader}
        <button
          ref={menuButton}
          type="button"
          className="sbx-menu-btn"
          onClick={() => setOpen(true)}
          aria-label={t("menu")}
          aria-expanded={open}>
          <Menu size={20} /> {t("menu")}
        </button>
      </div>
      {open && (
        <button
          className="admin-backdrop sbx-backdrop"
          aria-label={t("close")}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={drawer}
        inert={mobile && !open ? true : undefined}
        className={`admin-sidebar sbx ${open ? "open" : ""}`}
        aria-label={t("menu")}>
        <div className="admin-brand">
          <Link href={home} className="sbx-brand-link">
            <Image src="/brand/logo.png" alt="Diction" width={53} height={42} />
            <span className="sbx-brand-text">
              <strong>{t("brand")}</strong>
              <small>{t("brandSub")}</small>
            </span>
          </Link>
          <button
            type="button"
            className="admin-drawer-close"
            onClick={() => setOpen(false)}
            aria-label={t("close")}>
            <X size={22} />
          </button>
        </div>
        <label className="admin-menu-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </label>
        <nav className="admin-nav" aria-label={t("menu")}>
          {groups.length ? (
            groups.map((g) => (
              <div key={g.key} className="admin-nav-group">
                <button
                  type="button"
                  className="admin-group-toggle"
                  aria-expanded={!!search || !collapsed[g.key]}
                  onClick={() => toggle(g.key)}>
                  <span>{t(`groups.${g.key}`)}</span>
                  <ChevronDown
                    className="sbx-chev"
                    size={16}
                    aria-hidden="true"
                  />
                </button>
                {(!collapsed[g.key] || !!search) && (
                  <>
                    {g.items
                      .filter(([, key]) => !EXAM_FOLD.includes(key))
                      .map(([href, key, Icon]) => (
                        <Link
                          href={
                            preview && key === "achievements"
                              ? "/achievement-preview"
                              : href
                          }
                          onClick={() => setOpen(false)}
                          className={`sbx-link ${active(href) ? "selected" : ""}`}
                          aria-current={active(href) ? "page" : undefined}
                          key={key}>
                          <span className="sbx-ico">
                            <Icon size={19} aria-hidden="true" />
                          </span>
                          <span className="sbx-text">
                            <span>{t(`items.${key}`)}</span>
                          </span>
                          {counts?.[key] != null && counts[key] > 0 && (
                            <span className="admin-nav-count sbx-count">
                              {formatNumber(Math.min(counts[key], 99), digits)}
                              {counts[key] > 99 ? "+" : ""}
                            </span>
                          )}
                        </Link>
                      ))}
                    {g.items.some(([, key]) => EXAM_FOLD.includes(key)) && (
                      <details
                        className="admin-exams"
                        open={
                          !!search ||
                          g.items.some(
                            ([href, key]) =>
                              EXAM_FOLD.includes(key) && active(href),
                          ) ||
                          undefined
                        }>
                        <summary>
                          <span className="sbx-ico">
                            <GraduationCap size={19} aria-hidden="true" />
                          </span>
                          <span className="sbx-summary-text">{t("exams")}</span>
                          <ChevronDown
                            className="sbx-chev"
                            size={16}
                            aria-hidden="true"
                          />
                        </summary>
                        {g.items
                          .filter(([, key]) => EXAM_FOLD.includes(key))
                          .map(([href, key, Icon]) => (
                            <Link
                              href={href}
                              onClick={() => setOpen(false)}
                              className={`sbx-link ${active(href) ? "selected" : ""}`}
                              aria-current={active(href) ? "page" : undefined}
                              key={key}>
                              <span className="sbx-ico">
                                <Icon size={19} aria-hidden="true" />
                              </span>
                              <span className="sbx-text">
                                <span>{t(`items.${key}`)}</span>
                                <small>{t(`examDesc.${key}`)}</small>
                              </span>
                            </Link>
                          ))}
                      </details>
                    )}
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="admin-menu-empty">{t("noMenuResults")}</p>
          )}
        </nav>
      </aside>
      <nav className="admin-bottom-nav sbx-bottom" aria-label={t("menu")}>
        <Link href={home}>
          <LayoutDashboard size={20} />
          {t("items.overview")}
        </Link>
        {permitted("admissions", staffRole) && (
          <Link href="/admin/admissions">
            <ClipboardList size={20} />
            {t("items.admissions")}
          </Link>
        )}
        <Link
          className="sbx-bn-add"
          href={
            onLeads
              ? "/admin/leads?new=1"
              : staffRole === "exam_manager"
                ? "/admin/practice-tests"
                : "/admin/content?kind=blog&new=1"
          }>
          <span className="sbx-bn-plus">
            <Plus size={22} />
          </span>
          {onLeads ? leads("add") : t("new")}
        </Link>
        <button type="button" onClick={() => setOpen(true)}>
          <Menu size={20} />
          {t("menu")}
        </button>
      </nav>
    </>
  );
}
