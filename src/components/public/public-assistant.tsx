"use client";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Eraser,
  GraduationCap,
  Info,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function PublicAssistant({
  locale,
  enabled,
}: {
  locale: string;
  enabled: boolean;
}) {
  const bn = locale === "bn",
    pub = useTranslations("publicPages.assistant");
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null),
    log = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  /* Small addition: keep the newest message in view while the answer streams in. */
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(question: string) {
    if (!enabled || busy || !consent || !question.trim()) return;
    const history: Message[] = [
      ...messages.filter((m) => m.content),
      { role: "user" as const, content: question.trim() },
    ].slice(-8);
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setBusy(true);
    const c = new AbortController();
    controller.current = c;
    let output = "";
    try {
      const r = await fetch("/api/public-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          locale: bn ? "bn" : "en",
          consent: true,
        }),
        signal: c.signal,
      });
      if (!r.ok || !r.body) {
        let code = "";
        try {
          code = (await r.json())?.error || "";
        } catch {}
        throw Error(
          r.status === 429
            ? code === "daily"
              ? "daily"
              : "rate"
            : r.status === 503 && code === "busy"
              ? "busy"
              : "unavailable",
        );
      }
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        size = 0;
      function frame(s: string) {
        for (const line of s.split("\n"))
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const obj = JSON.parse(data),
                delta = obj?.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                output += delta;
                setMessages([
                  ...history,
                  { role: "assistant", content: output },
                ]);
              }
            } catch {}
          }
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 256000) {
          await reader.cancel();
          throw Error("unavailable");
        }
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(
          /\r\n/g,
          "\n",
        );
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        frames.forEach(frame);
      }
      buffer += decoder.decode();
      if (buffer.trim()) frame(buffer);
      if (!output) throw Error("unavailable");
    } catch (e) {
      if (!output) setMessages(history);
      setError(
        e instanceof Error && e.message === "rate"
          ? pub("rateLimited")
          : e instanceof Error && e.message === "daily"
            ? pub("dailyLimit")
            : e instanceof Error && e.message === "busy"
              ? pub("busy")
              : pub("noResponse"),
      );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  return (
    <section className="pas">
      <div className="pas-head">
        <span className="pas-head-icon" aria-hidden="true">
          <Bot size={28} />
        </span>
        <div>
          <h2>{pub("title")}</h2>
          <p>{pub("intro")}</p>
        </div>
      </div>

      {!enabled && (
        <div className="pas-notice" role="status">
          <Info size={18} aria-hidden="true" />
          <span>{pub("notEnabled")}</span>
        </div>
      )}

      <p className="pas-privacy">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>{pub("privacy")}</span>
      </p>

      <label className="pas-consent consent-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={!enabled}
        />
        <span>{pub("consent")}</span>
      </label>

      <div className="pas-log public-chat-log" ref={log} aria-live="polite">
        {messages.map((m, i) => (
          <div
            className={`pas-msg chat-bubble ${m.role}`}
            data-role={m.role}
            key={i}>
            <span className="pas-avatar" aria-hidden="true">
              {m.role === "user" ? <User size={17} /> : <Bot size={18} />}
            </span>
            <div className="pas-bubble">
              <strong className="pas-who">
                {m.role === "user" ? pub("you") : "AI"}:{" "}
              </strong>
              {m.content ? (
                <span className="pas-text">{m.content}</span>
              ) : (
                <span className="pas-typing">
                  <span className="pas-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  {pub("thinking")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="pas-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <form
        className="pas-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}>
        <label className="pas-label" htmlFor="public-ai-question">
          {pub("placeholder")}
        </label>
        <div className="pas-field">
          <textarea
            className="pas-textarea"
            id="public-ai-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1800}
            rows={3}
            disabled={!enabled || busy}
          />
          <span className="pas-count" aria-hidden="true">
            {input.length} / 1800
          </span>
        </div>
        <div className="pas-actions public-chat-actions">
          <button
            className="pas-btn pas-btn-primary"
            disabled={!enabled || busy || !consent || !input.trim()}>
            <Send size={17} aria-hidden="true" />
            {pub("send")}
          </button>
          <button
            className="pas-btn pas-btn-quiz"
            type="button"
            disabled={!enabled || busy || !consent}
            onClick={() => void send(pub("quizPrompt"))}>
            <Sparkles size={17} aria-hidden="true" />
            {pub("quizLabel")}
          </button>
          <button
            className="pas-btn pas-btn-clear"
            type="button"
            disabled={busy || !messages.length}
            onClick={() => {
              setMessages([]);
              setError("");
            }}>
            <Eraser size={17} aria-hidden="true" />
            {pub("clear")}
          </button>
        </div>
      </form>

      <p className="pas-foot">
        <a className="pas-link" href={`/${bn ? "bn" : "en"}/practice-tests`}>
          <GraduationCap size={18} aria-hidden="true" />
          {pub("teacherTest")}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}
