#!/usr/bin/expect -f

set timeout 60
set password "!Mjx452212889"
set ssh_port "10039"
set ssh_user "15510607744"
set ssh_host "100.124.122.65"

spawn ssh -p $ssh_port $ssh_user@$ssh_host

expect {
    "password:" {
        send "$password\r"
    }
    timeout {
        puts "SSH connection timeout"
        exit 1
    }
}

expect "$ "
send "cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor\r"

expect "$ "
send "sudo chmod +x tl-monitor-server\r"

expect {
    "password for 15510607744:" {
        send "$password\r"
    }
    "$ "
}

expect "$ "
send "sudo mkdir -p data config\r"

expect "$ "
send "sudo docker stop tl-monitor-server 2>/dev/null || true\r"

expect "$ "
send "sudo docker rm tl-monitor-server 2>/dev/null || true\r"

expect "$ "
send "sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config -e TZ=Asia/Shanghai debian:stable-slim sh -c 'cp /backup/tl-monitor-server /app/ && chmod +x /app/tl-monitor-server && cd /app && ./tl-monitor-server'\r"

expect "$ "
send "sudo docker cp /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server tl-monitor-server:/backup/\r"

expect "$ "
send "sleep 5\r"

expect "$ "
send "sudo docker ps | grep tl-monitor\r"

expect "$ "
send "sudo docker logs tl-monitor-server\r"

expect "$ "
send "echo '=========================================='\r"
expect "$ "
send "echo 'Deployment completed!'\r"
expect "$ "
send "echo 'Access: http://<your-极空间IP>:38457'\r"
expect "$ "
send "exit\r"

expect eof
