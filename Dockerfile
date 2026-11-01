# syntax=docker/dockerfile:1
FROM node:22.23.4-trixie-slim AS dependencies
WORKDIR /app
RUN npm install --global npm@12.2.1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22.23.4-trixie-slim AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# The same release image can run the one-shot migration job.
COPY --from=builder --chown=node:node /app/scripts/migrate.mjs /app/scripts/admin-bootstrap.mjs /app/scripts/privacy-bootstrap.mjs ./scripts/
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node /app/LICENSE ./LICENSE
LABEL org.opencontainers.image.source="https://github.com/GothenburgOffice/vocabulary-training" \
      org.opencontainers.image.title="vocabulary.training" \
      org.opencontainers.image.description="Personal vocabulary lists and statistical practice" \
      org.opencontainers.image.licenses="MIT"
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Small one-shot migration runner, separate from the application image.
FROM dependencies AS migration
COPY scripts/migrate.mjs scripts/admin-bootstrap.mjs scripts/privacy-bootstrap.mjs ./scripts/
COPY db ./db
USER node
CMD ["node", "scripts/migrate.mjs"]
