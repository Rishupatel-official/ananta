"""Run the Flask API with Waitress on Windows or Linux."""
import logging
import os

from waitress import serve
from .app import create_app


def serve_app(app):
    logging.basicConfig(level=logging.INFO)
    verifier = app.extensions["firebase_verifier"]
    try:
        serve(app, host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8000")))
    finally:
        verifier.close()


if __name__ == "__main__":
    serve_app(create_app())
