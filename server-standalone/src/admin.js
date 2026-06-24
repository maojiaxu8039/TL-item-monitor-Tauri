
let serverConfig = null;
let apiPassword = '';
let isAuthenticated = false;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function updateAuthStatus(success, message) {
    const status = document.getElementById('auth-status');
    status.textContent = '';
    status.className = 'auth-status-pill ' + (success ? 'success' : message ? 'error' : '');
    const dot = document.createElement('span');
    dot.className = 'auth-dot';
    const span = document.createElement('span');
    if (success) {
        span.textContent = '已认证';
        isAuthenticated = true;
    } else {
        span.textContent = message || '未认证';
        isAuthenticated = false;
    }
    status.appendChild(dot);
    status.appendChild(span);
    setAuthLocked(!success);
}

function setAuthLocked(locked) {
    document.querySelectorAll('[data-requires-auth]').forEach(el => {
        el.disabled = locked;
    });
    document.querySelectorAll('[data-protected-card]').forEach(card => {
        card.classList.toggle('locked', locked);
    });
    const lockButton = document.getElementById('btn-lock-config');
    if (lockButton) lockButton.disabled = locked;
}

function lockConfig() {
    apiPassword = '';
    isAuthenticated = false;
    updateAuthStatus(false, '');
    showAlert('info', '已锁定配置修改');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return resp;
    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
            throw new Error('请求超时 (' + timeoutMs + 'ms)');
        }
        throw e;
    }
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
    const resp = await fetchWithTimeout(url, options, timeoutMs);
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok && data.success !== false) {
        throw new Error('HTTP ' + resp.status);
    }
    return data;
}

function setBusy(buttonIds, busy, busyText) {
    const ids = Array.isArray(buttonIds) ? buttonIds : [buttonIds];
    ids.forEach(id => {
        const button = document.getElementById(id);
        if (!button) return;
        if (busy) {
            button.dataset.originalText = button.textContent;
            button.textContent = busyText || '处理中...';
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
            delete button.dataset.originalText;
        }
    });
}

async function authenticate() {
    const password = document.getElementById('cfg-password').value;
    if (!password) {
        updateAuthStatus(false, '请输入密码');
        return;
    }
    setBusy('btn-authenticate', true, '认证中...');
    try {
        const data = await fetchJson('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        if (data.success) {
            serverConfig = data.data;
            apiPassword = password;
            updateAuthStatus(true, '');
            showAlert('success', '认证成功');
            loadConfigFields();
            document.getElementById('cfg-password').blur();
        } else {
            updateAuthStatus(false, data.error || '认证失败');
            serverConfig = null;
            apiPassword = '';
        }
    } catch (e) {
        updateAuthStatus(false, e.message);
        serverConfig = null;
        apiPassword = '';
    } finally {
        setBusy('btn-authenticate', false);
    }
}

function loadConfigFields() {
    if (!serverConfig) return;
    document.getElementById('cfg-season').value = serverConfig.season_id;
    const headerSeason = document.getElementById('header-season');
    if (headerSeason) headerSeason.textContent = serverConfig.season_id || '-';
    document.getElementById('cfg-port').value = serverConfig.http_port;
    document.getElementById('cfg-cors').value = (serverConfig.cors_allowed_origins || []).join(', ');
    document.getElementById('cfg-rate-limit').value = (serverConfig.rate_limit ? serverConfig.rate_limit.enabled : true).toString();

    // Load scrape modes
    if (serverConfig.scrape_modes) {
        const normalMode = serverConfig.scrape_modes.find(m => m.mode === 'normal');
        const expertMode = serverConfig.scrape_modes.find(m => m.mode === 'expert');
        document.getElementById('scrape-normal').checked = normalMode ? normalMode.enabled : true;
        document.getElementById('scrape-expert').checked = expertMode ? expertMode.enabled : false;
    }

    if (serverConfig.api_config) {
        document.getElementById('api-qiandao-tag-normal').value = serverConfig.api_config.qiandao_tag_id_normal || '';
        document.getElementById('api-qiandao-spec-normal').value = serverConfig.api_config.qiandao_spec_id_normal || '';
        document.getElementById('api-qiandao-tag-expert').value = serverConfig.api_config.qiandao_tag_id_expert || '';
        document.getElementById('api-qiandao-spec-expert').value = serverConfig.api_config.qiandao_spec_id_expert || '';
        document.getElementById('api-luosi-season-normal').value = serverConfig.api_config.luosi_season_id_normal || '';
        document.getElementById('api-luosi-season-expert').value = serverConfig.api_config.luosi_season_id_expert || '';
        document.getElementById('api-etor-season-normal').value = serverConfig.api_config.etor_season_id_normal || serverConfig.api_config.luosi_season_id_normal || '';
        document.getElementById('api-etor-season-expert').value = serverConfig.api_config.etor_season_id_expert || serverConfig.api_config.luosi_season_id_expert || '';
    }
}

