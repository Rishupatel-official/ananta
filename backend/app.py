"""Flask routes for the saved ClimateTwin regression model."""
from functools import wraps
import os
from pathlib import Path

from flask import Flask, jsonify, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from werkzeug.exceptions import HTTPException

from model.inference import ClimateModel, DEFAULT_MODEL
from .auth import AuthenticationError, FirebaseVerifier


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    state: str = Field(min_length=1, max_length=100)
    startMonth: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    horizon: int = Field(default=12, ge=1, le=12)


class SimulateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    state: str = Field(min_length=1, max_length=100)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    temperatureChange: float = Field(default=0, ge=-3, le=5)
    rainfallPercent: float = Field(default=0, ge=-50, le=50)


def create_app(*, model_path: Path | None = None, project_id: str | None = None) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    app.json.sort_keys = False
    origins = {item.strip().rstrip("/") for item in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if item.strip()}
    if "*" in origins:
        raise ValueError("Set CORS_ORIGINS to the actual frontend origins.")
    # Load once at startup; never load a pickle supplied by a request.
    model = ClimateModel.load(model_path or os.environ.get("MODEL_PATH", DEFAULT_MODEL))
    verifier = FirebaseVerifier(project_id if project_id is not None else os.environ.get("FIREBASE_PROJECT_ID", ""))
    app.extensions["climate_model"] = model
    app.extensions["firebase_verifier"] = verifier

    @app.errorhandler(AuthenticationError)
    def authentication_error(error):
        return jsonify(detail=error.detail), error.status_code, error.headers

    @app.errorhandler(ValidationError)
    def validation_error(error):
        details = [{"field": ".".join(map(str, item["loc"])), "message": item["msg"]}
                   for item in error.errors(include_url=False, include_input=False, include_context=False)]
        return jsonify(detail=details), 422

    @app.errorhandler(HTTPException)
    def http_error(error):
        response = error.get_response()
        response.data = app.json.dumps({"detail": error.description})
        response.content_type = "application/json"
        return response

    @app.before_request
    def cors_preflight():
        if request.method == "OPTIONS" and request.headers.get("Origin") and request.url_rule:
            method = request.headers.get("Access-Control-Request-Method", "")
            headers = {h.strip().lower() for h in request.headers.get("Access-Control-Request-Headers", "").split(",") if h.strip()}
            if (request.headers["Origin"] not in origins or method not in ("GET", "POST")
                    or method not in request.url_rule.methods or not headers.issubset({"authorization", "content-type"})):
                return jsonify(detail="Origin, method or request headers are not allowed."), 400
            return "", 200

    @app.after_request
    def cors_headers(response):
        response.vary.add("Origin")
        if request.headers.get("Origin") in origins:
            response.headers["Access-Control-Allow-Origin"] = request.headers["Origin"]
            if request.method == "OPTIONS" and response.status_code == 200:
                response.headers["Access-Control-Allow-Methods"] = "GET, POST"
                response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        return response

    def verified_user(function):
        @wraps(function)
        def protected(*args, **kwargs):
            parts = request.headers.get("Authorization", "").split()
            if len(parts) != 2 or parts[0].lower() != "bearer":
                raise AuthenticationError(401, "Sign in to use predictions.", {"WWW-Authenticate": "Bearer"})
            verifier.verify(parts[1])
            return function(*args, **kwargs)
        return protected

    def metadata():
        return {"dataKind": model.metadata["dataKind"], "forecastStart": model.months[0],
                "trainingDataSha256": model.metadata["inputSha256"],
                "forecastEnd": model.months[-1], "units": {"temperature": "degC", "rainfall": "mm/month"},
                "notice": "Synthetic-data learning prototype; not an operational weather forecast." if model.metadata["dataKind"] == "synthetic" else "Experimental monthly regression; future skill is not guaranteed."}

    @app.get("/")
    def index():
        return jsonify(service="ClimateTwin Flask API", health="/health", docs="/docs")

    @app.get("/health")
    def health():
        return jsonify(status="ok", modelLoaded=True, stateCount=len(model.models), **metadata())

    @app.get("/model")
    @verified_user
    def model_info():
        return jsonify(**metadata(), states=sorted(model.models), months=model.months,
                       algorithm=model.metadata["algorithm"], evaluation=model.metadata["pooledEvaluation"])

    @app.post("/predict")
    @verified_user
    def predict():
        payload = PredictRequest.model_validate(request.get_json())
        try:
            rows = model.forecast(payload.state, payload.startMonth, payload.horizon)
        except ValueError as exc:
            return jsonify(detail=str(exc)), 422
        return jsonify(**metadata(), predictions=rows)

    @app.post("/simulate")
    @verified_user
    def simulate():
        payload = SimulateRequest.model_validate(request.get_json())
        try:
            result = model.simulate(payload.state, payload.month, payload.temperatureChange, payload.rainfallPercent)
        except ValueError as exc:
            return jsonify(detail=str(exc)), 422
        return jsonify(**metadata(), outputType="user_defined_scenario", **result)

    @app.get("/openapi.json")
    def openapi():
        paths = {}
        for path, method, schema in [("/health", "get", None), ("/model", "get", None),
                                     ("/predict", "post", PredictRequest), ("/simulate", "post", SimulateRequest)]:
            operation = {"responses": {"200": {"description": "Successful response"}}}
            if path != "/health":
                operation["security"] = [{"FirebaseBearer": []}]
                operation["responses"].update({str(code): {"description": text} for code, text in
                    [(401, "Sign-in required"), (403, "Verified email required"), (422, "Invalid prediction inputs"), (503, "Authentication service unavailable")]})
            if schema:
                operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": schema.model_json_schema()}}}
                operation["responses"].update({str(code): {"description": text} for code, text in
                    [(400, "Malformed JSON"), (413, "Request body too large"), (415, "JSON content type required")]})
            paths[path] = {method: operation}
        return jsonify(openapi="3.1.0", info={"title": "ClimateTwin Flask API", "version": "1.1.0"}, paths=paths,
                       components={"securitySchemes": {"FirebaseBearer": {"type": "http", "scheme": "bearer", "bearerFormat": "Firebase ID token"}}})

    @app.get("/docs")
    def docs():
        return """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ClimateTwin Flask API</title>
<body style="font:17px/1.6 system-ui;max-width:850px;margin:3rem auto;padding:0 1rem">
<h1>ClimateTwin Flask API</h1><p>Monthly regression predictions and what-if simulations.</p>
<p><a href="/health">Health check</a> · <a href="/openapi.json">OpenAPI specification</a></p>
<h2>Authentication</h2><p>Send <code>Authorization: Bearer &lt;Firebase ID token&gt;</code>
for a signed-in user with a verified email. An API key is not an ID token.</p>
<h2>GET /model</h2><p>Lists supported states, months and evaluation metrics.</p>
<h2>POST /predict</h2><p>Content-Type: application/json</p>
<pre style="overflow:auto">{"state":"Delhi","startMonth":"2027-01","horizon":12}</pre>
<h2>POST /simulate</h2><p>Content-Type: application/json</p>
<pre style="overflow:auto">{"state":"Delhi","month":"2027-07","temperatureChange":2,"rainfallPercent":-10}</pre>
<p>Temperatures are in degrees C. Rainfall is a monthly total in mm. The bundled model
uses synthetic data and projects January–December 2027. This is a learning prototype.</p>
</body></html>"""

    return app
