# ClimateTwin authentication

The app was integrated with Firebase project `climate-twin-549d3`.
Your local web app configuration is in `.env.local`, alongside `package.json`.
GitHub includes only the `.env.example` template. For a fresh clone, copy it to
`.env.local` and fill in the four values from Firebase Project settings → General
→ Your apps → Web app → SDK setup and configuration. The original local copy
already has these values.
The Firebase API key identifies the client app; it is not an Admin SDK credential.
The file is ignored by Git. Do not place private keys or service-account credentials
in any `VITE_` variable: Vite exposes those values to the browser.

## Firebase project settings

In [Firebase Authentication](https://console.firebase.google.com/project/climate-twin-549d3/authentication/providers):

1. Enable **Email/Password**. Email-link passwordless login is not needed.
2. Enable **Google** and select the project's support email.
3. In **Settings → Authorized domains**, allow `localhost` for local development.
   This domain was confirmed in the project's public configuration during setup.
   When deploying, also authorize the actual production domain.
4. In **Templates**, review the email verification and password reset templates.
   Keep Firebase's default hosted action handler unless implementing a replacement.
5. Keep email enumeration protection enabled. Set the server-enforced password
   policy to at least eight characters; choose any additional requirements there.
   The app checks that policy during registration and also requires at least eight.

The Google OAuth page was reached successfully during integration. A full sign-in
with your own account and delivery of an email verification link require your test.
No production test account was created and no password-reset/verification messages
were sent to other people's inboxes during development.

## Run

Open the folder containing `package.json` in VS Code. In PowerShell:

```powershell
# On a fresh clone only, then fill in the values before starting the app:
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd run dev
```

Keep an existing `.env.local`; do not replace it with the template.

Use the Local URL printed by Vite, normally `http://localhost:5173/`.
Restart Vite after changing `.env.local`. If running from the ZIP, extract all files,
including `.env.local`. `.env.example` shows the required variable names if recreating
the configuration. The build embeds web config; rebuilding is required after changes.

## How verification works

- Email registration creates a Firebase account and requests a verification email.
- The account can exist in Firebase while still being denied the dashboard.
- The user opens the link, returns to the app and chooses **I've verified my email**.
- The app reloads the Firebase user and refreshes the ID token. Both `emailVerified`
  and the token's `email_verified` claim must be true before the dashboard mounts.
- Google sign-in follows the same verified-email check; no domain-only shortcut.
- Resend has a 60-second UI cooldown; Firebase also enforces its own limits.
- A verification-delivery failure leaves the account unverified and offers resend.
- Password reset always uses a generic confirmation to avoid exposing account existence.
- Session loading, network errors, disabled accounts and invalid sessions deny access.
- Returning to the tab refreshes the account check. Sign-out invalidates pending checks
  so a delayed response cannot accidentally restore access.

Verification confirms control of an inbox. It cannot establish a person's legal
identity or guarantee that the address is not temporary/disposable. Format checks
alone are not treated as proof that an email is genuine.

## Security scope

The optional Python prediction API in `backend/` now verifies Firebase ID tokens
on `/model`, `/predict` and `/simulate`, including the verified-email claim.
See `backend/README.txt` for its deployment, CORS and token-expiry behavior.
The existing browser screens continue using JSON inference until connected to it.

The frontend uses Firebase identity and a login gate for its browser interface.
The public weather endpoint and bundled synthetic coefficients remain public static
resources. A browser UI gate cannot protect downloadable JavaScript or public APIs.
There is currently no private user database or privileged backend operation.

If private datasets or saved user scenarios are added, enforce authorization in
Firestore/Storage Security Rules or a server that verifies Firebase ID tokens,
requires `email_verified == true`, and checks ownership. Do not rely on a UI-only
check for private data. No Firebase Security Rules or cloud permissions were changed
by this source-code update.

## Tests and acceptance check

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Automated checks cover verified versus unverified access, stale requests after
sign-out, failed network checks, email syntax, generic login errors and protected
route rendering, plus the existing model tests.

Finish the live check with an inbox you own:

1. Create an email/password account and confirm the dashboard stays blocked.
2. Open the verification link, then return and check verification.
3. Reload a direct route such as `#ai-prediction` and confirm the session persists.
4. Sign out; confirm direct routes show sign-in again.
5. Try Google sign-in and the password-reset email flow for your own account.

If Google does not open, allow pop-ups for localhost. If the app reports a method
is not enabled, enable that provider in Firebase. If the email does not arrive,
check spam, the sender/template settings and Firebase quotas before resending.

Official references: [Email/password](https://firebase.google.com/docs/auth/web/password-auth),
[Google sign-in](https://firebase.google.com/docs/auth/web/google-signin),
[Email verification](https://firebase.google.com/docs/auth/web/manage-users#send_a_user_a_verification_email),
[Firebase web API keys](https://firebase.google.com/docs/projects/api-keys).