function getPassword() {
    if (!isAuthenticated || !apiPassword) {
        showAlert('error', '请先进行管理员认证');
        return null;
    }
    return apiPassword;
}

function showAlert(type, message) {
    const container = document.getElementById('alert-container');
    container.textContent = '';
    const div = document.createElement('div');
    div.className = 'alert alert-' + type;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => { container.textContent = ''; }, 5000);
}

function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[onclick="showTab('${tabId}')"]`).classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${mins}分钟`;
    return `${mins}分钟`;
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
}

let statusPollTimer = null;
let statusLoadInFlight = false;

async function loadStatus() {
    if (statusLoadInFlight || document.hidden) return;
    statusLoadInFlight = true;
    try {
        const [statusResult, statsResult] = await Promise.allSettled([
            fetchJson('/api/admin/status', {}, 10000),
            fetchJson('/stats', {}, 10000)
        ]);

        if (statusResult.status === 'rejected') {
            console.error('Load status error:', statusResult.reason);
        }

        if (statsResult.status === 'rejected') {
            console.error('Load stats error:', statsResult.reason);
        }

        const data = statusResult.status === 'fulfilled' ? statusResult.value : null;
        
        if (data && data.success) {
            const info = data.data;
            document.getElementById('version').textContent = info.version;
            document.getElementById('uptime').textContent = formatUptime(info.uptime_seconds);
            document.getElementById('stat-season').textContent = info.season_id;
            const headerSeason = document.getElementById('header-season');
            if (headerSeason) headerSeason.textContent = info.season_id || '-';
            document.getElementById('stat-next').textContent = info.next_collection ? formatTime(info.next_collection) : '-';

            const normal = info.last_collection.normal;
            const expert = info.last_collection.expert;

            const statNormal = document.getElementById('stat-normal');
            statNormal.textContent = '';
            const badgeNormal = document.createElement('span');
            badgeNormal.className = normal && normal.is_success ? 'badge badge-success' : 'badge badge-error';
            badgeNormal.textContent = normal && normal.is_success ? '成功' : '失败';
            statNormal.appendChild(badgeNormal);

            const statExpert = document.getElementById('stat-expert');
            statExpert.textContent = '';
            const badgeExpert = document.createElement('span');
            badgeExpert.className = expert && expert.is_success ? 'badge badge-success' : 'badge badge-error';
            badgeExpert.textContent = expert && expert.is_success ? '成功' : '失败';
            statExpert.appendChild(badgeExpert);

            const getDisplayError = (mode) => {
                if (!mode || !mode.error) return '-';
                const err = mode.error;
                if (err.includes('No fire price data')) return '赛季还没开始';
                if (err.includes('Fire scrape error')) return '火价采集失败';
                return err;
            };

            const tbody = document.getElementById('collection-tbody');
            tbody.textContent = '';

            [normal, expert].forEach((mode, idx) => {
                const modeName = idx === 0 ? '普通服' : '专家服';
                if (mode) {
                    const row = document.createElement('tr');
                    const cells = [
                        modeName,
                        mode.fire_price?.toFixed(2) || '-',
                        String(mode.items_count || 0),
                        formatTime(mode.timestamp),
                        null, // badge cell
                        getDisplayError(mode),
                    ];
                    cells.forEach((text, i) => {
                        const td = document.createElement('td');
                        if (i === 4) {
                            const badge = document.createElement('span');
                            badge.className = mode.is_success ? 'badge badge-success' : 'badge badge-error';
                            badge.textContent = mode.is_success ? '成功' : '失败';
                            td.appendChild(badge);
                        } else {
                            td.textContent = text;
                        }
                        row.appendChild(td);
                    });
                    tbody.appendChild(row);
                }
            });

            if (!normal && !expert) {
                const row = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 6;
                td.className = 'loading';
                td.textContent = '暂无采集记录';
                row.appendChild(td);
                tbody.appendChild(row);
            }

            document.getElementById('last-update').textContent = new Date().toLocaleString('zh-CN');
        }

        const statsData = statsResult.status === 'fulfilled' ? statsResult.value : null;
        if (statsData && statsData.success) {
            const stats = statsData.data;
            document.getElementById('stat-normal-fire').textContent = (stats.normal_fire_count || 0) + ' 条';
            document.getElementById('stat-normal-items').textContent = (stats.normal_items_count || 0) + ' 条';
            document.getElementById('stat-expert-fire').textContent = (stats.expert_fire_count || 0) + ' 条';
            document.getElementById('stat-expert-items').textContent = (stats.expert_items_count || 0) + ' 条';
        }
    } finally {
        statusLoadInFlight = false;
    }
}

