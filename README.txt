ClimateTwin India — Firebase authentication, live weather and monthly regression

Python model and API:
- app.py starts the Flask backend with Waitress; install root requirements.txt.
- model/model.pkl contains 36 fitted scikit-learn LinearRegression models.
- backend/README.txt explains Python inference, API endpoints and deployment.
- The backend validates Firebase tokens and requires a verified email.
- The React prediction and simulation screens call Flask with a Firebase ID token.
- Start Flask and Vite for the presentation. See PRESENTATION.txt for the demo steps.
- The saved Python model uses the same synthetic data and forecast window below.

Run locally:
1. Clone the GitHub repository (or extract the ZIP) and open the folder containing
   package.json in VS Code.
2. Open a terminal in this folder. A compatible Node.js installation is needed
   (verified with Node 24.13.0).
3. If .env.local is missing, run Copy-Item .env.example .env.local in PowerShell
   and fill in the Firebase web app configuration. See FIREBASE-SETUP.md.
4. Run npm.cmd ci
5. Run npm.cmd run dev and open the local URL printed by Vite.
Production: npm.cmd run build; npm.cmd run preview.
Use npm.cmd in Windows PowerShell if npm.ps1 is blocked. On macOS/Linux use npm.
Do not double-click index.html or use VS Code Live Server to run the React source.

Authentication:
- Google sign-in and email/password registration and sign-in use Firebase.
- Email/password users must open a verification link before accessing the app.
- Verification is checked against a fresh Firebase user record AND ID token.
- Google users are also required to have a verified email in Firebase.
- Verification resend, password reset, password confirmation and sign-out included.
- Firebase manages the session in this browser tab. No custom password storage.
- Local Firebase web configuration belongs in .env.local, which Git ignores.
- GitHub includes .env.example; each clone needs its own .env.local configuration.
- Enable Email/Password and Google in Firebase Authentication > Sign-in method.
- The project's localhost authorized domain was confirmed during integration.
- Setup, troubleshooting and security scope: FIREBASE-SETUP.md.
done.
Prediction and simulation:
- AI Prediction now evaluates trained linear-regression coefficients for all
  36 states/UTs. Choose a 3-, 6- or 12-month view, see charts and download CSV.
- The model projects monthly mean/min/max temperature and total rainfall for
  Jan–Dec 2027. It uses a linear trend plus month indicators for seasonality.
- Scenario Simulator adjusts the fitted baseline by your chosen temperature
  change (-3 to +5 C) and rainfall change (-50 to +50%). Reset restores baseline.
- Predictions and simulations require the Flask Python server. Firebase uses your
  local .env.local. VITE_MODEL_API_URL defaults to http://localhost:8000.
- Training instructions, data contract and limitations: model/TRAINING.md.

The supplied data_pipeline.py generates SYNTHETIC climate data. The supplied DB
includes generated future-dated records through December 2026. These projections
are a learning prototype, not real weather forecasts. The live API is separate
and does not train/update the regression.

Held-out test: trained on 2010–2024, tested on complete months in 2025–2026.
Pooled mean absolute error (regression vs seasonal-average baseline):
- Monthly mean temperature: 0.142 C vs 0.205 C.
- Monthly rainfall: 40.75 mm vs 39.90 mm; rainfall does NOT beat baseline MAE.
The app shows per-state results. No confidence percentage is claimed. The final
models are refit using all complete 2010–2026 months after evaluating the test.
Scenarios are sensitivity calculations, not crop/water/heat-impact predictions.

Current weather:
- Open-Meteo public forecast API; no API key in this implementation.
- Dashboard city selector, Monitoring weather selector, and selected map regions.
- State readings use a named representative city, never a state/national average.
- Temperature, humidity, preceding-interval precipitation, 10 m wind speed.
- Provider time shown in IST. 10-minute refresh/cache, 15-second timeout, manual retry.
- Missing/failed data is unavailable; sample readings are never substituted.
- Open-Meteo provides weather model estimates, not ground-station observations.
- Public free endpoint is intended for non-commercial use; review provider terms for commercial deployment.
  https://open-meteo.com/en/docs
  https://open-meteo.com/en/terms

Remaining demo features:
AQI, historical graphs, national hero summary and Risk Analysis are still demo
content, separate from the regression and live API. New model screens are English.

Dataset inspected (read-only): climate_data.db, table daily_climate:
date, state, latitude, longitude, max_temp, min_temp, rainfall and date fields.
The database is used locally for training but is not bundled or modified.
Bundled coefficients let the app run without it.
Training script: model/train.py. Full audit and metrics: model/evaluation.json.
Browser inference: src/regression.ts. Model screens: src/ModelViews.tsx.
Fitted coefficients: src/data/regression-model.json.

Validation commands:
python -m unittest discover -s model -p "test_*.py" -v
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
Tests cover temporal separation, missing data, invalid inputs, scenario arithmetic
and all 432 browser/Python projection comparisons. The weather integration was
previously checked with a real New Delhi response and all region mappings.
