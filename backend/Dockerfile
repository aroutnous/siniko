# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN addgroup --system siniko && adduser --system --ingroup siniko siniko

FROM base AS builder
COPY requirements.txt .
RUN pip install --user -r requirements.txt

FROM base AS runtime
COPY --from=builder /root/.local /home/siniko/.local
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

ENV PATH=/home/siniko/.local/bin:$PATH

USER siniko
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
