import { SmsAutoProblems } from "@/components/admin/sms-auto-problems";
import SmsNewMessage from "@/components/admin/sms-new-message";
import {
  SmsRetryButton,
  SmsSettingsForm,
  SmsTemplateEditor,
  SmsTestForm,
} from "@/components/admin/sms-panel";
import { Link } from "@/i18n/navigation";
import { dashboardDigits } from "@/lib/admin/digits";
import {
  formatDate,
  formatDigits,
  formatNumber,
  formatTime,
} from "@/lib/admin/format";
import { requireAdminPage } from "@/lib/admin/guard";
import {
  createSmsProvider,
  smsProviderName,
  validateSmsCredentials,
} from "@/lib/center/sms-provider";
import {
  loadSmsSettings,
  loadSmsTemplates,
  monthSmsTotals,
} from "@/lib/center/sms-send";
import {
  classTemplateFits,
  SMS_VARIABLES,
  smsTemplateName,
  templateVariablesOf,
} from "@/lib/center/sms-templates";
import {
  CenterClassGroup,
  CenterSmsBatch,
  CenterSmsLog,
} from "@/models/CenterRecords";
import { User } from "@/models/User";
import mongoose from "mongoose";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type BatchRow = {
  _id: mongoose.Types.ObjectId;
  purpose: string;
  templateKey?: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  estimatedCost: number;
  quiet: boolean;
  scheduledFor?: Date;
  createdAt: Date;
};
type LogRow = {
  _id: mongoose.Types.ObjectId;
  batch?: mongoose.Types.ObjectId;
  phone: string;
  message: string;
  status: string;
  reason?: string;
  providerCode?: string;
  providerMessage?: string;
  segments: number;
  cost: number;
  templateKey?: string;
  sentAt?: Date;
  createdAt: Date;
  student?: { name: { bn: string; en?: string }; studentId: string };
};

const STATUSES = ["sent", "failed", "skipped", "queued"] as const;

/**
 * The SMS centre (R2), in three cards — and the split is by *who is reading*, not by topic.
 *
 * **Send & balance** is the daily card: what is left to send with, what this month cost, the message to
 * a class, a test to the operator's own number, the template bodies and the settings that shape a send.
 * **History** is the audit card: who was sent what, whether it arrived, and what each one cost.
 * **Connection** is the mechanic's card: which provider answers, whether its credentials are present,
 * whether sending is switched on at all, the automatic sends that did not go out and the retry for them.
 *
 * Two rules the cards obey:
 * · **They are cards, not hidden tabs.** Every panel stays painted, because the credential check and the
 *   connection proof (R2.6, R2.7) read these headings and definitions from the served page.
 * · **The only `dl` on the page is the diagnostic one.** The balance in the daily card is a number a
 *   person reads, not a definition row.
 *
 * Nothing here exposes a credential — only the provider's NAME and whether it is configured. The balance
 * is fetched server-side and rendered as a number.
 */
