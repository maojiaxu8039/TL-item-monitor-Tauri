#!/usr/bin/env python3

import subprocess

PASSWORD = '!Mjx452212889'
SSH_PORT = '10039'
SSH_USER = '15510607744'
SSH_HOST = '100.124.122.65'

print("=== TL Monitor Server Deployment ===")
print(f"Connecting to {SSH_USER}@{SSH_HOST}:{SSH_PORT}...\n")

commands = [
    ('[1/5] Stop old container', 'sudo docker stop tl-monitor-server 2>/dev/null || true'),
    ('[2/5] Remove old container', 'sudo docker rm tl-monitor-server 2>/dev/null || true'),
    ('[3/5] Create directories', 'sudo mkdir -p data config'),
    ('[4/5] Give full permissions to binary', 'sudo chmod 777 tl-monitor-server'),
    ('[5/5] Run container with mounted binary', 'sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server:/app/tl-monitor-server -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config -e TZ=Asia/Shanghai debian:stable-slim bash -c "chmod +x /app/tl-monitor-server && mkdir -p /app/data /app/config && cd /app && ./tl-monitor-server"'),
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
verify_cmd = f'sshpass -p "{PASSWORD}" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p {SSH_PORT} {SSH_USER}@{SSH_HOST} "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor && sudo docker ps | grep tl-monitor && echo ''=== Container Logs ==='' && sudo docker logs tl-monitor-server 2>&1 | tail -30"'
subprocess.run(verify_cmd, shell=True, capture_output=False)

print("\n=== Deployment completed! ===")
print("Access: http://极空间IP:38457/admin")