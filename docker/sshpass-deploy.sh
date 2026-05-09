#!/bin/bash

PASSWORD='!Mjx452212889'
SSH_PORT='10039'
SSH_USER='15510607744'
SSH_HOST='100.124.122.65'

export SSHPASS="$PASSWORD"

echo "=== Step 1: Installing sshpass ==="
which sshpass || brew install hudochenkov/sshpass/sshpass 2>/dev/null || brew install https://raw.githubusercontent.com/hudochenkov/homebrew-sshpass/master/sshpass.rb 2>/dev/null || echo "sshpass installation skipped"

if ! which sshpass >/dev/null 2>&1; then
    echo "sshpass not available, using expect instead"
    /Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/docker/auto-deploy.exp
    exit $?
fi

echo "=== Step 2: Running deployment commands ==="

sshpass -v ssh -o StrictHostKeyChecking=no -p $SSH_PORT $SSH_USER@$SSH_HOST << 'ENDSSH'
cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor
sudo chmod +x tl-monitor-server
sudo mkdir -p data config
sudo docker stop tl-monitor-server 2>/dev/null || true
sudo docker rm tl-monitor-server 2>/dev/null || true
sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config -e TZ=Asia/Shanghai debian:stable-slim sh -c 'cp /backup/tl-monitor-server /app/ && chmod +x /app/tl-monitor-server && cd /app && ./tl-monitor-server'
sudo docker cp /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server tl-monitor-server:/backup/
sleep 5
echo "=== Container Status ==="
sudo docker ps | grep tl-monitor
echo "=== Container Logs ==="
sudo docker logs tl-monitor-server 2>&1 | tail -30
ENDSSH

echo "=== Deployment completed ==="