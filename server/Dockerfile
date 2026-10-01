FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

RUN useradd --create-home --uid 1001 --shell /usr/sbin/nologin corral

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=corral:corral . .
RUN chmod 755 /app/docker-entrypoint.sh

USER corral

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["api"]
