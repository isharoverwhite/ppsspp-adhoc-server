FROM node:20-alpine AS webapp-build
WORKDIR /app/webapp
COPY webapp/package*.json ./
RUN npm ci --legacy-peer-deps
COPY webapp/ ./
RUN npx prisma generate
RUN npm run build

FROM alpine:3.18 AS server-build
# Install build dependencies
RUN apk add --no-cache gcc make musl-dev sqlite-dev
WORKDIR /app
COPY . .
RUN make

FROM node:20-alpine
# Install runtime dependencies
RUN apk add --no-cache \
    sqlite-libs \
    tzdata \
    openssl

WORKDIR /app

# Copy binary
COPY --from=server-build /app/AdhocServer /app/AdhocServer

# Copy Next.js standalone build
# Next.js standalone output helps reduce image size
COPY --from=webapp-build /app/webapp/public /app/webapp/public
COPY --from=webapp-build /app/webapp/.next/standalone /app/webapp/
COPY --from=webapp-build /app/webapp/.next/static /app/webapp/.next/static

# Ensure www directory exists for status.xml
RUN mkdir -p /app/www

RUN cd /app/webapp && npm install fast-xml-parser prisma @prisma/client --legacy-peer-deps

# Script to run both
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo '/app/AdhocServer &' >> /app/start.sh && \
    echo 'cd /app/webapp && node server.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Ports: 27312 (Adhoc), 3000 (Next.js Admin)
EXPOSE 27312/tcp
EXPOSE 3000/tcp

ENTRYPOINT [ "/app/start.sh" ]
