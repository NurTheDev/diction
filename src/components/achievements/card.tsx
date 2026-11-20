"use client";

import { achievementDateBn } from "@/lib/achievement-date";
import { monthNames, type MonthTable } from "@/lib/admin/months";
import { useTranslations } from "next-intl";
import type { CSSProperties, Ref } from "react";
import { useLayoutEffect, useRef } from "react";
import { Celebration, Medal, TrophyPodium } from "./ornaments";

export type LegacyTemplate =
  | "champion"
  | "bright-star"
  | "polaroid"
  | "trophy"
  | "minimal";

export type ExtraTemplate =
  | "royal-indigo"
  | "crimson-bold"
  | "emerald-arch"
  | "gold-elite"
  | "sky-fresh"
  | "neon-night"
  | "confetti-pop"
  | "spotlight-circle"
  | "certificate"
  | "notebook";

export type Template = LegacyTemplate | ExtraTemplate;
export type Aspect = "1:1" | "4:5" | "1.91:1";

export type CardData = {
  name: string;
  className: string;
  title: string;
  caption: string;
  date: string;
  rank: "1st" | "2nd" | "3rd" | "special";
  template: Template;
  aspect: Aspect;
  photo: string;
  siteUrl: string;
  tagline: string;
  logo: string;
  focusX: number;
  focusY: number;
  brightness: number;
  blur: number;
  showLogo: boolean;
  showClass: boolean;
  showDate: boolean;
  firstNameOnly: boolean;
  medalSide?: "left" | "right";
};

export const cardDimensions: Record<Aspect, [number, number]> = {
  "1:1": [540, 540],
  "4:5": [540, 675],
  "1.91:1": [600, 315],
};

