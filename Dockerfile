FROM node:20-alpine AS builder
WORKDIR /app
# Prisma needs OpenSSL present to detect the right query-engine binary; without
# it Prisma defaults to the openssl-1.1.x engine which fails to load on Alpine 3
# (no libssl.so.1.1). See binaryTargets in prisma/schema.prisma.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
ARG BASE_PATH
ENV BASE_PATH=$BASE_PATH
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# OpenSSL for the Prisma query + migration engines at runtime (`migrate deploy`).
RUN apk add --no-cache openssl
# Next.js standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma: schema + migrations + generated client + CLI so `migrate deploy` runs on boot
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
EXPOSE 4000
ENV PORT=4000
ENV HOSTNAME=0.0.0.0
# Next's standalone output prunes node_modules and drops the .bin symlinks, so
# `npx prisma` can't resolve the CLI. Invoke the CLI entrypoint directly instead.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
