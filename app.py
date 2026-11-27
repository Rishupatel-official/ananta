"""Flask entry point: set FIREBASE_PROJECT_ID, then run python app.py."""
from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    from backend.__main__ import serve_app
    serve_app(app)
