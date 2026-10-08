// Pairing link checks shared by the mobile apps. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPairedPage, isPrivateIPv4, parsePhoneLink } from '../src/shared/phoneLink';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

test('isPrivateIPv4: only home/office LAN ranges', () => {
  for (const ip of ['192.168.1.5', '10.0.0.2', '172.16.0.1', '172.31.255.254']) assert.ok(isPrivateIPv4(ip), ip);
  for (const ip of ['127.0.0.1', '8.8.8.8', '172.32.0.1', '169.254.1.1', '192.168.1.256', 'localhost']) assert.equal(isPrivateIPv4(ip), false, ip);
});

test('parsePhoneLink: accepts the desktop QR link', () => {
  const link = parsePhoneLink(`  http://192.168.1.20:17322/phone#k=${TOKEN}\n`);
  assert.deepEqual(link, {
    address: '192.168.1.20',
    token: TOKEN,
    url: `http://192.168.1.20:17322/phone#k=${TOKEN}`,
    origin: 'http://192.168.1.20:17322'
  });
});

test('parsePhoneLink: rejects anything else', () => {
  const bad = [
    `https://192.168.1.20:17322/phone#k=${TOKEN}`,
    `http://8.8.8.8:17322/phone#k=${TOKEN}`,
    `http://127.0.0.1:17322/phone#k=${TOKEN}`,
    `http://evil.com:17322/phone#k=${TOKEN}`,
    `http://192.168.1.20:80/phone#k=${TOKEN}`,
    `http://192.168.1.20:17322/overlay#k=${TOKEN}`,
    `http://192.168.1.20:17322/phone/#k=${TOKEN}`,
    `http://192.168.1.20:17322/phone?x=1#k=${TOKEN}`,
    `http://user@192.168.1.20:17322/phone#k=${TOKEN}`,
    `http://192.168.1.20:17322/phone#k=${TOKEN}&x=1`,
    'http://192.168.1.20:17322/phone#k=short',
    `javascript:alert(1)//http://192.168.1.20:17322/phone#k=${TOKEN}`,
    42,
    null
  ];
  for (const raw of bad) assert.equal(parsePhoneLink(raw), null, String(raw));
});

test('isPairedPage: same origin and path only', () => {
  const link = parsePhoneLink(`http://10.0.0.2:17322/phone#k=${TOKEN}`)!;
  assert.ok(isPairedPage(`http://10.0.0.2:17322/phone#k=${TOKEN}`, link));
  assert.ok(isPairedPage('http://10.0.0.2:17322/phone', link));
  assert.equal(isPairedPage('http://10.0.0.2:17322/assets/x.js', link), false);
  assert.equal(isPairedPage('http://10.0.0.3:17322/phone', link), false);
  assert.equal(isPairedPage('https://tiktok.com/', link), false);
});
