import { AvailabilityNotice } from "@/components/forms/availability-notice";
import { Link } from "@/i18n/navigation";
import { signIn } from "@/lib/auth";
import { authServicesConfigured } from "@/lib/service-status";
import {
  AlertTriangle,
  ArrowRight,
  KeyRound,
  Lock,
  LogIn,
  User,
} from "lucide-react";
import { AuthError, CredentialsSignin } from "next-auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("common");
  const recovery = await getTranslations("recovery");

  async function login(formData: FormData) {
    "use server";
    const destination = formData.get("callbackUrl");
    const safe =
      typeof destination === "string" &&
      destination.startsWith(`/${locale}/`) &&
      !destination.startsWith("//")
        ? destination
        : `/${locale}/portal`;
    try {
      await signIn("credentials", {
        identifier: formData.get("identifier"),
        password: formData.get("password"),
        redirectTo: safe,
      });
    } catch (error) {
      if (error instanceof AuthError)
        redirect(
          `/${locale}/login?error=${error instanceof CredentialsSignin && error.code === "rate_limited" ? "busy" : "credentials"}`,
        );
      throw error;
    }
  }

  return (
    <section className="lgn">
      <div className="lgn-card">
        <div className="lgn-head">
          <span className="lgn-badge" aria-hidden="true">
            <KeyRound size={28} />
          </span>
          <h1>{t("loginTitle")}</h1>
          <p>{t("loginDesc")}</p>
        </div>

        {query.error && (
          <div className="lgn-alert" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              {t(query.error === "busy" ? "loginBusy" : "loginError")}
            </span>
          </div>
        )}

        {authServicesConfigured() ? (
          <form className="lgn-form" action={login}>
            <input
              type="hidden"
              name="callbackUrl"
              value={query.callbackUrl || ""}
            />

            <div className="lgn-field">
              <label className="lgn-label" htmlFor="identifier">
                {t("identifier")}
              </label>
              <span className="lgn-input-wrap">
                <User size={19} aria-hidden="true" />
                <input
                  className="lgn-input"
                  id="identifier"
                  name="identifier"
                  required
                  autoComplete="username"
                />
              </span>
            </div>

            <div className="lgn-field">
              <label className="lgn-label" htmlFor="password">
                {t("password")}
              </label>
              <span className="lgn-input-wrap">
                <Lock size={19} aria-hidden="true" />
                <input
                  className="lgn-input"
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="current-password"
                />
              </span>
            </div>

            <button className="lgn-btn">
              <LogIn size={19} aria-hidden="true" />
              {t("login")}
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            <div className="lgn-foot">
              <Link className="lgn-link" href="/forgot-password">
                {recovery("forgotTitle")}
              </Link>
            </div>
          </form>
        ) : (
          <div className="lgn-notice">
            <AvailabilityNotice login />
          </div>
        )}
      </div>
    </section>
  );
}
