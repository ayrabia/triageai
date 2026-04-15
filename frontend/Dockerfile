FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time env vars (NEXT_PUBLIC_* are baked into the bundle, not read at runtime)
ARG API_URL
ARG NEXT_PUBLIC_COGNITO_REGION=us-east-1
ARG NEXT_PUBLIC_COGNITO_APP_CLIENT_ID

ENV API_URL=${API_URL}
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

# App Runner overrides HOSTNAME with the container's actual hostname, which makes
# Next.js bind to a specific IP instead of 0.0.0.0. Force it via the shell.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