function startStatusPolling() {
    if (document.hidden) return;
    if (statusPollTimer) return;
    loadStatus();
    statusPollTimer = setInterval(loadStatus, 30000);
}

function stopStatusPolling() {
    if (!statusPollTimer) return;
    clearInterval(statusPollTimer);
    statusPollTimer = null;
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopStatusPolling();
    } else {
        startStatusPolling();
    }
});

window.addEventListener('beforeunload', stopStatusPolling);

async function loadAuditLog() {
    const password = getPassword();
    if (!password) return;

    setBusy('btn-refresh-audit', true, '刷新中...');
    try {
        const data = await fetchJson('/admin/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, limit: 100 })
        });

        if (data.success) {
            const tbody = document.getElementById('audit-tbody');
            tbody.innerHTML = '';

            if (!data.data || data.data.length === 0) {
                const row = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 5;
                td.className = 'loading';
                td.textContent = '暂无审计日志';
                row.appendChild(td);
                tbody.appendChild(row);
                return;
            }

            data.data.forEach(log => {
                const row = document.createElement('tr');

                const actionNames = {
                    'init-season': '初始化赛季',
                    'archive-season': '归档赛季',
                    'update-config': '更新配置',
                    'update-api-config': '更新API配置',
                    'reset-table': '重置表',
                    'reset-season': '重置赛季',
                    'ws-connect': 'WebSocket连接'
                };

                row.innerHTML = `
                    <td>${log.timestamp ? new Date(log.timestamp * 1000).toLocaleString('zh-CN') : '-'}</td>
                    <td class="audit-action">${actionNames[log.action] || log.action || '-'}</td>
                    <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.details)}">${escapeHtml(log.details)}</td>
                    <td>${escapeHtml(log.ip_address)}</td>
                    <td><span class="${log.success ? 'audit-success' : 'audit-failed'}">${log.success ? '✓ 成功' : '✗ 失败'}</span></td>
                `;
                tbody.appendChild(row);
            });
        } else {
            showAlert('error', data.error || '加载审计日志失败');
        }
    } catch (e) {
        showAlert('error', '加载审计日志失败: ' + e.message);
    } finally {
        setBusy('btn-refresh-audit', false);
    }
}

async function loadConfig() {
    const password = getPassword();
    if (!password) return;
    setBusy('btn-load-config', true, '加载中...');
    try {
        const data = await fetchJson('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        if (data.success) {
            serverConfig = data.data;
            loadConfigFields();
            showAlert('success', '配置已加载');
        } else {
            showAlert('error', data.error || '加载配置失败');
        }
    } catch (e) {
        showAlert('error', '加载配置失败: ' + e.message);
    } finally {
        setBusy('btn-load-config', false);
    }
}

async function loadSeasons() {
    try {
        const data = await fetchJson('/seasons', {}, 10000);
        if (data.success && data.data) {
            const exportSelect = document.getElementById('export-season');
            const resetSelect = document.getElementById('reset-season');
            const archiveSelect = document.getElementById('archive-season-select');
            
            while (exportSelect.options.length > 1) {
                exportSelect.remove(1);
            }
            while (resetSelect.options.length > 0) {
                resetSelect.remove(0);
            }
            
            data.data.forEach(season => {
                const opt1 = document.createElement('option');
                opt1.value = season;
                opt1.textContent = season;
                exportSelect.appendChild(opt1);
                
                const opt2 = document.createElement('option');
                opt2.value = season;
                opt2.textContent = season;
                resetSelect.appendChild(opt2);
                
                const opt3 = document.createElement('option');
                opt3.value = season;
                opt3.textContent = season;
                archiveSelect.appendChild(opt3);
            });
        }
    } catch (e) {
        console.error('Load seasons error:', e);
    }
}

