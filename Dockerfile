# Build Next.js
FROM node:20-alpine AS webapp-build
WORKDIR /app/webapp
COPY webapp/package*.json ./
RUN npm ci --legacy-peer-deps || npm ci
COPY webapp/ ./
RUN npx prisma generate || true
RUN npm run build

# Build Go Server
FROM golang:1.21-alpine AS server-build
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /app/src
COPY src/go.mod src/go.sum* ./
RUN go mod download || true
COPY src/ ./
RUN go mod tidy
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o ppsspp-adhoc-go .

# Final Runtime
FROM alpine:3.18
RUN apk add --no-cache sqlite-libs tzdata nodejs npm
WORKDIR /app

# Copy Go binary
COPY --from=server-build /app/src/ppsspp-adhoc-go /app/AdhocServer

# Copy Next.js standalone build
COPY --from=webapp-build /app/webapp/public /app/webapp/public
COPY --from=webapp-build /app/webapp/.next/standalone /app/webapp/
COPY --from=webapp-build /app/webapp/.next/static /app/webapp/.next/static

# Ensure www directory exists for status.xml
RUN mkdir -p /app/www

# Script to run both
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'ADHOC_STATUS_PATH=/app/www/status.xml /app/AdhocServer &' >> /app/start.sh && \
    echo 'cd /app/webapp && node server.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Ports: 27312 (Adhoc), 3000 (Next.js Admin)
EXPOSE 27312/tcp
EXPOSE 3000/tcp

ENTRYPOINT [ "/app/start.sh" ]
