#!/usr/bin/env python3

import subprocess

PASSWORD = '!Mjx452212889'
SSH_PORT = '10039'
SSH_USER = '15510607744'
SSH_HOST = '100.124.122.65'

print("=== TL Monitor Server Deployment ===")
print(f"Connecting to {SSH_USER}@{SSH_HOST}:{SSH_PORT}...\n")

commands = [
    ('[1/6] Stop old container', 'sudo docker stop tl-monitor-server 2>/dev/null || true'),
    ('[2/6] Remove old container', 'sudo docker rm tl-monitor-server 2>/dev/null || true'),
    ('[3/6] Create data directories', 'sudo mkdir -p data config && sudo chmod 777 data config'),
    ('[4/6] Copy binary to /tmp', 'sudo cp tl-monitor-server /tmp/ && sudo chmod 755 /tmp/tl-monitor-server'),
    ('[5/6] Run container with tmpfs', 'sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config --tmpfs /app:rw,exec debian:stable-slim sh -c "cp /tmp/tl-monitor-server /app/tl-monitor-server && cd /app && ./tl-monitor-server"'),
    ('[6/6] Verify container is running', 'sudo docker ps | grep tl-monitor'),
]

for desc, cmd in commands:
    print(f"{desc}...")
    full_cmd = f'sshpass -p "{PASSWORD}" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p {SSH_PORT} {SSH_USER}@{SSH_HOST} "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor && {cmd}"'
    result = subprocess.run(full_cmd, shell=True, capture_output=False)
    if result.returncode != 0:
        print(f"  Warning: Command failed")
    else:
        print(f"  Success!")

print("\n=== Verifying deployment ===")
verify_cmd = f'sshpass -p "{PASSWORD}" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p {SSH_PORT} {SSH_USER}@{SSH_HOST} "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor && sudo docker logs tl-monitor-server 2>&1 | tail -30"'
subprocess.run(verify_cmd, shell=True, capture_output=False)

print("\n=== Deployment completed! ===")
print("Access: http://极空间IP:38457/admin")