async function exportData(format = 'json') {
    const type = document.getElementById('export-type').value;
    const mode = document.getElementById('export-mode').value;
    const rangeSelect = document.getElementById('export-range').value;
    const exportButtonIds = ['btn-export-json', 'btn-export-csv'];

    setBusy(exportButtonIds, true, '导出中...');
    try {
        let min_day = null;
        let max_day = null;

        if (rangeSelect !== 'season') {
            const days = parseInt(rangeSelect);
            min_day = 1;
            max_day = days;
        }

        const seasonParam = document.getElementById('export-season').value ? `&season=${document.getElementById('export-season').value}` : '';
        let dayParams = '';
        if (min_day !== null && max_day !== null) {
            dayParams = `&min_day=${min_day}&max_day=${max_day}`;
        }

        const endpoint = type === 'fire-history' ? '/fire-history-all' : '/items-history-all';
        const BATCH_SIZE = 10000;

        showAlert('info', '正在开始导出...');

        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        let offset = 0;
        let exportedCount = 0;
        let hasMore = true;
        let beforeTimestamp = null;
        let beforeId = null;
        const contentParts = [];
        let jsonFirstItem = true;

        if (format === 'csv') {
            if (type === 'fire-history') {
                contentParts.push('\uFEFF' + ['赛季天', '火价(RMB/万火)', '每RMB火数', '涨幅', '交易量', '数据时间'].join(',') + '\n');
            } else {
                contentParts.push('\uFEFF' + ['物品名称', '物品ID', '物品类型', '火价', '赛季天', '抓取时间'].join(',') + '\n');
            }
        } else {
            contentParts.push('[\n');
        }

        while (hasMore) {
            const cursorParams = beforeTimestamp !== null && beforeId !== null
                ? `&before_timestamp=${beforeTimestamp}&before_id=${beforeId}`
                : `&offset=${offset}`;
            const batchUrl = `${endpoint}?mode=${mode}&limit=${BATCH_SIZE}${cursorParams}${seasonParam}${dayParams}`;
            const data = await fetchJson(batchUrl, {}, 60000);

            if (!data.success) {
                showAlert('error', data.error || '导出失败');
                return;
            }

            const batchItems = data.data || [];
            if (batchItems.length === 0) {
                break;
            }

            exportedCount += batchItems.length;
            showAlert('info', `已获取 ${exportedCount} 条数据...`);
            const lastItem = batchItems[batchItems.length - 1];
            beforeTimestamp = lastItem.scraped_at ?? null;
            beforeId = lastItem.cursor_id ?? null;
            offset = 0;

            if (format === 'csv') {
                if (type === 'fire-history') {
                    const rows = batchItems.map(item => [
                        escapeCSV(item.season_day),
                        escapeCSV(item.rmb_per_10k_fire),
                        escapeCSV(item.fire_per_rmb),
                        escapeCSV(item.increase_ratio),
                        escapeCSV(item.trading_volume),
                        escapeCSV(item.scraped_at ? new Date(item.scraped_at * 1000).toLocaleString('zh-CN') : ''),
                    ].join(','));
                    contentParts.push(rows.join('\n') + '\n');
                } else {
                    const rows = batchItems.map(item => [
                        escapeCSV(item.name),
                        escapeCSV(item.item_id),
                        escapeCSV(item.item_type),
                        escapeCSV(item.fire_price),
                        escapeCSV(item.season_day),
                        escapeCSV(item.scraped_at ? new Date(item.scraped_at * 1000).toLocaleString('zh-CN') : ''),
                    ].join(','));
                    contentParts.push(rows.join('\n') + '\n');
                }
            } else {
                const jsonRows = batchItems.map(item => JSON.stringify(item, null, 2));
                if (jsonRows.length > 0) {
                    contentParts.push((jsonFirstItem ? '' : ',\n') + jsonRows.join(',\n'));
                    jsonFirstItem = false;
                }
            }

            if (batchItems.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                offset += BATCH_SIZE;
            }
        }

        if (exportedCount === 0) {
            showAlert('error', '没有数据可导出');
            return;
        }

        showAlert('info', `开始生成文件...`);

        let content, filename, mimeType;
        if (format === 'csv') {
            content = contentParts.join('');
            filename = `tl_${mode}_${type}_${new Date().toISOString().slice(0,10)}.csv`;
            mimeType = 'text/csv;charset=utf-8';
        } else {
            contentParts.push('\n]');
            content = contentParts.join('');
            filename = `tl_${mode}_${type}_${new Date().toISOString().slice(0,10)}.json`;
            mimeType = 'application/json';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        showAlert('success', `已导出 ${exportedCount} 条数据`);
    } catch (e) {
        showAlert('error', '导出失败: ' + e.message);
    } finally {
        setBusy(exportButtonIds, false);
    }
}

function exportCSV() {
    exportData('csv');
}

async function resetTables() {
    const password = getPassword();
    if (!password) return;

    const season_id = document.getElementById('reset-season').value;
    if (!season_id) {
        showAlert('error', '请选择要重置的赛季');
        return;
    }

    const tables = [];
    const tableTypes = [];

    if (document.getElementById('reset-fire-normal').checked) {
        tables.push(`fire_price_snapshots_${season_id}_normal`);
        tableTypes.push({ type: 'fire', mode: 'normal' });
    }
    if (document.getElementById('reset-fire-expert').checked) {
        tables.push(`fire_price_snapshots_${season_id}_expert`);
        tableTypes.push({ type: 'fire', mode: 'expert' });
    }
    if (document.getElementById('reset-items-normal').checked) {
        tables.push(`item_snapshots_${season_id}_normal`);
        tableTypes.push({ type: 'items', mode: 'normal' });
    }
    if (document.getElementById('reset-items-expert').checked) {
        tables.push(`item_snapshots_${season_id}_expert`);
        tableTypes.push({ type: 'items', mode: 'expert' });
    }

    if (tables.length === 0) {
        showAlert('error', '请至少选择一个要重置的表');
        return;
    }

    const tableNames = tables.join(', ');
    if (!confirm(`⚠️ 危险操作确认\n\n即将重置以下表：\n${tableNames}\n\n此操作将清空所有数据，且无法恢复！\n\n输入"重置"确认：`)) return;
    
    const confirmText = prompt('请再次输入"重置"确认此危险操作：');
    if (confirmText === null || confirmText !== '重置') {
        if (confirmText !== null) {
            showAlert('error', '输入不正确，操作已取消');
        } else {
            showAlert('error', '操作已取消');
        }
        return;
    }

    showAlert('warning', '正在重置表，请稍候...');
    setBusy('btn-reset-tables', true, '重置中...');
    
    let successCount = 0;
    let failCount = 0;
    
    try {
        for (const tt of tableTypes) {
            try {
                const data = await fetchJson('/admin/reset-table', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password,
                        season_id,
                        table_type: tt.type,
                        market_mode: tt.mode
                    })
                });
                if (data.success) {
                    successCount++;
                } else {
                    failCount++;
                    showAlert('error', data.error || '重置失败');
                }
            } catch (e) {
                failCount++;
                showAlert('error', '重置失败: ' + e.message);
            }
        }
    } finally {
        setBusy('btn-reset-tables', false);
    }

    if (failCount === 0) {
        showAlert('success', `已成功重置 ${successCount} 个表`);
        // Clear checkboxes
        document.getElementById('reset-fire-normal').checked = false;
        document.getElementById('reset-fire-expert').checked = false;
        document.getElementById('reset-items-normal').checked = false;
        document.getElementById('reset-items-expert').checked = false;
    } else {
        showAlert('error', `成功: ${successCount}，失败: ${failCount}`);
    }
}

