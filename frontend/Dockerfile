FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Only NEXT_PUBLIC_* vars need to be baked in at build time.
# Server-side vars (DATABASE_URL, COGNITO_USER_POOL_ID, etc.) are injected
# at runtime via ECS task definition environment variables.
ARG NEXT_PUBLIC_COGNITO_REGION=us-east-1
ARG NEXT_PUBLIC_COGNITO_APP_CLIENT_ID

ENV NEXT_PUBLIC_COGNITO_REGION=${NEXT_PUBLIC_COGNITO_REGION}
ENV NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=${NEXT_PUBLIC_COGNITO_APP_CLIENT_ID}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime image ----
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# standalone output bundles everything the server needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
