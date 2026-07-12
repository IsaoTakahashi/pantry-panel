# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: builder
# ============================================================
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Resolve dependencies separately for better layer caching
COPY go.mod go.sum ./
RUN go mod download

# Build static binary
COPY . .
ENV CGO_ENABLED=0 \
    GOOS=linux
RUN go build -ldflags="-s -w" -trimpath -o /out/pantry-panel .

# ============================================================
# Stage 2: runtime (alpine for small footprint + sh for debugging)
# ============================================================
FROM alpine:3

# ca-certificates: outbound HTTPS (Supabase, etc.)
# tzdata: timestamp handling
RUN apk add --no-cache ca-certificates tzdata

# Lambda Web Adapter (no-op for local docker run; activates only on AWS Lambda)
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter

# Run as non-root
RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /app
COPY --from=builder /out/pantry-panel /app/pantry-panel

EXPOSE 8080

ENTRYPOINT ["/app/pantry-panel"]
