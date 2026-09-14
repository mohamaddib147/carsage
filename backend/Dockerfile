# Runs the CarSage FastAPI service. Works on Render, Fly.io, or any
# Docker-based host — all configuration comes from environment variables
# set on the host, never baked into the image.

FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