async function initSeason() {
    const season_id = document.getElementById('season-input').value.trim();
    if (!season_id) {
        showAlert('error', '请输入 season_id');
        return;
    }
    const season_name = document.getElementById('season-name-input').value.trim();
    const password = getPassword();
    if (!password) return;
    
    const started_at_input = document.getElementById('season-started-at').value;
    
    if (!started_at_input) {
        showAlert('error', '请选择开服日期（必填）');
        return;
    }
    
    const started_at = Math.floor(new Date(started_at_input).getTime() / 1000);

    const requestBody = { password, season_id, started_at, season_name };
    setBusy('btn-init-season', true, '初始化中...');

    try {
        const data = await fetchJson('/admin/init-season', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        }, 60000);
        if (data.success) {
            showAlert('success', `赛季 ${season_id} 初始化成功`);
            loadSeasons();
        } else {
            showAlert('error', data.error || '初始化失败');
        }
    } catch (e) {
        showAlert('error', '初始化失败: ' + e.message);
    } finally {
        setBusy('btn-init-season', false);
    }
}

async function archiveSeason() {
    const season_id = document.getElementById('archive-season-select').value;
    if (!season_id) {
        showAlert('error', '请选择要归档的赛季');
        return;
    }
    const password = getPassword();
    if (!password) return;
    if (!confirm(`确定要归档赛季 ${season_id} 吗？`)) return;

    setBusy('btn-archive-season', true, '归档中...');
    try {
        const data = await fetchJson('/admin/archive-season', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, season_id })
        }, 30000);
        if (data.success) {
            showAlert('success', `赛季 ${season_id} 已归档`);
            loadSeasons();
        } else {
            showAlert('error', data.error || '归档失败');
        }
    } catch (e) {
        showAlert('error', '归档失败: ' + e.message);
    } finally {
        setBusy('btn-archive-season', false);
    }
}

