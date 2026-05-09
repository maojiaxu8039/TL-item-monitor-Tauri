#!/bin/bash
sudo apt-get update >/dev/null 2>&1
sudo apt-get install -y sqlite3 >/dev/null 2>&1
sudo sqlite3 /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data/tl_monitor.db < /tmp/import_fire_price_clean.sql
sudo sqlite3 /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data/tl_monitor.db "SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal;"
