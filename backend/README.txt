ClimateTwin Python model and deployment API

MODEL FILE
model/model.pkl contains a dictionary with 36 fitted scikit-learn LinearRegression
objects under "models", plus the training metadata, feature order and versions.
These are the actual estimators fitted from climate_data.db, not a renamed JSON file.
model/model.info.json records the SHA-256 checksum and required runtime versions.
Keep both files together. The database is needed only for retraining.

QUICK START (Windows PowerShell, from the folder containing model and backend)
Use Python 3.12. The saved model was produced with Python 3.12.9.

    py -3.12 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
    $env:FIREBASE_PROJECT_ID = "climate-twin-549d3"
    $env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
    .\.venv\Scripts\python.exe -m backend

If py is unavailable and python --version reports 3.12, use python -m venv .venv.
The API uses port 8000 by default. Visit http://localhost:8000/health and
http://localhost:8000/docs. The documentation's Authorize button expects a valid
Firebase ID token for a signed-in user with a verified email, not a Firebase API key.
There is no authentication bypass mode. Health and API documentation are public.

USE THE MODEL DIRECTLY IN PYTHON (no server or Firebase needed)
Install model/runtime-requirements.txt if only Python inference is needed.
Run from the project root:

    from model.inference import ClimateModel
    model = ClimateModel.load()
    print(model.predict("Delhi", "2027-07"))
    print(model.forecast("Delhi", start_month="2027-01", horizon=12))
    print(model.simulate("Delhi", "2027-07", temperature_change=2, rainfall_percent=-10))

The wrapper supplies the exact feature order, validates the forecast window and
applies the same temperature ordering and rainfall clipping as the browser app.
For inspection, pickle.load(open("model/model.pkl", "rb"))["models"]["Delhi"]
is a fitted sklearn.linear_model.LinearRegression with predict(), coef_ and intercept_.
Its raw input is 12 numbers: elapsed years from 2010, then indicators for February
through December. Outputs are minimum temperature, maximum temperature and rainfall.
Only load this trusted project pickle: Python pickle files can execute code.
Use the pinned requirements; scikit-learn does not support cross-version loading.

API CONTRACT
All model endpoints require Authorization: Bearer <Firebase ID token>.

GET /model
    Lists valid state names, supported months, data type and evaluation metrics.

POST /predict
    {"state":"Delhi","startMonth":"2027-01","horizon":12}
    startMonth defaults to the first forecast month; horizon defaults to 12.
    Returns predictions[] with state, month, minTemp, maxTemp, meanTemp, rainfall.
    All requested months must fit inside January-December 2027.

POST /simulate
    {"state":"Delhi","month":"2027-07","temperatureChange":2,"rainfallPercent":-10}
    Returns baseline and scenario. Temperature change: -3 to +5 degrees C.
    Rainfall change: -50% to +50%. Values must be finite numbers.

Units: monthly mean daily min/max temperature in degrees C; monthly rainfall total
in mm. meanTemp is (minTemp + maxTemp) / 2. Missing/invalid login returns 401,
unverified email returns 403, unsupported inputs return 422, and certificate/network
verification failures return 503. API responses always disclose the data type.

DEPLOYMENT SETTINGS (a Python web-service host)
Repository: https://github.com/Rishupatel-official/ananta
Root directory: repository root (the folder with model/ and backend/).
Python version: 3.12
Build command: python -m pip install -r backend/requirements.txt
Start command: python -m backend
Health-check path: /health
Required server variable: FIREBASE_PROJECT_ID=climate-twin-549d3
Set CORS_ORIGINS to your frontend's full HTTPS origin; separate multiple origins
with commas. The service reads PORT from the host, defaulting to 8000.
Use the host's HTTPS endpoint for browser requests. No training is run at startup.
The API loads its model once and is ready only after model/configuration validation.
backend/.env.example lists settings; the server reads environment variables, not
this template or the frontend .env.local. No Firebase service-account key is needed
for this public-certificate token verification workflow.

Docker alternative, from the repository root:
    docker build -t climatetwin-api .
    docker run --rm -p 8000:8000 -e FIREBASE_PROJECT_ID=climate-twin-549d3 -e CORS_ORIGINS=http://localhost:5173 climatetwin-api
The Docker image copies only the model and API, runs as a non-root user and does
not include local .env files, the training database or frontend dependencies.

CONNECTING THE FRONTEND AFTER DEPLOYMENT
The current React prediction/simulation screens still use the local JSON model.
This package adds a separate Python API; it does not switch existing screens to it.
Use the backend URL and a Firebase ID token when wiring the screens to the service:

    import { getApp } from "firebase/app";
    import { getAuth } from "firebase/auth";
    const user = getAuth(getApp("climatetwin")).currentUser;
    if (!user) throw new Error("Please sign in.");
    const token = await user.getIdToken();
    const response = await fetch("https://YOUR-BACKEND/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state: "Delhi", startMonth: "2027-01", horizon: 12 })
    });
    if (!response.ok) throw new Error("Prediction request failed.");
    const result = await response.json();

Google's verification library validates the signature, audience and expiration;
the API also requires this project's issuer, valid subject/authentication time
and email_verified=true. Signing certificates are cached using their HTTP headers.
This checks ID tokens, not immediate account revocation. A previously issued token
can remain usable until it expires after sign-out or account disablement. Immediate
revocation checks would require an Admin SDK/account lookup integration.

RETRAINING
    .\.venv\Scripts\python.exe -m pip install -r model/requirements.txt
    .\.venv\Scripts\python.exe -m model.train --database "C:\path\to\climate_data.db" --data-kind synthetic
This saves model.pkl, model.info.json, the browser coefficient JSON, evaluation
report and comparison fixtures from the same fitting run. It reads the database
without modifying it. See model/TRAINING.md for the required schema and holdout.

TESTS
    .\.venv\Scripts\python.exe -m pip install -r backend/requirements-test.txt -r model/requirements.txt
    .\.venv\Scripts\python.exe -m unittest discover -s model -p "test_*.py" -v
    .\.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
Tests compare all 432 state/month projections and exercise the real token signature
verification code using test-only RSA keys, without creating Firebase accounts.

Validation on 27 November 2026: all 17 Python tests passed, including the existing
training checks. A fresh Python 3.12 environment installed these requirements with
no dependency conflicts. The running API returned 200 for health/docs and 401 for
an unauthenticated prediction. Docker's engine was not running on this computer,
so the Dockerfile is provided but its image build was not tested. Cloud deployment
and a request with a real signed-in user's Firebase token remain deployment checks.

LIMITATIONS
The supplied training database is synthetic: this is a learning prototype, not an
operational weather forecast. Predictions cover January-December 2027 only. Monthly
rainfall MAE (40.75 mm) was worse than the seasonal-average baseline (39.90 mm).
Simulations apply user-selected arithmetic changes; they are not causal climate,
emissions, crop-yield or flood models. Open-Meteo live weather is a separate feature.

Official references:
https://scikit-learn.org/stable/model_persistence.html
https://fastapi.tiangolo.com/deployment/docker/
https://googleapis.dev/python/google-auth/latest/reference/google.oauth2.id_token.html
https://firebase.google.com/docs/auth/admin/verify-id-tokens
