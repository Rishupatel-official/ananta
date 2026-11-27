import { getApps, initializeApp } from "firebase/app";
import {
  initializeAuth, getAuth, browserSessionPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signOut, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, reload, getIdTokenResult, validatePassword,
} from "firebase/auth";
import { InputError, type AuthGateway } from "./auth-session";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(value => typeof value === "string" && value.trim() && !value.startsWith("YOUR_"));
let gateway: AuthGateway | undefined;

export function firebaseGateway(): AuthGateway {
  if (gateway) return gateway;
  if (!firebaseConfigured) throw new InputError("Firebase is not configured.");
  const existing = getApps().find(app => app.name === "climatetwin");
  const app = existing ?? initializeApp(config, "climatetwin");
  const auth = existing ? getAuth(app) : initializeAuth(app, {
    persistence: browserSessionPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  auth.languageCode = "en";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  // Firebase's hosted action handler verifies/resets, then offers a return to this app.
  const actionSettings = () => ({ url: `${window.location.origin}${window.location.pathname}`, handleCodeInApp: false });
  gateway = {
    watch: (changed, failed) => onAuthStateChanged(auth, () => changed(), failed),
    async inspect() {
      const user = auth.currentUser;
      if (!user) return null;
      await reload(user);
      const result = await getIdTokenResult(user, true);
      if (auth.currentUser?.uid !== user.uid) return null;
      return { uid: user.uid, email: user.email, displayName: user.displayName,
        emailVerified: user.emailVerified, tokenEmailVerified: result.claims.email_verified === true };
    },
    async login(email, password) { await signInWithEmailAndPassword(auth, email, password); },
    async register(email, password) {
      if (password.length < 8) throw new InputError("Use a password with at least 8 characters.");
      const policy = await validatePassword(auth, password);
      if (!policy.isValid) {
        const needed = [];
        if (policy.meetsMinPasswordLength === false) needed.push(`at least ${policy.passwordPolicy.customStrengthOptions.minPasswordLength} characters`);
        if (policy.containsLowercaseLetter === false) needed.push("a lowercase letter");
        if (policy.containsUppercaseLetter === false) needed.push("an uppercase letter");
        if (policy.containsNumericCharacter === false) needed.push("a number");
        if (policy.containsNonAlphanumericCharacter === false) needed.push("a special character");
        throw new InputError(needed.length ? `Your password needs ${needed.join(", ")}.` : "Your password does not meet the project's password policy.");
      }
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try { await sendEmailVerification(credential.user, actionSettings()); }
      catch { throw { code: "auth/verification-delivery-failed" }; }
    },
    async google() { await signInWithPopup(auth, provider); },
    async resetPassword(email) {
      try { await sendPasswordResetEmail(auth, email, actionSettings()); }
      catch (error) {
        // Same response for unknown and existing addresses; do not enumerate accounts.
        if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
      }
    },
    async sendVerification() {
      const user = auth.currentUser;
      if (!user) throw new InputError("Please sign in again before requesting verification.");
      await reload(user);
      if (!user.emailVerified) await sendEmailVerification(user, actionSettings());
    },
    async signOut() { await signOut(auth); },
  };
  return gateway;
}
