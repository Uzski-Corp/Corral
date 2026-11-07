FROM node:22.23.4-bookworm-slim AS base

# Keep the project root distinct from the App Router's app/ directory.
# With this Next.js webpack build, /app silently drops root layout CSS and fonts.
WORKDIR /workspace/corral
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
ARG NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_PADDLE_ENVIRONMENT=$NEXT_PUBLIC_PADDLE_ENVIRONMENT \
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
RUN NODE_OPTIONS=--max-old-space-size=768 pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /workspace/corral/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/corral/.next/static ./.next/static
COPY --from=builder --chown=node:node /workspace/corral/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
