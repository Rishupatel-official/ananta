import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { firebaseConfigured, firebaseGateway } from "./firebase-client";
import { SessionController, authError, emailAddress, InputError, type AuthGateway, type Session } from "./auth-session";

type AuthContextValue = {
  session: Session; busy: boolean; error: string; notice: string; resendSeconds: number;
  login(email: string, password: string): Promise<boolean>;
  register(email: string, password: string, confirmation: string): Promise<boolean>;
  google(): Promise<boolean>; resetPassword(email: string): Promise<boolean>;
  verify(): Promise<boolean>; resend(): Promise<boolean>; logout(): Promise<boolean>;
  clearMessages(): void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: firebaseConfigured ? "loading" : "unconfigured", user: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendUntil, setResendUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const service = useRef<AuthGateway | null>(null);
  const controller = useRef<SessionController | null>(null);
  const running = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!firebaseConfigured) return;
    try {
      const client = firebaseGateway();
      service.current = client;
      const manager = new SessionController(client, setSession);
      controller.current = manager;
      manager.start();
      let lastCheck = Date.now();
      const checkOnReturn = () => {
        const status = sessionRef.current.status;
        if (document.visibilityState === "visible" && !running.current &&
            (status === "verification-required" || status === "verified") && Date.now() - lastCheck > 15000) {
          lastCheck = Date.now();
          void manager.refresh(status === "verified");
        }
      };
      window.addEventListener("focus", checkOnReturn);
      document.addEventListener("visibilitychange", checkOnReturn);
      return () => {
        manager.stop();
        window.removeEventListener("focus", checkOnReturn);
        document.removeEventListener("visibilitychange", checkOnReturn);
      };
    } catch (failure) { setSession({ status: "error", user: null, message: authError(failure) }); }
  }, []);

  useEffect(() => {
    if (resendUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendUntil]);

  const clearMessages = () => { setError(""); setNotice(""); };
  const run = async (operation: (client: AuthGateway) => Promise<void>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    clearMessages();
    try {
      if (!service.current) throw new InputError("Sign-in is still loading. Please try again shortly.");
      await operation(service.current);
      return true;
    } catch (failure) { setError(authError(failure)); return false; }
    finally { running.current = false; setBusy(false); }
  };
  const startCooldown = () => { const time = Date.now(); setNow(time); setResendUntil(time + 60000); };
  const value: AuthContextValue = {
    session, busy, error, notice, resendSeconds: Math.max(0, Math.ceil((resendUntil - now) / 1000)), clearMessages,
    login: (email, password) => run(async client => { await client.login(emailAddress(email), password); }),
    register: (email, password, confirmation) => run(async client => {
      if (password !== confirmation) throw new InputError("The passwords do not match.");
      await client.register(emailAddress(email), password);
      startCooldown();
      setNotice("Verification email sent. Open the link in your inbox, then return here.");
    }),
    google: () => run(async client => { await client.google(); }),
    resetPassword: email => run(async client => {
      await client.resetPassword(emailAddress(email));
      setNotice("If an eligible account exists for this email, a password-reset link will arrive shortly. Check your spam folder too.");
    }),
    verify: () => run(async () => {
      const user = await controller.current?.refresh();
      if (user && (!user.emailVerified || !user.tokenEmailVerified)) setNotice("Your email is not verified yet. Open the verification link, then check again.");
    }),
    resend: () => run(async client => {
      if (Date.now() < resendUntil) throw new InputError("Please wait before requesting another email.");
      await client.sendVerification();
      startCooldown();
      setNotice("Verification email sent. Check your inbox and spam folder.");
    }),
    logout: () => run(async () => { await controller.current?.signOut(); setResendUntil(0); }),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Authentication context is missing.");
  return context;
}

export function SignedInAccount() {
  const context = useContext(AuthContext);
  if (!context || context.session.status !== "verified") return null;
  return <div className="auth-account" translate="no">
    <span title={context.session.user.email ?? ""}>{context.session.user.displayName || context.session.user.email}</span>
    <button type="button" disabled={context.busy} onClick={() => void context.logout()}>Sign out</button>
  </div>;
}
