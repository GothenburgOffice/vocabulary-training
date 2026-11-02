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

# The VS Code dev container only: development plus tools for working inside it. Installed
# before the source is copied so the layer stays cached. psql 18 (matching the database) and
# gh come from the PostgreSQL project's and GitHub's signed apt repositories, since Debian's
# are a major version behind. /app is a bind mount from the host, so git would otherwise
# refuse it as owned by another user.
FROM dependencies AS devcontainer
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && install -d /etc/apt/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /etc/apt/keyrings/postgresql.asc \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /etc/apt/keyrings/githubcli.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install --yes --no-install-recommends \
        gh git jq less openssh-client postgresql-client-18 procps ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system --add safe.directory /app
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
COPY --from=builder --chown=node:node /app/scripts/migrate.mjs /app/scripts/admin-bootstrap.mjs /app/scripts/settings-bootstrap.mjs ./scripts/
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
COPY scripts/migrate.mjs scripts/admin-bootstrap.mjs scripts/settings-bootstrap.mjs ./scripts/
COPY db ./db
USER node
CMD ["node", "scripts/migrate.mjs"]
