FROM node:22-bookworm-slim AS engine-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY Client/package.json ./Client/
COPY Server/package.json ./Server/
COPY Engine/package.json ./Engine/
COPY Shared/package.json ./Shared/
COPY Test/package.json ./Test/
RUN npm ci --omit=dev

FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/Server

RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=engine-dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=engine-dependencies /app/node_modules /app/node_modules

WORKDIR /app/Server

COPY Server/requirements.txt Server/requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY Server/app ./app
COPY Server/tests ./tests
COPY Engine /app/Engine

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
