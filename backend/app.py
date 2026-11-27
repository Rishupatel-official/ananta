from contextlib import asynccontextmanager
import os
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from model.inference import ClimateModel, DEFAULT_MODEL
from .auth import FirebaseVerifier

bearer = HTTPBearer(auto_error=False)


def verified_user(request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None:
        raise HTTPException(401, "Sign in to use predictions.", headers={"WWW-Authenticate": "Bearer"})
    return request.app.state.verifier.verify(credentials.credentials)


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


def create_app(*, model_path: Path | None = None, project_id: str | None = None):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.model = ClimateModel.load(model_path or os.environ.get("MODEL_PATH", DEFAULT_MODEL))
        app.state.verifier = FirebaseVerifier(project_id if project_id is not None else os.environ.get("FIREBASE_PROJECT_ID", ""))
        try:
            yield
        finally:
            app.state.verifier.close()

    app = FastAPI(title="ClimateTwin Python Model API", version="1.0.0", lifespan=lifespan,
                  description="Monthly linear regression trained on synthetic data. Simulations are arithmetic what-if adjustments.")
    origins = [item.strip().rstrip("/") for item in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if item.strip()]
    if "*" in origins:
        raise ValueError("Set CORS_ORIGINS to the actual frontend origins.")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                       allow_headers=["Authorization", "Content-Type"])

    def metadata(request: Request):
        model = request.app.state.model
        return {"dataKind": model.metadata["dataKind"], "forecastStart": model.months[0],
                "forecastEnd": model.months[-1], "units": {"temperature": "degC", "rainfall": "mm/month"},
                "notice": "Synthetic-data learning prototype; not an operational weather forecast." if model.metadata["dataKind"] == "synthetic" else "Experimental monthly regression; future skill is not guaranteed."}

    @app.get("/health")
    def health(request: Request):
        return {"status": "ok", "modelLoaded": True, "stateCount": len(request.app.state.model.models), **metadata(request)}

    @app.get("/model", dependencies=[Depends(verified_user)])
    def model_info(request: Request):
        model = request.app.state.model
        return {**metadata(request), "states": sorted(model.models), "months": model.months,
                "algorithm": model.metadata["algorithm"], "evaluation": model.metadata["pooledEvaluation"]}

    @app.post("/predict", dependencies=[Depends(verified_user)])
    def predict(payload: PredictRequest, request: Request):
        try:
            rows = request.app.state.model.forecast(payload.state, payload.startMonth, payload.horizon)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {**metadata(request), "predictions": rows}

    @app.post("/simulate", dependencies=[Depends(verified_user)])
    def simulate(payload: SimulateRequest, request: Request):
        try:
            result = request.app.state.model.simulate(payload.state, payload.month, payload.temperatureChange, payload.rainfallPercent)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {**metadata(request), "outputType": "user_defined_scenario", **result}

    return app


app = create_app()
