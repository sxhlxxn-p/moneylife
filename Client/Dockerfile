FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY Client/package.json ./Client/
COPY Server/package.json ./Server/
COPY Engine/package.json ./Engine/
COPY Shared/package.json ./Shared/
COPY Test/package.json ./Test/
RUN npm ci --omit=dev
COPY Client ./Client
COPY Engine/src ./Engine/src
COPY Shared/life-events.json ./Shared/life-events.json
COPY scripts/build-client.cjs ./scripts/build-client.cjs
RUN node scripts/build-client.cjs /web

FROM nginx:1.28-alpine
COPY --from=build /web /usr/share/nginx/html
COPY Client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 443
