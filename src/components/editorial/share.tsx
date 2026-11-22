"use client";
import { Check, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export function Share() {
  const t = useTranslations("editorial");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  // Return the label to "Copy link" after a short moment.
  useEffect(() => {
    if (!copied && !error) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setError(false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [copied, error]);

  return (
    <button
      type="button"
      className="shr"
      data-state={copied ? "copied" : error ? "error" : "idle"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setError(false);
        } catch {
          setError(true);
        }
      }}>
      {copied ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Link2 size={16} aria-hidden="true" />
      )}
      <span aria-live="polite">
        {copied ? t("copied") : error ? t("copyError") : t("copyLink")}
      </span>
    </button>
  );
}
