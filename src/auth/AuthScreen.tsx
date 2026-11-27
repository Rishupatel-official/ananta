import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { hasVerifiedAccess, type Session } from "./auth-session";
import "./auth.css";

function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-page" lang="en" dir="ltr">
    <section className="auth-intro" aria-label="ClimateTwin introduction">
      <a className="auth-brand" href="#home"><span className="auth-orbit" aria-hidden="true">◉</span><span>ClimateTwin<small>INDIA</small></span></a>
      <div className="auth-intro-copy"><p className="auth-eyebrow">YOUR CLIMATE INTELLIGENCE WORKSPACE</p>
        <h1>Understand climate.<br /><em>Explore tomorrow.</em></h1>
        <p>Explore live weather, regional projections and what-if scenarios in one place.</p>
        <div className="auth-feature-list"><span>36 states & Union Territories</span><span>Live weather updates</span><span>Monthly regression projections</span></div>
      </div>
      <p className="auth-intro-footnote">ClimateTwin is a research prototype. Model projections use synthetic data.</p>
    </section>
    <section className="auth-panel" aria-label="Account access">{children}</section>
  </main>;
}

/** No protected children are mounted for loading, missing config, failed or unverified sessions. */
export function AccessGate({ session, children, fallback }: { session: Session; children: ReactNode; fallback: ReactNode }) {
  return session.status === "verified" && hasVerifiedAccess(session.user) ? children : fallback;
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  useEffect(() => {
    if (auth.session.status !== "verified") document.title = "Sign in · ClimateTwin India";
  }, [auth.session.status]);
  return <AccessGate session={auth.session} fallback={<AuthScreen />}>{children}</AccessGate>;
}

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const switchMode = (next: typeof mode) => {
    setMode(next); setPassword(""); setConfirmation(""); setShowPassword(false); auth.clearMessages();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "reset") { await auth.resetPassword(email); return; }
    const succeeded = mode === "signup" ? await auth.register(email, password, confirmation) : await auth.login(email, password);
    if (succeeded) { setPassword(""); setConfirmation(""); }
  };
  const messages = <>{auth.error && <p className="auth-message auth-error" role="alert">{auth.error}</p>}{auth.notice && <p className="auth-message" role="status">{auth.notice}</p>}</>;
  let content: ReactNode;
  if (auth.session.status === "loading") {
    content = <div className="auth-card auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" /><h2>Checking your session…</h2><p>Please wait while we confirm your account.</p></div>;
  } else if (auth.session.status === "unconfigured") {
    content = <div className="auth-card"><p className="auth-eyebrow">ACCOUNT ACCESS</p><h2>Sign-in is being set up</h2><p>The app owner needs to connect this app to Firebase before you can sign in. Please try again once setup is complete.</p></div>;
  } else if (auth.session.status === "error") {
    content = <div className="auth-card"><h2>We couldn’t confirm your session</h2><p className="auth-message auth-error" role="alert">{auth.session.message}</p>{messages}
      <button className="auth-primary" type="button" disabled={auth.busy} onClick={() => void auth.verify()}>Try again</button>
      <button className="auth-text-button" type="button" disabled={auth.busy} onClick={() => void auth.logout()}>Return to sign in</button></div>;
  } else if (auth.session.status === "verification-required" || auth.session.status === "verified") {
    content = <div className="auth-card"><p className="auth-eyebrow">ONE MORE STEP</p><h2>Verify your email</h2>
      <p>Open the verification link sent to <strong className="auth-email">{auth.session.user.email}</strong>. This confirms that you can access the inbox.</p>
      <p>You can enter the dashboard once Firebase confirms your email is verified. Check your spam folder if the message is missing.</p>{messages}
      <button className="auth-primary" type="button" disabled={auth.busy} onClick={() => void auth.verify()}>{auth.busy ? "Checking…" : "I’ve verified my email"}</button>
      <button className="auth-secondary" type="button" disabled={auth.busy || auth.resendSeconds > 0} onClick={() => void auth.resend()}>{auth.resendSeconds > 0 ? `Resend available in ${auth.resendSeconds}s` : "Resend verification email"}</button>
      <button className="auth-text-button" type="button" disabled={auth.busy} onClick={() => void auth.logout()}>Use a different account</button>
    </div>;
  } else {
    content = <div className="auth-card">
      <p className="auth-eyebrow">WELCOME TO CLIMATETWIN</p><h2>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in to explore"}</h2>
      <p>{mode === "signup" ? "Use an email address you can access. We’ll send a verification link." : mode === "reset" ? "Enter your account email to request a reset link." : "Continue with Google or your verified email account."}</p>
      {mode !== "reset" && <><button type="button" className="auth-google" disabled={auth.busy} onClick={() => void auth.google()}><span aria-hidden="true" className="auth-google-icon">G</span>Continue with Google</button><div className="auth-divider"><span>or use email</span></div></>}
      {messages}
      <form onSubmit={event => void submit(event)} aria-label={mode === "signup" ? "Create account" : mode === "reset" ? "Reset password" : "Email sign in"}>
        <label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required value={email} disabled={auth.busy} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
        {mode !== "reset" && <><label htmlFor="auth-password">Password</label><div className="auth-password-field"><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} maxLength={4096} value={password} disabled={auth.busy} onChange={event => setPassword(event.target.value)} aria-describedby={mode === "signup" ? "password-help" : undefined} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></>}
        {mode === "signup" && <><p id="password-help" className="auth-help">Use at least 8 characters. Your project’s additional password rules also apply.</p><label htmlFor="auth-confirmation">Confirm password</label><input id="auth-confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required maxLength={4096} value={confirmation} disabled={auth.busy} onChange={event => setConfirmation(event.target.value)} /></>}
        {mode === "login" && <button type="button" className="auth-forgot" disabled={auth.busy} onClick={() => switchMode("reset")}>Forgot password?</button>}
        <button className="auth-primary" type="submit" disabled={auth.busy}>{auth.busy ? "Please wait…" : mode === "signup" ? "Create account & verify email" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
      </form>
      <p className="auth-switch">{mode === "login" ? "New to ClimateTwin? " : mode === "signup" ? "Already have an account? " : "Remembered your password? "}<button type="button" disabled={auth.busy} onClick={() => switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
      <p className="auth-help auth-privacy">Your password is managed by Firebase Authentication.</p>
    </div>;
  }
  return <AuthLayout>{content}</AuthLayout>;
}
