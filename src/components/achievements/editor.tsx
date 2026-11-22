"use client";
import { BanglaDate } from "@/components/admin/bangla-date";
import { toBlob } from "html-to-image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  AchievementCard,
  cardDimensions,
  extraTemplates,
  type CardData,
  type Template,
} from "./card";
import { AchievementManager, type EditableDraft } from "./manager";

/* The 5 classic templates use translated labels (t(x)).
   The 10 new ones come from extraTemplates and carry their own label. */
const templates: Template[] = [
  "champion",
  "bright-star",
  "polaroid",
  "trophy",
  "minimal",
];

async function cleanPhoto(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024 ||
    !file.size
  )
    throw Error("invalid");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > 25000000) throw Error("invalid");
    const scale = Math.min(
        1,
        1800 / img.naturalWidth,
        1800 / img.naturalHeight,
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("invalid");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cropImage(src: string, area: Area) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("invalid");
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function AchievementEditor({
  sample = false,
  workflow = false,
  settings,
}: {
  sample?: boolean;
  workflow?: boolean;
  settings: { website: string; taglineBn: string; logoUrl: string };
}) {
  const t = useTranslations("achievement");
  const [data, setData] = useState<CardData>({
    name: sample ? t("sampleCard.name") : "",
    className: sample ? t("sampleCard.className") : "",
    title: sample ? t("sampleCard.title") : "",
    caption: sample ? t("sampleCard.caption") : "",
    date: sample ? "2026-01-01" : "",
    rank: "1st",
    template: "champion",
    aspect: "1:1",
    photo: sample ? "/brand/students-illustration.jpg" : "",
    siteUrl: settings.website,
    tagline: settings.taglineBn,
    logo: settings.logoUrl,
    focusX: 50,
    focusY: 30,
    medalSide: "left",
    brightness: 100,
    blur: 0,
    showLogo: true,
    showClass: true,
    showDate: true,
    firstNameOnly: false,
  });
  const [english, setEnglish] = useState({
    name: "",
    title: "",
    caption: "",
    batch: "",
    subject: "",
    prize: "",
    note: "",
  });
  const [mode, setMode] = useState<"group" | "individual">("group"),
    [selected, setSelected] = useState(0),
    [cropRatio, setCropRatio] = useState(4 / 3);
  const [consent, setConsent] = useState(false),
    [source, setSource] = useState(""),
    [crop, setCrop] = useState({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(1),
    [area, setArea] = useState<Area | null>(null),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [scale, setScale] = useState(1);
  const card = useRef<HTMLDivElement>(null),
    box = useRef<HTMLDivElement>(null),
    photoSelection = useRef(0);
  const [width, height] = cardDimensions[data.aspect];
  const shownName =
    mode === "individual"
      ? data.name.split("\n").filter((x) => x.trim())[selected] || ""
      : data.name;
  const versionKey = JSON.stringify({ ...data, name: shownName });
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(
    null,
  );
  const cache = useRef<{ key: string; blob: Blob; url: string } | null>(null);
  const editVersion = JSON.stringify({ versionKey, english, consent });
  const latest = useRef(editVersion);
  latest.current = editVersion;
  const [revision, setRevision] = useState(0);
  const [editingDraft, setEditingDraft] = useState<{
    id: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / width)),
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [width]);

  function update<K extends keyof CardData>(key: K, value: CardData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function select(file?: File) {
    if (!file) return;
    const selection = ++photoSelection.current;
    setMessage("");
    try {
      const clean = await cleanPhoto(file);
      if (selection !== photoSelection.current) return;
      setSource(clean);
      update("photo", clean);
      setEditing(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      if (selection === photoSelection.current) setMessage(t("fileError"));
    }
  }

  async function exportImage() {
    if (!card.current) throw Error("no card");
    await document.fonts.ready;
    const fits = Array.from(
      card.current.querySelectorAll<HTMLElement>(
        ".art-name,.art-title,.art-caption",
      ),
    ).every(
      (el) =>
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollHeight <= parseFloat(getComputedStyle(el).maxHeight) + 1 &&
        el.scrollWidth <= el.clientWidth,
    );
    const info = card.current.querySelector<HTMLElement>(".art-info");
    if (!fits || !info || info.scrollHeight > info.clientHeight + 1)
      throw Error("text-overflow");
    return await toBlob(card.current, {
      pixelRatio: 2,
      cacheBust: false,
      backgroundColor: "#fff",
    });
  }

  useEffect(() => {
    let active = true;
    setRendered(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const blob = await exportImage();
          if (!active || !blob) return;
          const url = URL.createObjectURL(blob);
          if (cache.current) URL.revokeObjectURL(cache.current.url);
          cache.current = { key: versionKey, blob, url };
          setRendered({ key: versionKey, url });
        } catch {
          /* HTML preview remains available if rasterization fails. */
        }
      })();
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [versionKey]);

  useEffect(
    () => () => {
      if (cache.current) URL.revokeObjectURL(cache.current.url);
    },
    [],
  );

  async function download(copy = false) {
    setBusy(true);
    setMessage("");
    try {
      const blob =
        cache.current?.key === versionKey
          ? cache.current.blob
          : await exportImage();
      if (!blob) throw Error("empty");
      if (copy) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
          throw Error("clipboard");
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setMessage(t("copied"));
      } else {
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "diction-achievement.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
    } catch (e) {
      setMessage(
        e instanceof Error && e.message === "text-overflow"
          ? t("textOverflow")
          : copy
            ? t("copyUnsupported")
            : t("error"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setMessage("");
    const started = versionKey,
      startedEdit = editVersion;
    try {
      if (
        !consent ||
        english.note.trim().length < 5 ||
        !data.photo.startsWith("data:image/jpeg;base64,")
      )
        throw Error("required");
      const blob =
        cache.current?.key === started
          ? cache.current.blob
          : await exportImage();
      if (!blob) throw Error("invalid");
      const png = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(Error("invalid"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      if (latest.current !== startedEdit) throw Error("changed");
      const card = {
        name: shownName,
        className: data.className,
        title: data.title,
        caption: data.caption,
        date: data.date,
        rank: data.rank,
        template: data.template,
        aspect: data.aspect,
        focusX: data.focusX,
        focusY: data.focusY,
        brightness: data.brightness,
        medalSide: data.medalSide || "left",
        showLogo: data.showLogo,
        showClass: data.showClass,
        showDate: data.showDate,
        firstNameOnly: data.firstNameOnly,
      };
      const payload = {
        card,
        additional: {
          name: english.name,
          title: english.title,
          caption: english.caption,
          batch: english.batch,
          subject: english.subject,
          prize: english.prize,
        },
        photo: data.photo,
        png,
        processingConfirmed: consent,
        processingReference: english.note.trim(),
      };
      const response = await fetch(
        editingDraft
          ? `/api/admin/achievement-records/${editingDraft.id}`
          : "/api/admin/achievement-records",
        {
          method: editingDraft ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingDraft
              ? { ...payload, version: editingDraft.version }
              : payload,
          ),
        },
      );
      if (!response.ok) throw Error("failed");
      setEditingDraft(null);
      setMessage(t("draftSaved"));
      setRevision((n) => n + 1);
    } catch (e) {
      setMessage(
        e instanceof Error && e.message === "text-overflow"
          ? t("textOverflow")
          : e instanceof Error && e.message === "changed"
            ? t("changedDuringSave")
            : t("draftError"),
      );
    } finally {
      setBusy(false);
    }
  }

  function loadDraft(d: EditableDraft) {
    photoSelection.current++;
    setData((current) => ({
      ...current,
      ...d.card,
      photo: d.photo,
      siteUrl: settings.website,
      tagline: settings.taglineBn,
      logo: settings.logoUrl,
      blur: 0,
    }));
    setEnglish({ ...d.additional, note: d.processingReference });
    setSource(d.photo);
    setConsent(false);
    setEditing(false);
    setMode("group");
    setSelected(0);
    setEditingDraft({ id: d.id, version: d.version });
    setMessage(t("draftLoaded"));
  }

  const names = data.name.split("\n").filter((x) => x.trim());

  return (
    <div className="ae">
      <header className="ae-head">
        <span className="ae-eyebrow">✦ Diction Studio</span>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>

      <div className="ae-notice" role="status">
        {workflow ? t("workflowStage") : t("stage")}
      </div>

      <div className="ae-layout">
        <section className="ae-col">
          <h2 className="ae-col-title">{t("details")}</h2>

          {/* 1 · photo and framing */}
          <div className="ae-group" data-kind="photo">
            <div
              className="ae-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void select(e.dataTransfer.files[0]);
              }}>
              <strong>{t("photo")}</strong>
              <p>{t("photoHelp")}</p>
              <div className="ae-row">
                <label className="ae-btn ae-btn-ghost ae-btn-sm">
                  {t("photoButton")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      void select(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="ae-btn ae-btn-ghost ae-btn-sm">
                  {t("camera")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      void select(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {source && (
                  <button
                    type="button"
                    className="ae-btn ae-btn-ghost ae-btn-sm"
                    onClick={() => setEditing(true)}>
                    {t("crop")}
                  </button>
                )}
              </div>
            </div>

            {editing && (
              <div className="ae-crop">
                <div className="ae-crop-area">
                  <Cropper
                    image={source}
                    crop={crop}
                    zoom={zoom}
                    aspect={cropRatio}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, pixels) => setArea(pixels)}
                  />
                </div>
                <label className="ae-field">
                  <span className="ae-lab">{t("cropShape")}</span>
                  <select
                    value={cropRatio}
                    onChange={(e) => setCropRatio(+e.target.value)}>
                    <option value={4 / 3}>{t("landscape")}</option>
                    <option value={3 / 4}>{t("portraitPhoto")}</option>
                    <option value={1}>{t("squarePhoto")}</option>
                  </select>
                </label>
                <label className="ae-field ae-range">
                  <span className="ae-lab">{t("zoom")}</span>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={zoom}
                    onChange={(e) => setZoom(+e.target.value)}
                  />
                </label>
                <div className="ae-row">
                  <button
                    className="ae-btn ae-btn-primary ae-btn-sm"
                    type="button"
                    onClick={async () => {
                      try {
                        if (area)
                          update("photo", await cropImage(source, area));
                        setEditing(false);
                      } catch {
                        setMessage(t("error"));
                      }
                    }}>
                    {t("applyCrop")}
                  </button>
                  <button
                    className="ae-btn ae-btn-ghost ae-btn-sm"
                    type="button"
                    onClick={() => setEditing(false)}>
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}

            <div className="ae-two">
              <label className="ae-field ae-range">
                <span className="ae-lab">
                  {t("focusX")} · {data.focusX}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={data.focusX}
                  onChange={(e) => update("focusX", +e.target.value)}
                />
              </label>
              <label className="ae-field ae-range">
                <span className="ae-lab">
                  {t("focusY")} · {data.focusY}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={data.focusY}
                  onChange={(e) => update("focusY", +e.target.value)}
                />
              </label>
            </div>
            <small className="ae-hint">{t("faceHelp")}</small>

            <div className="ae-two">
              <label className="ae-field">
                <span className="ae-lab">{t("medalSide")}</span>
                <select
                  value={data.medalSide}
                  onChange={(e) =>
                    update("medalSide", e.target.value as "left" | "right")
                  }>
                  <option value="left">{t("left")}</option>
                  <option value="right">{t("right")}</option>
                </select>
              </label>
              <label className="ae-field ae-range">
                <span className="ae-lab">
                  {t("brightness")} · {data.brightness}%
                </span>
                <input
                  type="range"
                  min="70"
                  max="130"
                  value={data.brightness}
                  onChange={(e) => update("brightness", +e.target.value)}
                />
              </label>
            </div>
            <div className="ae-row">
              <button
                type="button"
                className="ae-btn ae-btn-ghost ae-btn-sm"
                onClick={() => update("brightness", 106)}>
                {t("enhance")}
              </button>
            </div>
          </div>

          {/* 2 · the words on the card */}
          <div className="ae-group" data-kind="text">
            <label className="ae-field">
              <span className="ae-lab">{t("nameBn")}</span>
              <textarea
                value={data.name}
                maxLength={300}
                onChange={(e) => {
                  update("name", e.target.value);
                  setSelected(0);
                }}
              />
              <small className="ae-hint">{t("nameHelp")}</small>
            </label>

            <div className="ae-two">
              <label className="ae-field">
                <span className="ae-lab">{t("groupMode")}</span>
                <select
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as "group" | "individual")
                  }>
                  <option value="group">{t("group")}</option>
                  <option value="individual">{t("individual")}</option>
                </select>
              </label>
              {mode === "individual" && names.length > 1 && (
                <label className="ae-field">
                  <span className="ae-lab">{t("chooseStudent")}</span>
                  <select
                    value={selected}
                    onChange={(e) => setSelected(+e.target.value)}>
                    {names.map((x, i) => (
                      <option key={i} value={i}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="ae-two">
              <label className="ae-field">
                <span className="ae-lab">{t("nameEn")}</span>
                <input
                  maxLength={100}
                  value={english.name}
                  onChange={(e) =>
                    setEnglish({ ...english, name: e.target.value })
                  }
                />
              </label>
              <label className="ae-field">
                <span className="ae-lab">{t("className")}</span>
                <input
                  maxLength={80}
                  value={data.className}
                  onChange={(e) => update("className", e.target.value)}
                />
              </label>
            </div>

            <div className="ae-two">
              <label className="ae-field">
                <span className="ae-lab">{t("titleBn")}</span>
                <input
                  value={data.title}
                  maxLength={120}
                  onChange={(e) => update("title", e.target.value)}
                />
              </label>
              <label className="ae-field">
                <span className="ae-lab">{t("titleEn")}</span>
                <input
                  maxLength={120}
                  value={english.title}
                  onChange={(e) =>
                    setEnglish({ ...english, title: e.target.value })
                  }
                />
              </label>
            </div>

            <label className="ae-field">
              <span className="ae-lab">
                {t("captionBn")}
                <em>{data.caption.length}/200</em>
              </span>
              <textarea
                value={data.caption}
                maxLength={200}
                onChange={(e) => update("caption", e.target.value)}
              />
            </label>
            <label className="ae-field">
              <span className="ae-lab">
                {t("captionEn")}
                <em>{english.caption.length}/200</em>
              </span>
              <textarea
                maxLength={200}
                value={english.caption}
                onChange={(e) =>
                  setEnglish({ ...english, caption: e.target.value })
                }
              />
            </label>

            <div className="ae-two">
              <label className="ae-field">
                <span className="ae-lab">{t("date")}</span>
                <BanglaDate
                  value={data.date}
                  onChange={(v) => update("date", v)}
                />
              </label>
              <label className="ae-field">
                <span className="ae-lab">{t("rank")}</span>
                <select
                  value={data.rank}
                  onChange={(e) =>
                    update("rank", e.target.value as CardData["rank"])
                  }>
                  <option value="1st">{t("first")}</option>
                  <option value="2nd">{t("second")}</option>
                  <option value="3rd">{t("third")}</option>
                  <option value="special">{t("special")}</option>
                </select>
              </label>
            </div>

            <div className="ae-three">
              {(["batch", "subject", "prize"] as const).map((k) => (
                <label className="ae-field" key={k}>
                  <span className="ae-lab">{t(k)}</span>
                  <input
                    maxLength={80}
                    value={english[k]}
                    onChange={(e) =>
                      setEnglish({ ...english, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>

            <p className="ae-note">
              {data.siteUrl
                ? `${t("siteUrl")}: ${data.siteUrl}`
                : t("siteMissing")}
            </p>
          </div>

          {/* 3 · design */}
          <div className="ae-group" data-kind="design">
            <fieldset className="ae-chipset">
              <legend>{t("template")}</legend>

              {/* classic 5 */}
              {templates.map((x) => (
                <button
                  type="button"
                  className="ae-chip"
                  key={x}
                  aria-pressed={data.template === x}
                  onClick={() => update("template", x)}>
                  {t(x)}
                </button>
              ))}

              {/* new 10 */}
              {extraTemplates.map((tpl) => (
                <button
                  type="button"
                  className="ae-chip"
                  key={tpl.id}
                  aria-pressed={data.template === tpl.id}
                  onClick={() => update("template", tpl.id)}>
                  <i
                    className="tpl-dot"
                    style={{
                      background: `linear-gradient(135deg, ${tpl.from} 50%, ${tpl.to} 50%)`,
                    }}
                  />
                  {tpl.label}
                </button>
              ))}
            </fieldset>
            <fieldset className="ae-chipset">
              <legend>{t("aspect")}</legend>
              {(
                [
                  ["1:1", "square"],
                  ["4:5", "portrait"],
                  ["1.91:1", "wide"],
                ] as const
              ).map(([x, label]) => (
                <button
                  type="button"
                  className="ae-chip"
                  key={x}
                  aria-pressed={data.aspect === x}
                  onClick={() => update("aspect", x)}>
                  {t(label)}
                </button>
              ))}
            </fieldset>
            <div className="ae-toggles">
              {(
                ["showLogo", "showClass", "showDate", "firstNameOnly"] as const
              ).map((k) => (
                <label className="ae-toggle" key={k}>
                  <input
                    type="checkbox"
                    checked={data[k]}
                    onChange={(e) => update(k, e.target.checked)}
                  />
                  {t(k === "firstNameOnly" ? "firstName" : k)}
                </label>
              ))}
            </div>
          </div>

          {/* 4 · consent */}
          <div className="ae-group" data-kind="consent">
            <div className="ae-consent">
              <label className="ae-toggle">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {t("consent")}
              </label>
              <small className="ae-hint">{t("consentHelp")}</small>
              <label className="ae-field">
                <span className="ae-lab">{t("consentNote")}</span>
                <input
                  maxLength={500}
                  value={english.note}
                  onChange={(e) =>
                    setEnglish({ ...english, note: e.target.value })
                  }
                />
              </label>
            </div>
          </div>
        </section>

        <section className="ae-preview">
          <h2 className="ae-preview-title">{t("preview")}</h2>
          {sample && <p className="ae-sample">{t("sample")}</p>}
          <div
            className="ae-stage"
            ref={box}
            style={{ height: height * scale }}>
            <div
              style={{
                width,
                height,
                position: "relative",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}>
              <AchievementCard
                data={{ ...data, name: shownName }}
                cardRef={card}
              />
              {rendered?.key === versionKey && (
                <img
                  className="ae-raster ach-raster-preview"
                  src={rendered.url}
                  alt=""
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          <div className="ae-actions">
            <button
              type="button"
              className="ae-btn ae-btn-primary"
              disabled={busy}
              onClick={() => void download()}>
              {busy ? t("exporting") : t("download")}
            </button>
            <button
              type="button"
              className="ae-btn ae-btn-ghost"
              disabled={busy}
              onClick={() => void download(true)}>
              {t("copyImage")}
            </button>
          </div>

          {!sample && workflow && (
            <div className="ae-draft">
              <p className="ae-note">{t("draftConsentNotice")}</p>
              {editingDraft && (
                <button
                  type="button"
                  className="ae-btn ae-btn-ghost ae-btn-sm"
                  onClick={() => setEditingDraft(null)}>
                  {t("saveAsNew")}
                </button>
              )}
              <button
                type="button"
                className="ae-btn ae-btn-primary"
                disabled={busy}
                onClick={() => void saveDraft()}>
                {t("saveDraft")}
              </button>
            </div>
          )}
          {!workflow && <p className="ae-note">{t("draftUnavailable")}</p>}
          {message && (
            <p role="status" className="ae-msg">
              {message}
            </p>
          )}
        </section>
      </div>

      {!sample && (
        <AchievementManager
          enabled={workflow}
          revision={revision}
          onEdit={loadDraft}
        />
      )}
    </div>
  );
}
