"use client";
import { ExternalLink, Play } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export function BlogVideo({ id }: { id: string }) {
  const locale = useLocale(),
    t = useTranslations("publicPages"),
    [open, setOpen] = useState(false);
  return (
    <section className="bvd" lang={locale}>
      <header className="bvd-head">
        <span className="bvd-icon" aria-hidden="true">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <div>
          <h2>{t("blog.video.heading")}</h2>
          <p>{t("blog.video.note")}</p>
        </div>
      </header>

      <div className="bvd-body">
        <div className="bvd-stage">
          {open ? (
            <div className="bvd-frame">
              <iframe
                title={t("blog.video.frameTitle")}
                src={`https://www.youtube-nocookie.com/embed/${id}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                loading="lazy"
              />
            </div>
          ) : (
            <button
              type="button"
              className="bvd-play"
              onClick={() => setOpen(true)}>
              <span className="bvd-play-ico" aria-hidden="true">
                <Play fill="currentColor" strokeWidth={0} />
              </span>
              <span className="bvd-play-label">{t("blog.video.load")}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bvd-foot">
        <a
          className="bvd-link"
          href={`https://www.youtube.com/watch?v=${id}`}
          target="_blank"
          rel="noopener noreferrer">
          {t("blog.video.openOn")}
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