async function saveApiConfig(buttonId = 'btn-save-item-api') {
    const password = getPassword();
    if (!password) return;
    const parseSeasonId = (id, fallback) => {
        const value = parseInt(document.getElementById(id).value, 10);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const currentApiConfig = (serverConfig && serverConfig.api_config) || {};
    const api_config = {
        qiandao_tag_id_normal: document.getElementById('api-qiandao-tag-normal').value,
        qiandao_spec_id_normal: document.getElementById('api-qiandao-spec-normal').value,
        qiandao_tag_id_expert: document.getElementById('api-qiandao-tag-expert').value,
        qiandao_spec_id_expert: document.getElementById('api-qiandao-spec-expert').value,
        luosi_season_id_normal: parseSeasonId('api-luosi-season-normal', currentApiConfig.luosi_season_id_normal || 1401),
        luosi_season_id_expert: parseSeasonId('api-luosi-season-expert', currentApiConfig.luosi_season_id_expert || 1431),
        etor_season_id_normal: parseSeasonId('api-etor-season-normal', currentApiConfig.etor_season_id_normal || currentApiConfig.luosi_season_id_normal || 1401),
        etor_season_id_expert: parseSeasonId('api-etor-season-expert', currentApiConfig.etor_season_id_expert || currentApiConfig.luosi_season_id_expert || 1431)
    };

    setBusy(buttonId, true, '保存中...');
    try {
        const data = await fetchJson('/admin/update-api-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, api_config })
        }, 30000);

        if (data.success) {
            showAlert('success', 'API配置已保存，重启后生效');
        } else {
            showAlert('error', data.error || '保存失败');
        }
    } catch (e) {
        showAlert('error', '保存失败: ' + e.message);
    } finally {
        setBusy(buttonId, false);
    }
}
function addListeners() {
    document.getElementById('btn-export-json').addEventListener('click', () => exportData('json'));
    document.getElementById('btn-export-csv').addEventListener('click', () => exportData('csv'));
    document.getElementById('btn-init-season').addEventListener('click', initSeason);
    document.getElementById('btn-archive-season').addEventListener('click', archiveSeason);

    document.getElementById('config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = getPassword();
        if (!password) return;
        const config = {
            password: password,
            cors_allowed_origins: document.getElementById('cfg-cors').value.split(',').map(s => s.trim()).filter(s => s),
            rate_limit_enabled: document.getElementById('cfg-rate-limit').value === 'true',
            scrape_modes: [
                { mode: 'normal', enabled: document.getElementById('scrape-normal').checked },
                { mode: 'expert', enabled: document.getElementById('scrape-expert').checked }
            ]
        };

        setBusy('btn-save-config', true, '保存中...');
        try {
            const data = await fetchJson('/api/admin/update-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            }, 30000);
            
            if (data.success) {
                showAlert('success', '配置已保存，重启后生效');
            } else {
                showAlert('error', data.error || '保存失败');
            }
        } catch (e) {
            showAlert('error', '保存失败: ' + e.message);
        } finally {
            setBusy('btn-save-config', false);
        }
    });

    document.getElementById('qiandao-config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveApiConfig('btn-save-fire-api');
    });

    document.getElementById('luosi-config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveApiConfig('btn-save-item-api');
    });

    document.getElementById('cfg-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            authenticate();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setAuthLocked(true);
        startStatusPolling();
        loadSeasons();
        addListeners();
    });
} else {
    setAuthLocked(true);
    startStatusPolling();
    loadSeasons();
    addListeners();
}
