# Light Bearers Picnic Portal — production image (pnpm + Prisma)
# Works on any container host (Render, Railway, Fly.io, a VPS, etc.)
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

# Install deps first (better layer caching). Prisma schema is needed because
# the postinstall hook runs `prisma generate`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod

# App source
COPY . .

# Receipts persist on a mounted volume in production (UPLOADS_DIR=/var/data/uploads)
VOLUME ["/var/data"]

EXPOSE 4000
# Sync the schema to the database, then start.
CMD ["sh", "-c", "pnpm prisma db push --skip-generate && node server.js"]
