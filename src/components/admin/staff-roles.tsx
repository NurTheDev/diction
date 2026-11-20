"use client";
import type { ActionState } from "@/actions/admin";
import { setRoleDisabled } from "@/actions/roles";
import { useTranslations } from "next-intl";
import { useActionState, useCallback, useEffect, useState } from "react";

type StaffRole =
  | "superadmin"
  | "admin"
  | "staff"
  | "content_editor"
  | "exam_manager";

type Staff = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
};

export function StaffRoles() {
  const t = useTranslations("staffRoles"),
    roleNames = useTranslations("adminRedesign");
  const [items, setItems] = useState<Staff[]>([]),
    [disabledRoles, setDisabledRoles] = useState<string[]>([]),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);

  const title = (r: StaffRole) =>
    ({
      superadmin: roleNames("role.superadmin"),
      admin: roleNames("role.admin"),
      staff: roleNames("role.staff"),
      content_editor: roleNames("role.content_editor"),
      exam_manager: roleNames("role.exam_manager"),
    })[r];

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/roles", { cache: "no-store" });
      if (!r.ok) throw Error();
      const data = await r.json();
      setItems(data.items);
      setDisabledRoles(data.disabledRoles || []);
    } catch {
      setMsg(t("listLoadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    if (d.get("password") !== d.get("confirm")) {
      setMsg(t("passwordsMismatch"));
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: d.get("name"),
          email: d.get("email"),
          password: d.get("password"),
          role: d.get("role"),
        }),
      });
      if (!r.ok) {
        const result = await r.json();
        throw Error(result.error);
      }
      form.reset();
      await load();
      setMsg(t("accountCreated"));
    } catch (e) {
      setMsg(
        e instanceof Error && e.message === "duplicate"
          ? t("emailTaken")
          : t("createFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function change(item: Staff, role: StaffRole, active: boolean) {
    if (role === "superadmin") return;
    if (!confirm(t("confirmPermissions"))) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/api/admin/roles/${item.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, active }),
      });
      if (!r.ok) throw Error();
      await load();
      setMsg(t("changeSaved"));
    } catch {
      setMsg(t("changeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const guideRoles: StaffRole[] = [
    "superadmin",
    "admin",
    "staff",
    "content_editor",
    "exam_manager",
  ];

  return (
    <div className="stf" aria-busy={busy}>
      <header className="stf-head">
        <h1>{t("title")}</h1>
      </header>

      <div className="stf-guide">
        {guideRoles.map((r) => (
          <div className="stf-role-card" data-role={r} key={r}>
            <strong>{title(r)}</strong>
            <p>{t(`help.${r}`)}</p>
          </div>
        ))}
      </div>
      <div className="stf-notice" role="note">
        {t("rolesNote")}
      </div>

      <form className="stf-card" onSubmit={create}>
        <h2>{t("formTitle")}</h2>
        <div className="stf-grid">
          <label className="stf-field">
            {t("name")}
            <input name="name" minLength={2} maxLength={120} required />
          </label>
          <label className="stf-field">
            {t("email")}
            <input
              name="email"
              type="email"
              maxLength={254}
              required
              autoComplete="off"
            />
          </label>
          <label className="stf-field stf-span-2">
            {t("role")}
            <select name="role" defaultValue="content_editor">
              <option value="staff">{title("staff")}</option>
              <option value="content_editor">{title("content_editor")}</option>
              <option value="exam_manager">{title("exam_manager")}</option>
              <option value="admin">{title("admin")}</option>
            </select>
          </label>
          <label className="stf-field">
            {t("initialPassword")}
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="stf-field">
            {t("confirmPassword")}
            <input
              name="confirm"
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              required
            />
          </label>
          <small className="stf-hint stf-span-2">{t("passwordHelp")}</small>
        </div>
        <div className="stf-form-foot">
          <button className="stf-btn stf-btn-primary" disabled={busy}>
            {t("createAccount")}
          </button>
        </div>
      </form>

      <p role="status" aria-live="polite" className="stf-status">
        {msg}
      </p>

      <RoleSection disabledRoles={disabledRoles} onDone={() => void load()} />

      <div className="stf-list-head">
        <h2>{t("accountsTitle")}</h2>
        {items.length > 0 && <span className="stf-count">{items.length}</span>}
      </div>
      <div className="stf-list">
        {items.map((i) => (
          <article
            className="stf-account"
            data-role={i.role}
            data-active={i.active ? "true" : "false"}
            key={i.id}>
            <div className="stf-avatar" aria-hidden="true">
              {Array.from(i.name || "?")[0]}
            </div>
            <div className="stf-main">
              <strong className="stf-name">{i.name}</strong>
              <p className="stf-email">{i.email}</p>
              <div className="stf-tags">
                <span className="stf-chip">{title(i.role)}</span>
                <span
                  className="stf-badge"
                  data-state={i.active ? "on" : "off"}>
                  {i.active ? t("active") : t("disabled")}
                </span>
              </div>
            </div>
            {i.role !== "superadmin" && (
              <StaffEdit
                item={i}
                busy={busy}
                onSave={(role, active) => void change(i, role, active)}
              />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function RoleSection({
  disabledRoles,
  onDone,
}: {
  disabledRoles: string[];
  onDone: () => void;
}) {
  const t = useTranslations("staffRoles"),
    roleNames = useTranslations("adminRedesign");
  const roles: ["admin", "staff", "content_editor", "exam_manager"] = [
    "admin",
    "staff",
    "content_editor",
    "exam_manager",
  ];
  /* The four role ids are literals in the array below, so this reads the same group the header chip
     reads: one vocabulary for the five roles, whichever screen names them. */
  const title = (r: string) => roleNames(`role.${r}`);
  return (
    <section className="stf-panel">
      <div className="stf-panel-head">
        <h2>{t("disableRoleTitle")}</h2>
      </div>
      <div className="stf-panel-body">
        <p>{t("disableRoleNote")}</p>
        <div className="stf-toggles">
          {roles.map((role) => (
            <RoleToggle
              key={role}
              role={role}
              disabled={disabledRoles.includes(role)}
              title={title(role)}
              onDone={onDone}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RoleToggle({
  role,
  disabled,
  title,
  onDone,
}: {
  role: string;
  disabled: boolean;
  title: string;
  onDone: () => void;
}) {
  const t = useTranslations("staffRoles");
  const [state, action, pending] = useActionState(setRoleDisabled, {
    status: "idle",
  } as ActionState);
  // Depend on the whole state object: status stays 'ok' across two successful toggles, and a
  // status-only dependency would skip the reload after the second one (CI run 43285236170).
  useEffect(() => {
    if (state.status === "ok") onDone();
  }, [state]);
  return (
    <form
      action={action}
      className="stf-toggle"
      data-role={role}
      data-state={disabled ? "off" : "on"}>
      <input type="hidden" name="role" value={role} />
      <input
        type="hidden"
        name="disabled"
        value={disabled ? "false" : "true"}
      />
      <strong>{title}</strong>
      <span className="stf-badge" data-state={disabled ? "off" : "on"}>
        {disabled ? t("disabled") : t("active")}
      </span>
      <button
        className={`stf-btn ${disabled ? "stf-btn-ok" : "stf-btn-danger"}`}
        disabled={pending}>
        {disabled ? t("enable") : t("disable")}
      </button>
      {state.status === "error" && (
        <span className="stf-toggle-error">{t("failed")}</span>
      )}
    </form>
  );
}

function StaffEdit({
  item,
  busy,
  onSave,
}: {
  item: Staff;
  busy: boolean;
  onSave: (role: StaffRole, active: boolean) => void;
}) {
  const t = useTranslations("staffRoles"),
    roleNames = useTranslations("adminRedesign");
  const [role, setRole] = useState(item.role),
    [active, setActive] = useState(item.active);
  useEffect(() => {
    setRole(item.role);
    setActive(item.active);
  }, [item.role, item.active]);
  return (
    <form
      className="stf-edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(role, active);
      }}>
      <label>
        <span className="stf-sr">{t("role")}</span>
        <select
          className="stf-select"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}>
          <option value="admin">{roleNames("role.admin")}</option>
          <option value="staff">{roleNames("role.staff")}</option>
          <option value="content_editor">
            {roleNames("role.content_editor")}
          </option>
          <option value="exam_manager">{roleNames("role.exam_manager")}</option>
        </select>
      </label>
      <label className="stf-switch">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        <span>{t("active")}</span>
      </label>
      <button className="stf-btn stf-btn-ghost" disabled={busy}>
        {t("saveChanges")}
      </button>
    </form>
  );
}