function FitText({
  text,
  max,
  min = 15,
  className,
}: {
  text: string;
  max: number;
  min?: number;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true;

    const fit = () => {
      if (!active) return;
      let size = max;
      el.style.fontSize = `${size}px`;
      const limit = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
      while (
        size > min &&
        (el.scrollHeight > el.clientHeight + 1 ||
          el.scrollHeight > limit + 1 ||
          el.scrollWidth > el.clientWidth)
      ) {
        size--;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    void document.fonts?.ready.then(fit);
    return () => {
      active = false;
    };
  }, [text, max, min]);

  return (
    <div ref={ref} className={className}>
      {text}
    </div>
  );
}

// i18n-scan-allow-start — the card is the thing being designed, not the interface around it: it is
// downloaded and shared as the center's own artifact, in the brand's language, with a Bangla date and
// the brand's own footer. The editor that draws it translates every control it offers.
const labels = {
  "1st": "১ম স্থান",
  "2nd": "২য় স্থান",
  "3rd": "৩য় স্থান",
  special: "বিশেষ পুরস্কার",
};

/** The 10 new designs. The editor reads this list to render its template chips. */
export const extraTemplates: ReadonlyArray<{
  id: ExtraTemplate;
  label: string;
  from: string;
  to: string;
}> = [
  {
    id: "royal-indigo",
    label: "রয়্যাল ইন্ডিগো",
    from: "#2e3192",
    to: "#f6c945",
  },
  {
    id: "crimson-bold",
    label: "ক্রিমসন বোল্ড",
    from: "#d91a21",
    to: "#ffffff",
  },
  {
    id: "emerald-arch",
    label: "এমারেল্ড আর্চ",
    from: "#007a3d",
    to: "#d9f3e3",
  },
  { id: "gold-elite", label: "গোল্ড এলিট", from: "#0b0e2c", to: "#e8b84a" },
  { id: "sky-fresh", label: "স্কাই ফ্রেশ", from: "#0090c8", to: "#e3f5fc" },
  { id: "neon-night", label: "নিয়ন নাইট", from: "#070920", to: "#22d3ee" },
  { id: "confetti-pop", label: "কনফেটি পপ", from: "#fffaf0", to: "#d91a21" },
  { id: "spotlight-circle", label: "স্পটলাইট", from: "#2e3192", to: "#ffd84d" },
  { id: "certificate", label: "সার্টিফিকেট", from: "#fffdf5", to: "#b8892b" },
  { id: "notebook", label: "নোটবুক", from: "#fffdf6", to: "#0090c8" },
];

const extraIds: ReadonlySet<string> = new Set(extraTemplates.map((t) => t.id));
export const isExtraTemplate = (t: string): t is ExtraTemplate =>
  extraIds.has(t);

export function AchievementCard({
  data,
  cardRef,
}: {
  data: CardData;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const [width, height] = cardDimensions[data.aspect];
  const t = useTranslations("common");
  const months = monthNames(t.raw("months") as MonthTable | undefined);

  const wide = data.aspect === "1.91:1";
  const extra = isExtraTemplate(data.template);

  const names = data.name
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (data.firstNameOnly ? n.split(/\s+/)[0] : n));
  const group = names.length > 1;
  const name = names.join("\n");

  const classes = [
    "achievement-art",
    `art-${data.template}`,
    extra && "art-v2",
    wide && "art-wide",
    group && "art-group",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={cardRef}
      className={classes}
      data-template={data.template}
      data-aspect={data.aspect}
      data-rank={data.rank}
      style={{ width, height } as CSSProperties}>
      <div className="art-stage">
        {data.template === "polaroid" && (
          <>
            <div className="art-paper paper-one" />
            <div className="art-paper paper-two" />
          </>
        )}
        <div className="art-photo">
          {data.photo ? (
            <img
              src={data.photo}
              alt=""
              draggable={false}
              style={{
                filter: `brightness(${data.brightness}%)`,
                objectPosition: `${data.focusX}% ${data.focusY}%`,
              }}
            />
          ) : (
            <div className="art-placeholder">
              <svg viewBox="0 0 180 180" aria-hidden="true">
                <circle cx="90" cy="65" r="33" fill="currentColor" />
                <path
                  d="M28 160c3-40 28-61 62-61s59 21 62 61"
                  fill="currentColor"
                />
              </svg>
            </div>
          )}
        </div>
        <div className="art-photo-border" />
        {!extra && <Celebration template={data.template as LegacyTemplate} />}
        <div
          className={`art-ribbon ribbon-${data.medalSide || "left"}`}
          aria-label={labels[data.rank]}>
          <Medal rank={data.rank} />
          <span>{labels[data.rank]}</span>
        </div>
        {data.template === "trophy" && <TrophyPodium />}
      </div>

      <section className={`art-info${group ? " is-group" : ""}`}>
        <div className="art-meta">
          {data.showClass && <span>শ্রেণি · {data.className || "—"}</span>}
          {data.showDate && data.date && (
            <span>{achievementDateBn(data.date, months)}</span>
          )}
        </div>
        <FitText
          key={`name-${data.aspect}-${data.template}-${group}`}
          className="art-name"
          text={name || "শিক্ষার্থীর নাম"}
          max={42}
          min={wide && group && !extra ? 42 : 15}
        />
        <FitText
          key={`title-${data.aspect}-${data.template}-${group}`}
          className="art-title"
          text={data.title || "অর্জনের শিরোনাম"}
          max={27}
        />
        <FitText
          key={`caption-${data.aspect}-${data.template}-${group}`}
          className="art-caption"
          text={data.caption || "তোমার সাফল্যে আমরা গর্বিত!"}
          max={19}
        />
      </section>

      <footer className="art-footer">
        {data.showLogo && (
          <div className="art-logo">
            <img src={data.logo} alt="" width="60" height="60" />
          </div>
        )}
        <div className="art-footer-brand">
          <strong>ডিকশন কোচিং সেন্টার</strong>
          <span>{data.tagline}</span>
        </div>
        <div className="art-footer-meta">
          {data.siteUrl && (
            <strong>
              {data.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </strong>
          )}
          <span>প্রতিষ্ঠা · ২০১১</span>
        </div>
      </footer>
    </div>
  );
}
// i18n-scan-allow-end
