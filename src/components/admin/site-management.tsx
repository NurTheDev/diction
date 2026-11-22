import { Link } from "@/i18n/navigation";
import type { Digits } from "@/lib/admin/format";
import {
  ArrowUpRight,
  Award,
  ChevronDown,
  FilePenLine,
  FileText,
  Globe,
  Images,
  MessageSquareQuote,
  Newspaper,
  PanelsTopLeft,
  Video,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdminChecklist } from "./checklist";
import { permitted } from "./nav-items";

/**
 * Group 2 · the Overview's second tier: the centre's public face, folded away until it is wanted.
 *
 * The banner, the blog, the testimonials and the lecture sheet are real work — but they are work a
 * manager does once a week, not the four numbers the day is run on. So the whole of it sits under one
 * heading the operator can open, below the day's work and the visitor queue, instead of above them.
 * Folding it is not hiding it: the summary names the tier and says what is inside, and the site-readiness
 * checklist that used to stand on its own is part of the same fold, because "is the public site ready"
 * is one question with the same answer.
 *
 * Every door is offered only to a role that may walk through it (`permitted`), so the fold never contains
 * a link that ends in a refusal.
 */
export async function SiteManagement({
  role,
  digits,
  userId,
  checklist = [],
  open = false,
}: {
  role: string;
  digits: Digits;
  userId: string;
  checklist?: boolean[];
  open?: boolean;
}) {
  const t = await getTranslations("adminRedesign");
  const doors = [
    {
      key: "hero",
      href: "/admin/hero",
      icon: PanelsTopLeft,
      label: t("changeBanner"),
    },
    {
      key: "blog",
      href: "/admin/content?kind=blog&new=1",
      icon: FilePenLine,
      label: t("newBlog"),
    },
    {
      key: "notice",
      href: "/admin/content?kind=notice&new=1",
      icon: Newspaper,
      label: t("newNotice"),
    },
    /* A door and its menu item are the same door, so they read the same: the fold names the screen with
       the catalogue word the sidebar uses (testimonials and the toppers beside them, the lecture sheets,
       the media library) and reserves the verbs — change the banner, write a blog — for the acts. */
    {
      key: "otherContent",
      href: "/admin/content?kind=other",
      icon: MessageSquareQuote,
      label: t("items.otherContent"),
    },
    {
      key: "sheets",
      href: "/admin/public-sheets",
      icon: FileText,
      label: t("items.sheets"),
    },
    {
      key: "video",
      href: "/admin/content?kind=video&new=1",
      icon: Video,
      label: t("newVideo"),
    },
    {
      key: "achievements",
      href: "/admin/achievements",
      icon: Award,
      label: t("newAchievement"),
    },
    {
      key: "media",
      href: "/admin/media",
      icon: Images,
      label: t("items.media"),
    },
  ].filter((door) => permitted(door.key, role));

  if (!doors.length && !checklist.length) return null;
  return (
    <section className="sm" data-site-management="">
      <details className="sm-fold" open={open || undefined} data-site-fold="">
        <summary className="sm-summary">
          <span className="sm-icon" aria-hidden="true">
            <Globe size={20} />
          </span>
          <span className="sm-titles">
            <h2>{t("site.title")}</h2>
            <span>{t("site.lede")}</span>
          </span>
          <ChevronDown className="sm-chevron" size={20} aria-hidden="true" />
        </summary>
        <div className="sm-body">
          {doors.length > 0 && (
            <div className="sm-links">
              {doors.map((door) => {
                const Icon = door.icon;
                return (
                  <Link
                    href={door.href}
                    className="sm-link"
                    data-site-link={door.key}
                    key={door.key}>
                    <span className="sm-link-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="sm-link-label">{door.label}</span>
                    <ArrowUpRight
                      className="sm-link-arrow"
                      size={16}
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          )}
          {checklist.length > 0 && (
            <div className="sm-checklist">
              <AdminChecklist
                done={checklist}
                digits={digits}
                userId={userId}
              />
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
