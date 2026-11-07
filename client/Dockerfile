FROM node:22-bookworm-slim

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Bump when the web image must not reuse a previous Next build.
ARG CORRAL_SOURCE_REV=sign-in-screens
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
ARG NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_PADDLE_ENVIRONMENT=$NEXT_PUBLIC_PADDLE_ENVIRONMENT \
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_CLIENT_TOKEN

RUN echo "corral web ${CORRAL_SOURCE_REV}" \
    && NODE_OPTIONS=--max-old-space-size=768 pnpm build --webpack \
    && chown -R node:node /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

USER node

EXPOSE 3000

CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
