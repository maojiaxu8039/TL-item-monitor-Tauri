#!/usr/bin/env python3

import subprocess
import sys

PASSWORD = '!Mjx452212889'
SSH_PORT = '10039'
SSH_USER = '15510607744'
SSH_HOST = '100.124.122.65'

commands = [
    'sudo chmod +x tl-monitor-server',
    'sudo mkdir -p data config',
    'sudo docker stop tl-monitor-server 2>/dev/null || true',
    'sudo docker rm tl-monitor-server 2>/dev/null || true',
    'sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config -e TZ=Asia/Shanghai debian:stable-slim sh -c \'cp /backup/tl-monitor-server /app/ && chmod +x /app/tl-monitor-server && cd /app && ./tl-monitor-server\'',
    'sudo docker cp /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server tl-monitor-server:/backup/',
]

print("=== TL Monitor Server Deployment ===")
print(f"Connecting to {SSH_USER}@{SSH_HOST}:{SSH_PORT}...")

for i, cmd in enumerate(commands, 1):
    print(f"\n[Step {i}/{len(commands)}] {cmd.split(' ')[0]}...")
    full_cmd = f'sshpass -p "{PASSWORD}" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p {SSH_PORT} {SSH_USER}@{SSH_HOST} "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor && {cmd}"'
    result = subprocess.run(full_cmd, shell=True, capture_output=False)
    if result.returncode != 0:
        print(f"Warning: Command failed with exit code {result.returncode}")

print("\n=== Verifying deployment ===")
verify_cmd = f'sshpass -p "{PASSWORD}" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p {SSH_PORT} {SSH_USER}@{SSH_HOST} "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor && sudo docker ps | grep tl-monitor && echo ''=== Logs ==='' && sudo docker logs tl-monitor-server 2>&1 | tail -30"'

subprocess.run(verify_cmd, shell=True, capture_output=False)

print("\n=== Deployment script completed ===")