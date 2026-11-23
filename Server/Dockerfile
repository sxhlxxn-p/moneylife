FROM node:22-bookworm-slim AS engine-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY Client/package.json ./Client/
COPY Server/package.json ./Server/
COPY Engine/package.json ./Engine/
COPY Shared/package.json ./Shared/
COPY Test/package.json ./Test/
RUN npm ci --omit=dev

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/Server
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home moneylife
COPY --from=engine-dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=engine-dependencies /app/node_modules /app/node_modules
WORKDIR /app/Server
COPY Server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY Server/app ./app
COPY Server/migrations ./migrations
COPY Server/scripts/maintain_database.py Server/scripts/sqlite_backup.py ./scripts/
COPY Engine /app/Engine
COPY fixtures /app/fixtures
COPY Shared/life-events.json /app/Shared/life-events.json
RUN mkdir -p /app/.data && chown -R moneylife:moneylife /app/.data
EXPOSE 8000

FROM runtime AS production
ENV AUTO_MIGRATE=false COOKIE_SECURE=true
USER moneylife
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--proxy-headers"]

FROM runtime AS development
COPY Server/requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY Server/tests ./tests
ENV AUTO_MIGRATE=true COOKIE_SECURE=false
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--reload"]

FROM production AS final
