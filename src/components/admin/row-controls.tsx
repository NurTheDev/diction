"use client";
import { canArchiveKind, type RecycleKind } from "@/lib/admin/recycle-kinds";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ArchiveRow } from "./archive-row";
import { DeleteRow } from "./delete-row";

/**
 * The destructive controls for one list row (R1 §E4/§E6): Archive for staff and above, Delete
 * (30 days in the Recycle Bin, with Undo) for admin and super admin. Both server actions re-check
 * the role, so these flags only decide what is rendered.
 */
export function RowControls({
  kind,
  id,
  name,
  canDelete,
  canArchive,
  onDone,
}: {
  kind: RecycleKind;
  id: string;
  name: string;
  canDelete: boolean;
  canArchive: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("nav");
  const archivable = canArchive && canArchiveKind(kind);

  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  // While the More menu is open: a click elsewhere or Escape folds it away.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (menu.current) menu.current.open = false;
    };
    // A confirm dialog lives inside the menu; never fold the menu out from under it.
    const dialogOpen = () => !!menu.current?.querySelector("dialog[open]");
    const onPointer = (event: PointerEvent) => {
      if (dialogOpen()) return;
      if (menu.current && !menu.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dialogOpen()) return;
      close();
      menu.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing this role may do: no empty wrapper, no empty "More" menu.
  if (!archivable && !canDelete) return null;

  const controls = (
    <>
      {archivable && <ArchiveRow kind={kind} id={id} onDone={onDone} />}
      {canDelete && (
        <DeleteRow
          kind={kind}
          id={id}
          name={name}
          canArchive={archivable}
          onDone={onDone}
        />
      )}
    </>
  );

  /* Desk widths show the destructive pair outright; a phone row is a card, and a card keeps its
     Edit button visible and folds the rest into one labelled More menu. */
  return (
    <div className="rc row-controls">
      <span className="rc-direct">{controls}</span>
      <details
        ref={menu}
        className="rc-menu"
        onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="rc-summary">{t("more")}</summary>
        <div className="rc-menu-body">{controls}</div>
      </details>
    </div>
  );
}
