FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY model/runtime-requirements.txt model/runtime-requirements.txt
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY model/__init__.py model/inference.py model/model.pkl model/model.info.json ./model/
COPY backend/__init__.py backend/__main__.py backend/auth.py backend/app.py ./backend/
USER 10001
EXPOSE 8000
CMD ["python", "-m", "backend"]
