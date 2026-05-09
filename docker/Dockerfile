FROM debian:stable-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY tl-monitor-server /app/tl-monitor-server
RUN chmod +x /app/tl-monitor-server

RUN mkdir -p /app/data /app/config

EXPOSE 8080

ENV TZ=Asia/Shanghai

CMD ["./tl-monitor-server"]
