import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from google.auth import crypt, exceptions, jwt

from backend.app import create_app
from model.inference import ClimateModel


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = cls.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        cls.signer = crypt.RSASigner.from_string(pem, key_id="test-only")
        cls.certs = {"test-only": cls.key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()}
        cls.predictor = ClimateModel.load()

    def setUp(self):
        self.app = create_app(project_id="test-climate-project")
        self.client_context = TestClient(self.app)
        self.client = self.client_context.__enter__()
        self.app.state.verifier.request = lambda *args, **kwargs: SimpleNamespace(status=200, data=json.dumps(self.certs).encode())

    def tearDown(self):
        self.client_context.__exit__(None, None, None)

    def token(self, **changes):
        now = int(time.time())
        claims = {"iss": "https://securetoken.google.com/test-climate-project", "aud": "test-climate-project",
                  "sub": "test-user", "email": "test@example.invalid", "email_verified": True,
                  "auth_time": now - 60, "iat": now - 30, "exp": now + 3600, **changes}
        return jwt.encode(self.signer, claims).decode()

    def headers(self, **changes):
        return {"Authorization": "Bearer " + self.token(**changes)}

    def test_public_health_and_protected_endpoints(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["stateCount"], 36)
        self.assertEqual(health.json()["dataKind"], "synthetic")
        for route, payload in [("/predict", {"state": "Delhi"}), ("/simulate", {"state": "Delhi", "month": "2027-01"})]:
            self.assertEqual(self.client.post(route, json=payload).status_code, 401)
        self.assertEqual(self.client.get("/model").status_code, 401)
        self.assertEqual(self.client.get("/docs").status_code, 200)

    def test_verified_signed_token_returns_model_and_all_state_forecasts(self):
        headers = self.headers()
        info = self.client.get("/model", headers=headers)
        self.assertEqual(info.status_code, 200)
        for state in info.json()["states"]:
            response = self.client.post("/predict", headers=headers, json={"state": state})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["predictions"], self.predictor.forecast(state))

    def test_rejects_wrong_project_expired_invalid_signature_and_unverified_email(self):
        for changes in [{"aud": "another-project"}, {"iss": "https://example.invalid"}, {"exp": int(time.time()) - 10},
                        {"auth_time": int(time.time()) + 1000}, {"sub": ""}]:
            self.assertEqual(self.client.get("/model", headers=self.headers(**changes)).status_code, 401)
        for verification in [False, "true", None]:
            self.assertEqual(self.client.get("/model", headers=self.headers(email_verified=verification)).status_code, 403)
        forged = self.token().rsplit(".", 1)[0] + ".AAAA"
        for token in [forged, "not-a-token"]:
            self.assertEqual(self.client.get("/model", headers={"Authorization": "Bearer " + token}).status_code, 401)

    def test_auth_network_failure_denies_predictions(self):
        with patch.object(self.app.state.verifier, "request", side_effect=exceptions.TransportError("offline")):
            self.assertEqual(self.client.get("/model", headers=self.headers()).status_code, 503)

    def test_request_validation_and_simulation(self):
        headers = self.headers()
        for payload in [{"state": "Unknown"}, {"state": "Delhi", "horizon": 13}, {"state": "Delhi", "horizon": True},
                        {"state": "Delhi", "startMonth": "2027-12", "horizon": 2}, {"state": "Delhi", "unexpected": 1}]:
            self.assertEqual(self.client.post("/predict", headers=headers, json=payload).status_code, 422)
        response = self.client.post("/simulate", headers=headers, json={"state": "Delhi", "month": "2027-07", "temperatureChange": 5, "rainfallPercent": -50})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertAlmostEqual(body["scenario"]["meanTemp"], body["baseline"]["meanTemp"] + 5)
        self.assertAlmostEqual(body["scenario"]["rainfall"], body["baseline"]["rainfall"] / 2)
        self.assertEqual(self.client.post("/simulate", headers=headers, json={"state": "Delhi", "month": "2027-01", "temperatureChange": 6}).status_code, 422)

    def test_cors_allows_configured_origin_only(self):
        for origin, expected in [("http://localhost:5173", 200), ("https://untrusted.invalid", 400)]:
            response = self.client.options("/predict", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
            self.assertEqual(response.status_code, expected)

    def test_missing_project_fails_startup(self):
        with self.assertRaisesRegex(ValueError, "FIREBASE_PROJECT_ID"):
            with TestClient(create_app(project_id="")):
                pass


if __name__ == "__main__":
    unittest.main()
