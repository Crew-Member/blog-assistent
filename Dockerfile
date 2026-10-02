# Ein Container fuer API + gebautes Frontend (die API liefert das Frontend selbst aus).
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/api/src/db/prisma packages/api/src/db/prisma
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/api/package.json packages/api/
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/packages/api/src/db/prisma packages/api/src/db/prisma
COPY --from=build /app/packages/web/dist packages/web/dist
WORKDIR /app/packages/api
EXPOSE 3100
# Migrationen non-interaktiv anwenden, dann starten.
CMD ["sh", "-c", "npx prisma migrate deploy --schema src/db/prisma/schema.prisma && node dist/index.js"]
