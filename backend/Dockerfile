FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# /data/uploads holds knowledge base attachments. On K8s a Longhorn volume is mounted
# here; the uploads component makes it writable by uid 10001.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data/uploads && chown -R 10001:10001 /data
ENV UPLOAD_DIR=/data/uploads
USER 10001

EXPOSE 8000
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