export default async function SmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    template?: string;
    q?: string;
    batch?: string;
  }>;
}) {
  const actor = await requireAdminPage();
  const { locale } = await params;
  const query = await searchParams;
  const bn = locale !== "en";
  const digits = await dashboardDigits(actor.id);

  // The session user carries no phone, so the test-message form reads the operator's own number
  // from the record — "send a test SMS to my own number" must not mean retyping it.
  const [settings, templates, totals, me, groups] = await Promise.all([
    loadSmsSettings(),
    loadSmsTemplates(),
    monthSmsTotals(),
    User.findById(actor.id).select("phone").lean<{ phone?: string } | null>(),
    CenterClassGroup.find({ active: true })
      .select("name")
      .sort({ academicYear: -1, order: 1 })
      .limit(200)
      .lean<
        { _id: mongoose.Types.ObjectId; name: { bn: string; en?: string } }[]
      >(),
  ]);

  // Live balance. The mock provider answers instantly and without a network call, so this is safe
  // in test mode; bulksmsbd performs the documented getBalanceApi call. Either way only the number
  // is rendered — never a credential.
  const providerName = smsProviderName();
  const credentials = validateSmsCredentials();
  const writeGate = process.env.CENTER_SMS_WRITE_ENABLED === "true";
  let balance: { ok: true; balance: number } | { ok: false; code?: string } = {
    ok: false,
  };
  try {
    balance = await createSmsProvider().balance();
  } catch {
    balance = { ok: false };
  }

  const status = STATUSES.includes(query.status as (typeof STATUSES)[number])
    ? (query.status as (typeof STATUSES)[number])
    : undefined;
  const template = templates.some((t) => t.key === query.template)
    ? query.template
    : undefined;
  const search = String(query.q || "")
    .trim()
    .slice(0, 80);
  /* Group 3: one batch's own messages. An exam's result send links straight here, so the proof of what
     went to those guardians is the list on screen rather than a search through every send there ever was. */
  const batch = mongoose.isValidObjectId(String(query.batch || ""))
    ? String(query.batch)
    : undefined;
  const filter: mongoose.FilterQuery<LogRow> = {};
  if (batch)
    filter.batch = new mongoose.Types.ObjectId(
      batch,
    ) as unknown as LogRow["batch"];
  if (status) filter.status = status;
  if (template) filter.templateKey = template;
  if (search)
    filter.$or = [
      { phone: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } },
      {
        "student.name.bn": {
          $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        },
      },
    ];

  const [logs, batches] = await Promise.all([
    CenterSmsLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("student", "name studentId")
      .lean<LogRow[]>(),
    CenterSmsBatch.find({})
      .sort({ createdAt: -1 })
      .limit(30)
      .lean<BatchRow[]>(),
  ]);

  const ts = await getTranslations("sms");
  /* A stored enum value is data, but the operator reads a word: every status and every template name
     goes through the catalog, and a value this build does not know is shown as itself rather than as a
     key path (B.3: no raw "partial" or "payment_receipt" on a Bangla page). */
  const TEMPLATE_NAMES = ts.raw("templates") as Record<string, string>;
  const BATCH_STATUS_NAMES = ts.raw("batchStatuses") as Record<string, string>;
  const LOG_STATUS_NAMES = ts.raw("statuses") as Record<string, string>;
  const purposeLabel = (value: string): string =>
    TEMPLATE_NAMES[value] || value;
  const statusLabel = (names: Record<string, string>, value: string): string =>
    names[value] || value;
  /* A log row's `reason` is one of three things: why a recipient was skipped, why the provider could
     not be answered, or a provider code — and a code is left as itself. */
  const REASON_NAMES = ts.raw("reasons") as Record<string, string>;
  const SKIP_NAMES = ts.raw("skip") as Record<string, string>;
  const reasonLabel = (value: string): string =>
    REASON_NAMES[value] || SKIP_NAMES[value] || value;
  const language: "bn" | "en" = bn ? "bn" : "en";
  const currency = await (await getTranslations("common"))("currency");
  const cost = (value: number) =>
    `${currency}${formatNumber(Math.round(value * 100) / 100, digits)}`;
  /* This month's totals, as six tiles rather than six definition rows: they are a summary a person
     glances at, and the page's one `dl` belongs to the connection card that reads it aloud. */
  const monthTiles: [string, string][] = [
    [ts("page.sent"), formatNumber(totals.sent, digits)],
    [ts("page.failed"), formatNumber(totals.failed, digits)],
    [ts("page.queued"), formatNumber(totals.queued, digits)],
    [ts("page.skipped"), formatNumber(totals.skipped, digits)],
    [ts("page.segments"), formatNumber(totals.segments, digits)],
    [ts("page.cost"), cost(totals.cost)],
  ];

  return (
    <div className="smx">
      <header className="smx-head">
        <h1 className="smx-title">{ts("page.sms")}</h1>
        <p className="smx-lede">{ts("page.lede")}</p>
      </header>

      {/* ── Card 1 · the daily work: what is left to send with, and the sending itself ── */}
      <section className="smx-card" data-sms-card="send">
        <div className="smx-card-head">
          <h2>{ts("page.cardSend")}</h2>
          <p className="smx-help">{ts("page.cardSendNote")}</p>
        </div>
        <div className="smx-card-body">
          <div
            className="smx-credit"
            data-tone={balance.ok ? "good" : "warn"}
            data-sms-credit="">
            <span>{ts("page.creditLeft")}</span>
            <strong>
              {balance.ok
                ? formatNumber(balance.balance, digits)
                : ts("page.balanceUnreadable")}
            </strong>
            <small>{ts("page.creditNote")}</small>
          </div>

          <section className="smx-sec">
            <div className="smx-sec-head">
              <h2>{ts("page.month")}</h2>
            </div>
            <div className="smx-sec-body">
              <ul className="smx-tiles">
                {monthTiles.map(([label, value]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </li>
                ))}
              </ul>
              <p className="smx-help">{ts("page.costNote")}</p>
            </div>
          </section>

          <section className="smx-sec">
            <div className="smx-sec-head">
              <h2>{ts("page.newMessage")}</h2>
            </div>
            <div className="smx-sec-body">
              <SmsNewMessage
                en={!bn}
                institutePhone={settings.institutePhone}
                classes={groups.map((group) => ({
                  id: String(group._id),
                  name: (bn ? group.name.bn : group.name.en) || group.name.bn,
                }))}
                templates={templates.filter(
                  (row) =>
                    (row.active || row.key === "custom") &&
                    classTemplateFits(templateVariablesOf(row.body)),
                )}
              />
            </div>
          </section>

          <SmsTestForm locale={locale} ownPhone={me?.phone || ""} />

          <section className="smx-sec">
            <div className="smx-sec-head">
              <h2>{ts("page.templates")}</h2>
            </div>
            <div className="smx-sec-body">
              <p className="smx-help">
                {ts("page.chipsNote")}{" "}
                <code>{[...SMS_VARIABLES].map((v) => `{${v}}`).join(" ")}</code>
              </p>
              <div className="smp-tpl-list">
                {templates.map((template) => (
                  <SmsTemplateEditor
                    key={template.key}
                    locale={locale}
                    template={template}
                  />
                ))}
              </div>
            </div>
          </section>

          <SmsSettingsForm
            locale={locale}
            settings={settings}
            providerName={providerName}
            balanceOk={balance.ok}
            balance={balance.ok ? balance.balance : null}
          />
        </div>
      </section>

      {/* ── Card 2 · what went out, to whom, and whether it arrived ── */}
      <section className="smx-card" data-sms-card="history">
        <div className="smx-card-head">
          <h2>{ts("page.cardHistory")}</h2>
          <p className="smx-help">{ts("page.cardHistoryNote")}</p>
        </div>
        <div className="smx-card-body">
          <section className="smx-sec">
            <div className="smx-sec-head">
              <h2>{ts("page.history")}</h2>
            </div>
            <div className="smx-sec-body">
              {/* Group 3: a batch of one send, opened from the exam that produced it. The list says so, and
                  offers the way back to every message. */}
              {batch && (
                <p className="smx-scope" data-sms-batch-filter>
                  {ts("page.batchFilter", {
                    count: formatNumber(logs.length, digits),
                  })}{" "}
                  <Link className="smx-link" href="/admin/sms">
                    {ts("page.batchFilterClear")}
                  </Link>
                </p>
              )}
              <form method="get" className="smx-filter">
                <label className="smp-field">
                  <span>{ts("page.status")}</span>
                  <select name="status" defaultValue={status || ""}>
                    <option value="">{ts("page.all")}</option>
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {ts(`statuses.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="smp-field">
                  <span>{ts("page.template")}</span>
                  <select name="template" defaultValue={template || ""}>
                    <option value="">{ts("page.all")}</option>
                    {templates.map((row) => (
                      <option key={row.key} value={row.key}>
                        {smsTemplateName(TEMPLATE_NAMES, row.name)}
                      </option>
                    ))}
                    <option value="test">{ts("page.test")}</option>
                  </select>
                </label>
                <label className="smp-field">
                  <span>{ts("page.search")}</span>
                  <input
                    name="q"
                    defaultValue={search}
                    maxLength={80}
                    placeholder={ts("page.searchPlaceholder")}
                  />
                </label>
                <button className="smp-btn smp-btn-primary">
                  {ts("page.filter")}
                </button>
              </form>
              {logs.length === 0 && (
                <p className="smx-empty">{ts("page.noRecords")}</p>
              )}
              {logs.length > 0 && (
                <p className="smx-help">{ts("page.costColumnNote")}</p>
              )}
              {logs.length > 0 && (
                <div className="smx-table-wrap">
                  <table className="smx-table">
                    <thead>
                      <tr>
                        <th>{ts("page.when")}</th>
                        <th>{ts("page.student")}</th>
                        <th>{ts("page.number")}</th>
                        <th>{ts("page.message")}</th>
                        <th>{ts("page.status")}</th>
                        <th>{ts("page.segmentsShort")}</th>
                        <th>{ts("page.cost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={String(log._id)}>
                          <td data-label={ts("page.when")}>
                            <div>
                              {formatDate(
                                log.sentAt || log.createdAt,
                                digits,
                                language,
                              )}
                              <br />
                              <small>
                                {formatTime(
                                  log.sentAt || log.createdAt,
                                  digits,
                                  language,
                                )}
                              </small>
                            </div>
                          </td>
                          <td data-label={ts("page.student")}>
                            {log.student
                              ? `${log.student.name.bn} · ${log.student.studentId}`
                              : "—"}
                          </td>
                          <td data-label={ts("page.number")}>
                            {formatDigits(log.phone, digits)}
                          </td>
                          <td
                            className="smx-msg"
                            data-label={ts("page.message")}>
                            <div>
                              <span title={log.message}>
                                {log.message.slice(0, 90)}
                                {log.message.length > 90 ? "…" : ""}
                              </span>
                              {log.providerMessage && (
                                <small>{log.providerMessage}</small>
                              )}
                              {log.reason && (
                                <small>
                                  {ts("page.reason")}: {reasonLabel(log.reason)}
                                </small>
                              )}
                            </div>
                          </td>
                          <td data-label={ts("page.status")}>
                            <span
                              className="smx-badge"
                              data-status={log.status}>
                              {statusLabel(LOG_STATUS_NAMES, log.status)}
                            </span>
                          </td>
                          <td data-label={ts("page.segmentsShort")}>
                            {formatNumber(log.segments, digits)}
                          </td>
                          <td data-label={ts("page.cost")}>{cost(log.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {/* ── Card 3 · the mechanic's card: the connection, the sends that did not go out, the retry ──
          An automatic send that did not go out leads this card on purpose: it is the one thing here the
          operator must act on, and the retry beside it is the action. */}
      <section className="smx-card" data-sms-card="diagnostic">
        <div className="smx-card-head">
          <h2>{ts("page.cardDiagnostic")}</h2>
          <p className="smx-help">{ts("page.cardDiagnosticNote")}</p>
        </div>
        <div className="smx-card-body">
          <SmsAutoProblems digits={digits} />

          <section className="smx-sec">
            <div className="smx-sec-head">
              <h2>{ts("page.connection")}</h2>
            </div>
            <div className="smx-sec-body">
              <dl className="smx-defs">
                <div>
                  <dt>{ts("page.provider")}</dt>
                  <dd>
                    <code>{providerName}</code>{" "}
                    {providerName === "mock" && (
                      <span className="smx-badge">
                        {ts("page.mockSendsNothing")}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{ts("page.credentials")}</dt>
                  <dd>
                    {credentials.ok ? (
                      <span className="smx-badge smx-badge-ok">
                        {ts("page.configured")}
                      </span>
                    ) : (
                      <span className="smx-badge smx-badge-bad">
                        {ts("page.missing")}: {credentials.missing.join(", ")}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{ts("page.sendingGate")}</dt>
                  <dd>
                    {writeGate ? (
                      <span className="smx-badge smx-badge-ok">
                        {ts("page.gateOn")}
                      </span>
                    ) : (
                      <span className="smx-badge smx-badge-bad">
                        {ts("page.gateOff")}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{ts("page.balance")}</dt>
                  <dd>
                    {balance.ok
                      ? formatNumber(balance.balance, digits)
                      : ts("page.balanceUnreadable")}
                    {balance.ok === false && "code" in balance && balance.code
                      ? ` (${balance.code})`
                      : ""}
                  </dd>
                </div>
              </dl>
              <p className="smx-help">{ts("page.credentialsNote")}</p>
            </div>
          </section>

          <section className="smx-sec">
            <div className="smx-sec-head">
              <h2>{ts("page.batches")}</h2>
            </div>
            <div className="smx-sec-body">
              {batches.length === 0 && (
                <p className="smx-empty">{ts("page.noBatches")}</p>
              )}
              {batches.length > 0 && (
                <div className="smx-table-wrap">
                  <table className="smx-table">
                    <thead>
                      <tr>
                        <th>{ts("page.when")}</th>
                        <th>{ts("page.purpose")}</th>
                        <th>{ts("page.status")}</th>
                        <th>{ts("page.recipients")}</th>
                        <th>{ts("page.sentFailed")}</th>
                        <th>{ts("page.cost")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch) => (
                        <tr key={String(batch._id)}>
                          <td data-label={ts("page.when")}>
                            <div>
                              {formatDate(batch.createdAt, digits, language)}
                              <br />
                              <small>
                                {formatTime(batch.createdAt, digits, language)}
                              </small>
                              {batch.quiet && (
                                <>
                                  <br />
                                  <small>{ts("page.queuedByQuietHours")}</small>
                                </>
                              )}
                              {batch.scheduledFor && (
                                <>
                                  <br />
                                  <small>
                                    {ts("page.scheduled")}:{" "}
                                    {formatTime(
                                      batch.scheduledFor,
                                      digits,
                                      language,
                                    )}
                                  </small>
                                </>
                              )}
                            </div>
                          </td>
                          <td data-label={ts("page.purpose")}>
                            {purposeLabel(batch.templateKey || batch.purpose)}
                          </td>
                          <td data-label={ts("page.status")}>
                            <span
                              className="smx-badge"
                              data-status={batch.status}>
                              {statusLabel(BATCH_STATUS_NAMES, batch.status)}
                            </span>
                          </td>
                          <td data-label={ts("page.recipients")}>
                            {formatNumber(batch.recipientCount, digits)}
                          </td>
                          <td data-label={ts("page.sentFailed")}>
                            {formatNumber(batch.sentCount, digits)} /{" "}
                            {formatNumber(batch.failedCount, digits)}
                            {batch.skippedCount > 0 && (
                              <small>
                                {" "}
                                · {formatNumber(
                                  batch.skippedCount,
                                  digits,
                                )}{" "}
                                {ts("page.skippedUnit")}
                              </small>
                            )}
                          </td>
                          <td data-label={ts("page.cost")}>
                            {cost(batch.estimatedCost)}
                          </td>
                          <td>
                            {batch.failedCount > 0 && (
                              <SmsRetryButton
                                locale={locale}
                                batchId={String(batch._id)}
                                failed={batch.failedCount}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
