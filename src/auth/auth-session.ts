export type Identity = {
  uid: string; email: string | null; displayName: string | null;
  emailVerified: boolean; tokenEmailVerified: boolean;
};
export type Session =
  | { status: "loading" | "signed-out" | "unconfigured"; user: null }
  | { status: "error"; user: null; message: string }
  | { status: "verification-required" | "verified"; user: Identity };

export interface AuthGateway {
  watch(changed: () => void, failed: (error: unknown) => void): () => void;
  inspect(): Promise<Identity | null>;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  google(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  sendVerification(): Promise<void>;
  signOut(): Promise<void>;
}

export function hasVerifiedAccess(identity: Identity | null): boolean {
  return Boolean(identity?.uid && identity.email && identity.emailVerified === true && identity.tokenEmailVerified === true);
}

export function emailAddress(value: string): string {
  const email = value.trim();
  // Syntax only. Ownership is established by Firebase's verification flow.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InputError("Enter a valid email address.");
  return email;
}

export function authError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Unable to sign in. Check your email and password, or reset your password.",
    "auth/wrong-password": "Unable to sign in. Check your email and password, or reset your password.",
    "auth/user-not-found": "Unable to sign in. Check your email and password, or reset your password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "Unable to create this account. Try signing in or resetting your password.",
    "auth/weak-password": "Choose a stronger password that meets the password requirements.",
    "auth/password-does-not-meet-requirements": "Your password does not meet this project's password requirements.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes before trying again.",
    "auth/network-request-failed": "Unable to reach the sign-in service. Check your connection and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled. You can try again.",
    "auth/cancelled-popup-request": "A sign-in window is already open. Complete it or try again.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
    "auth/unauthorized-domain": "Sign-in is not enabled for this website address. The app owner needs to authorize its domain in Firebase.",
    "auth/operation-not-allowed": "This sign-in method is not enabled yet. The app owner needs to enable it in Firebase Authentication.",
    "auth/configuration-not-found": "Firebase Authentication has not been set up for this project yet.",
    "auth/invalid-api-key": "The app's Firebase configuration needs to be checked by the app owner.",
    "auth/app-not-authorized": "Firebase has not authorized this app. Contact the app owner.",
    "auth/user-disabled": "This account is unavailable. Contact the app owner.",
    "auth/user-token-expired": "Your session has expired. Please sign in again.",
    "auth/invalid-user-token": "Your session has expired. Please sign in again.",
    "auth/account-exists-with-different-credential": "Use your existing sign-in method for this email address.",
    "auth/verification-delivery-failed": "Your account was created, but the verification email could not be sent. Use Resend verification email below.",
  };
  return messages[code] ?? (error instanceof InputError ? error.message : "We couldn't complete that request. Please try again.");
}

export class InputError extends Error {}

/** Rechecks Firebase before allowing access; older requests cannot restore a signed-out session. */
export class SessionController {
  private sequence = 0;
  private active = false;
  private unsubscribe?: () => void;
  constructor(private gateway: AuthGateway, private publish: (session: Session) => void) {}
  start() {
    this.active = true;
    this.unsubscribe = this.gateway.watch(() => { void this.refresh(); }, error => {
      ++this.sequence;
      if (this.active) this.publish({ status: "error", user: null, message: authError(error) });
    });
  }
  stop() { this.active = false; ++this.sequence; this.unsubscribe?.(); }
  async refresh(background = false): Promise<Identity | null> {
    const request = ++this.sequence;
    if (this.active && !background) this.publish({ status: "loading", user: null });
    try {
      const user = await this.gateway.inspect();
      if (!this.active || request !== this.sequence) return null;
      this.publish(user ? { status: hasVerifiedAccess(user) ? "verified" : "verification-required", user } : { status: "signed-out", user: null });
      return user;
    } catch (error) {
      if (this.active && request === this.sequence) this.publish({ status: "error", user: null, message: authError(error) });
      return null;
    }
  }
  async signOut() {
    ++this.sequence;
    if (this.active) this.publish({ status: "loading", user: null });
    try {
      await this.gateway.signOut();
      ++this.sequence;
      if (this.active) this.publish({ status: "signed-out", user: null });
    } catch (error) {
      ++this.sequence;
      if (this.active) this.publish({ status: "error", user: null, message: authError(error) });
      throw error;
    }
  }
}
