# Multi-stage Dockerfile for Google Cloud Run / Container Deployment
FROM node:22-slim AS web-builder
WORKDIR /app/carddemo-web
COPY carddemo-web/package*.json ./
RUN npm install --no-audit --no-fund
COPY carddemo-web/ ./
RUN npm run build

FROM rust:1.85-slim-bookworm AS rust-builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libsqlite3-0 && rm -rf /var/lib/apt/lists/*
COPY --from=rust-builder /app/target/release/carddemo-modern /app/carddemo-modern
COPY --from=web-builder /app/carddemo-web/dist /app/carddemo-web/dist
COPY data /app/data
COPY golden_baseline /app/golden_baseline
COPY migrations /app/migrations
ENV PORT=8080
EXPOSE 8080
CMD ["/app/carddemo-modern"]
