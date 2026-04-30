#!/usr/bin/env node
/**
 * 千岛火价获取 - Node.js http2 直连方案
 * 调用：node qiandao_fire.mjs [普通|pro]
 * 普通=赛季普通(tagId:1560053, specId:267416)
 * pro=赛季专家(tagId:1560055, specId:267417)
 */
import http2 from 'http2';

const mode = process.argv[2] === 'pro' ? '专家' : '普通';
const tagId = process.argv[2] === 'pro' ? '1560055' : '1560053';
const specId = process.argv[2] === 'pro' ? '267417' : '267416';

function fetchPrice() {
  return new Promise((resolve, reject) => {
    const client = http2.connect('https://api.qiandao.com', { rejectUnauthorized: false });

    client.on('error', (err) => reject(err));

    client.on('connect', () => {
      const ts = '' + Date.now();
      const req = client.request({
        ':method': 'POST',
        ':path': '/c2c-web/v1/common/currency-spu-price-list',
        'content-type': 'application/json',
        'authorization': 'Bearer undefined',
        'x-request-timestamp': ts,
        'x-request-sign-type': 'HMAC_SHA256',
        'x-request-sign-version': 'v1',
        'x-request-package-id': '1044',
        'origin': 'https://qiandao.com',
        'referer': 'https://qiandao.com/',
        'user-agent': 'Mozilla/5.0',
        'x-echo-region': 'CN'
      });

      let d = '';
      req.on('data', c => d += c);
      req.on('end', () => {
        client.destroy();
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(new Error('Parse error: ' + e.message));
        }
      });
      req.on('error', (err) => {
        client.destroy();
        reject(err);
      });

      req.end(JSON.stringify({ tagId: tagId, offset: 0, limit: 20, specIds: [specId] }));
    });
  });
}

async function main() {
  try {
    const data = await fetchPrice();
    const item = data.data && data.data.items ? data.data.items[0] : null;
    if (!item) {
      console.log(JSON.stringify({ error: 'No data' }));
      return;
    }
    const ratioPrice = parseFloat(item.ratioPrice) || 0;
    const ten_k = ratioPrice > 0 ? Math.round(10000 / ratioPrice * 10000) / 10000 : 0;
    console.log(JSON.stringify({
      code: "0",
      data: {
        fire_per_rmb: ratioPrice,
        rmb_per_fire: ratioPrice > 0 ? Math.round(10000 / ratioPrice * 10000) / 10000 : 0,
        ten_k: ten_k,
        increase_ratio: item.changePct || 0,
        trading_volume: item.change24h || '',
        source: '千岛API-' + (mode === '专家' ? '赛季专家' : '赛季普通'),
        ts: new Date().toISOString().replace('T', ' ').substring(0, 16),
      }
    }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
