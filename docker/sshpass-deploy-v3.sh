#!/usr/bin/env python3

import subprocess

PASSWORD = '!Mjx452212889'
SSH_PORT = '10039'
SSH_USER = '15510607744'
SSH_HOST = '100.124.122.65'

print("=== TL Monitor Server Deployment ===")
print(f"Connecting to {SSH_USER}@{SSH_HOST}:{SSH_PORT}...\n")

step1 = 'sudo docker stop tl-monitor-server 2>/dev/null || true'
step2 = 'sudo docker rm tl-monitor-server 2>/dev/null || true'
step3 = 'sudo mkdir -p data config'
step4 = 'sudo docker create --name tl-monitor-server --restart unless-stopped -p 38457:8080 -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config -e TZ=Asia/Shanghai debian:stable-slim'
step5 = 'sudo docker cp /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server tl-monitor-server:/backup/tl-monitor-server'
step6 = 'sudo docker start tl-monitor-server'

commands = [
    ("[1/6] Stop old container", step1),
    ("[2/6] Remove old container", step2),
    ("[3/6] Create directories", step3),
    ("[4/6] Create new container", step4),
    ("[5/6] Copy binary to container", step5),
    ("[6/6] Start container", step6),
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
verify_cmd = f'sshpass -p "{PASSWORD}" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p {SSH_PORT} {SSH_USER}@{SSH_HOST} "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor && sudo docker ps | grep tl-monitor && echo ''=== Logs ==='' && sudo docker logs tl-monitor-server 2>&1 | tail -30"'
subprocess.run(verify_cmd, shell=True, capture_output=False)

print("\n=== Deployment completed! ===")
print("Access: http://极空间IP:38457/admin")