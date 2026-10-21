"use client";

import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { backendBaseUrl } from "@/lib/backend-api";

type AuthFormProps = { mode: "login" | "register"; expired?: boolean };
type FieldErrors = Partial<Record<"email" | "password" | "confirm", string>>;

export function AuthForm({ mode, expired = false }: AuthFormProps) {
  const id = useId();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (mode === "register" && password.length < 10) next.password = "Use at least 10 characters.";
    if (mode === "login" && !password) next.password = "Enter your password.";
    if (mode === "register" && password !== confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const apiBase = backendBaseUrl();
    if (apiBase !== null) {
      try {
        const response = await fetch(`${apiBase}/api/auth/${mode === "register" ? "register" : "login"}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
        if (!response.ok) { const body = await response.json().catch(() => null); setErrors({ password: body?.error?.message ?? "We couldn't sign you in. Check your details and try again." }); setSubmitting(false); return; }
        localStorage.setItem("prepkit-profile", JSON.stringify({ email: email.trim().toLowerCase(), name: email.trim().split("@")[0].replace(/[._-]+/g, " ") }));
        router.push("/"); return;
      } catch { setErrors({ password: `Can't reach the backend at ${apiBase}. Start the API and PostgreSQL, then try again.` }); setSubmitting(false); return; }
    }
    setErrors({ password: "Authentication is not configured. Set NEXT_PUBLIC_API_BASE_URL and start the backend." });
    setSubmitting(false);
  }

  const fieldError = (key: keyof FieldErrors, errorId: string) => errors[key] ? <p id={errorId} className="mt-1 text-sm text-red-700" role="alert" aria-live="assertive">{errors[key]}</p> : null;

  return (
    <main className="grid min-h-dvh bg-white md:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
      <aside className="flex min-h-[220px] flex-col justify-between bg-[#18221f] px-7 py-8 text-white md:min-h-dvh md:px-12 md:py-12">
        <a href="/login" className="text-lg font-semibold tracking-tight">PrepKit</a>
        <div className="max-w-md py-7">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#a8c5b7]">Interview preparation, made personal</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight md:text-5xl">Walk into the room ready.</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">Turn a role into a clear plan, thoughtful practice, and answers that sound like you.</p>
        </div>
        <p className="hidden font-mono text-xs text-white/60 md:block">A quieter way to prepare.</p>
      </aside>
      <section className="flex items-center justify-center px-6 py-10 md:px-12">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#0f6b63]">{mode === "login" ? "Welcome back" : "Get started"}</p>
          <h2 className="mt-3 text-3xl font-semibold text-ink">{mode === "login" ? "Sign in" : "Create your account"}</h2>
          {expired ? <p role="status" aria-live="polite" className="mt-5 border-l-4 border-[#c48a28] bg-[#fff7e7] px-4 py-3 text-sm text-[#5e430f]">Your session expired. Sign in to continue.</p> : null}
          <form className="mt-7 flex flex-col gap-5" noValidate onSubmit={submit}>
            <div>
              <Field id={`${id}-email`} label="Email">
                <TextInput id={`${id}-email`} type="email" autoComplete="email" value={email} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-error` : undefined} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined })); }} />
              </Field>
              {fieldError("email", `${id}-email-error`)}
            </div>
            <div>
              <Field id={`${id}-password`} label="Password">
                <TextInput id={`${id}-password`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? `${id}-password-error` : undefined} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); }} />
              </Field>
              {fieldError("password", `${id}-password-error`)}
            </div>
            {mode === "register" ? <div>
              <Field id={`${id}-confirm`} label="Confirm password">
                <TextInput id={`${id}-confirm`} type="password" autoComplete="new-password" value={confirm} aria-invalid={Boolean(errors.confirm)} aria-describedby={errors.confirm ? `${id}-confirm-error` : undefined} onChange={(event) => { setConfirm(event.target.value); setErrors((current) => ({ ...current, confirm: undefined })); }} />
              </Field>
              {fieldError("confirm", `${id}-confirm-error`)}
            </div> : null}
            <Button type="submit" disabled={submitting} className="mt-1 w-full">{submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
          </form>
          <p className="mt-6 text-sm text-muted">{mode === "login" ? "New to PrepKit? " : "Already have an account? "}<a className="font-medium text-accent underline-offset-4 hover:underline" href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create an account" : "Sign in"}</a></p>
        </div>
      </section>
    </main>
  );
}
