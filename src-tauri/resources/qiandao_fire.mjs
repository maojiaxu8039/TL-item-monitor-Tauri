import http2 from 'node:http2';
import crypto from 'node:crypto';

const QIANDAD_API = 'api.qiandao.com';
const ENDPOINT = '/c2c-web/v1/common/currency-spu-price-list';

const TAG_IDS = { normal: '1560053', pro: '1560055' };
const SPEC_IDS = { normal: '267416', pro: '267417' };

function getModeFromArg() {
  const arg = process.argv[2] || 'normal';
  return arg === 'pro' ? 'pro' : 'normal';
}

function makeSignature(timestamp, body, packageId = '1044') {
  const signStr = `${packageId}${timestamp}${body}`;
  return crypto.createHash('sha256').update(signStr).digest('hex');
}

async function fetchFirePrice(mode) {
  const timestamp = Date.now().toString();
  const tagId = process.env.QIANDAO_TAG_ID || TAG_IDS[mode];
  const specId = process.env.QIANDAO_SPEC_ID || SPEC_IDS[mode];

  const body = JSON.stringify({
    tagId,
    offset: 0,
    limit: 20,
    specIds: [specId],
  });

  const sign = makeSignature(timestamp, body);

  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${QIANDAD_API}`, {
      rejectUnauthorized: false,
    });

    client.on('error', (err) => {
      client.close();
      reject(new Error(`Connection error: ${err.message}`));
    });

    const req = client.request({
      ':method': 'POST',
      ':path': ENDPOINT,
      'content-type': 'application/json',
      'authorization': 'Bearer undefined',
      'x-request-timestamp': timestamp,
      'x-request-sign-type': 'HMAC_SHA256',
      'x-request-sign-version': 'v1',
      'x-request-package-id': '1044',
      'x-request-package-sign-version': '0.0.1',
      'origin': 'https://qiandao.com',
      'referer': 'https://qiandao.com/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      'x-echo-region': 'CN',
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
    });

    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      client.close();
      try {
        const json = JSON.parse(data);
        if (json.code !== '0') {
          resolve({ error: `API error: code=${json.code}, msg=${json.message || json.msg}` });
          return;
        }

        const item = json.data?.items?.[0];
        if (!item) {
          resolve({ error: 'No fire price data' });
          return;
        }

        const ratioPrice = parseFloat(item.ratioPrice) || 0;
        const rmbPerFire = ratioPrice > 0 ? 10000 / ratioPrice : 0;

        resolve({
          data: {
            fire_per_rmb: ratioPrice,
            rmb_per_fire: rmbPerFire,
            ten_k: rmbPerFire,
            increase_ratio: parseFloat(item.changePct) || 0,
            trading_volume: item.change24h || '0',
            source: '千岛API',
            ts: new Date().toISOString(),
          },
        });
      } catch (e) {
        resolve({ error: `Parse error: ${e.message}` });
      }
    });

    req.on('error', (err) => {
      client.close();
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    const mode = getModeFromArg();
    const result = await fetchFirePrice(mode);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
