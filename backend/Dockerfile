FROM python:3.12-slim

# Utilisateur non-root (DevSecOps)
RUN groupadd --gid 1000 kalanko \
    && useradd --uid 1000 --gid kalanko --shell /bin/bash --create-home kalanko

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

RUN chown -R kalanko:kalanko /app
USER kalanko

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
