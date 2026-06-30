FROM golang:1.23-bookworm AS build

WORKDIR /app/server
COPY server ./
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/infinite-canvas-server ./cmd/api

FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/infinite-canvas-server /app/infinite-canvas-server

ENV APP_ENV=production
ENV SERVER_ADDR=:8080
EXPOSE 8080
CMD ["/app/infinite-canvas-server"]
