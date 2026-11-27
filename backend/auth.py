"""Verify Firebase ID tokens using Google's public signing certificates."""
import time

import cachecontrol
import requests
from google.auth import exceptions, jwt
from google.auth.transport.requests import Request
from google.oauth2 import id_token


class AuthenticationError(Exception):
    """Authentication failure, independent of the web framework."""
    def __init__(self, status_code: int, detail: str, headers: dict | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers or {}


class FirebaseVerifier:
    def __init__(self, project_id: str):
        if not project_id or not project_id.strip():
            raise ValueError("Set FIREBASE_PROJECT_ID before starting the API.")
        self.project_id = project_id.strip()
        self.session = cachecontrol.CacheControl(requests.Session())
        self.request = Request(session=self.session)

    def close(self):
        self.session.close()

    def verify(self, token: str) -> dict:
        denied = AuthenticationError(401, "Sign in again with a valid Firebase session.", headers={"WWW-Authenticate": "Bearer"})
        if len(token) > 16384:
            raise denied
        try:
            # Enforce Firebase's algorithm before any certificate request.
            header = jwt.decode_header(token)
            if header.get("alg") != "RS256" or not header.get("kid"):
                raise ValueError("Invalid token header.")
            def fetch_certs(*args, **kwargs):
                kwargs["timeout"] = 10
                return self.request(*args, **kwargs)
            claims = id_token.verify_firebase_token(token, fetch_certs, audience=self.project_id)
            now = time.time()
            if (claims.get("iss") != f"https://securetoken.google.com/{self.project_id}"
                    or claims.get("aud") != self.project_id
                    or not isinstance(claims.get("sub"), str) or not 1 <= len(claims["sub"]) <= 128):
                raise ValueError("Invalid token claims.")
            for key in ("auth_time", "iat", "exp"):
                if type(claims.get(key)) not in (int, float):
                    raise ValueError("Missing token timestamps.")
            if not (0 <= claims["auth_time"] <= now and 0 <= claims["iat"] <= now < claims["exp"]):
                raise ValueError("Invalid token timestamps.")
        except (exceptions.TransportError, requests.RequestException) as exc:
            raise AuthenticationError(503, "Sign-in verification is temporarily unavailable. Try again shortly.") from exc
        except (ValueError, TypeError, KeyError, exceptions.GoogleAuthError) as exc:
            raise denied from exc
        if claims.get("email_verified") is not True or not isinstance(claims.get("email"), str) or not claims["email"]:
            raise AuthenticationError(403, "Verify your email address before using predictions.")
        return claims
