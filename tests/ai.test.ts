// AI question generation helpers (src/shared/ai.ts). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../src/game/registry';
import {
  AI_HOSTS,
  AI_PROVIDERS,
  buildPrompt,
  cleanGeneratedLines,
  normalizeGenerateRequest,
  parseProviderResponse,
  providerErrorCode,
  providerErrorDetail,
  providerRequest,
  sanitizeKey,
  sanitizeModel
} from '../src/shared/ai';

const KEY = 'test-only-fake-key-0123456789abcdef';

test('keys and model names are validated', () => {
  assert.equal(sanitizeKey(`  ${KEY}\n`), KEY);
  assert.equal(sanitizeKey('gsk_ abc def 1234567890 xyz'), 'gsk_abcdef1234567890xyz');
  assert.equal(sanitizeKey('short'), null);
  assert.equal(sanitizeKey('khóa-có-dấu-1234567890'), null);
  assert.equal(sanitizeKey(42), null);
  assert.equal(sanitizeModel('gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(sanitizeModel('openai/gpt-oss-120b'), 'openai/gpt-oss-120b');
  assert.equal(sanitizeModel('../../v1/files'), null);
  assert.equal(sanitizeModel('model?key=1'), null);
  assert.equal(sanitizeModel(''), null);
});

test('requests go to fixed hosts and never carry the key in the URL', () => {
  const prompt = { system: 's', user: 'u' };
  for (const { id, defaultModel } of AI_PROVIDERS) {
    const request = providerRequest(id, defaultModel, KEY, prompt);
    const url = new URL(request.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(AI_HOSTS.includes(url.hostname), url.hostname);
    assert.ok(!request.url.includes(KEY), `${id}: key in URL`);
    assert.ok(Object.values(request.headers).some((value) => value.includes(KEY)), `${id}: key in a header`);
    assert.ok(!request.body.includes(KEY), `${id}: key in body`);
  }
});

test('provider replies are parsed; errors map to codes', () => {
  assert.equal(parseProviderResponse('gemini', { candidates: [{ content: { parts: [{ text: 'a | b' }, { text: '\nc | d' }] } }] }), 'a | b\nc | d');
  assert.equal(parseProviderResponse('gemini', { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: 'x' }] } }] }), 'x');
  assert.equal(parseProviderResponse('groq', { choices: [{ message: { content: 'x | y' } }] }), 'x | y');
  assert.equal(parseProviderResponse('xai', { choices: [] }), null);
  assert.equal(parseProviderResponse('gemini', null), null);
  assert.equal(providerErrorCode(401), 'bad-key');
  assert.equal(providerErrorCode(429), 'quota');
  assert.equal(providerErrorCode(404), 'bad-request');
  assert.equal(providerErrorCode(400, 'API key not valid. Please pass a valid API key.'), 'bad-key');
  assert.equal(providerErrorCode(503), 'provider');
  assert.equal(providerErrorDetail({ error: { message: 'API key not valid' } }), 'API key not valid');
  assert.equal(providerErrorDetail({ error: 'rate limited' }), 'rate limited');
});

test('renderer requests are clamped', () => {
  assert.equal(normalizeGenerateRequest(null), null);
  assert.equal(normalizeGenerateRequest({ format: '', count: 5 }), null);
  const request = normalizeGenerateRequest({ format: 'Q | A', count: 999, difficulty: 'weird', language: 'fr', topic: 'x'.repeat(500), existing: Array(100).fill('a') });
  assert.ok(request);
  assert.equal(request.count, 50);
  assert.equal(request.difficulty, 'medium');
  assert.equal(request.language, 'sample');
  assert.equal(request.topic.length, 200);
  assert.equal(request.existing.length, 60);
});

test('prompt carries the format, count, topic and items to avoid', () => {
  const prompt = buildPrompt({ game: 'Quiz', format: '# Câu hỏi | A | B | C | D | Đáp án\nThủ đô Pháp? | Paris | Rome | Berlin | Madrid | A', topic: 'địa lý', count: 12, difficulty: 'easy', language: 'sample', existing: ['Thủ đô Pháp?'] });
  assert.match(prompt.user, /Write 12 NEW lines about the topic: "địa lý"/);
  assert.match(prompt.user, /# Câu hỏi \| A \| B/);
  assert.match(prompt.user, /Do not repeat these existing items: Thủ đô Pháp\?/);
  assert.match(prompt.system, /ONLY data lines/);
});

test('replies are cleaned into bank lines', () => {
  const reply = [
    '```text',
    '# Format',
    '1. Thủ đô Nhật Bản? | Tokyo | Osaka | Kyoto | Nagoya | A',
    '- Con vật nào kêu meo meo?|Chó|Mèo|Gà|Vịt|B',
    '',
    '2) Thủ đô Nhật Bản? | Tokyo | Osaka | Kyoto | Nagoya | A',
    'Tab\tseparated\tline',
    '100 | Streamer hát 1 câu',
    '```'
  ].join('\n');
  assert.deepEqual(cleanGeneratedLines(reply), [
    'Thủ đô Nhật Bản? | Tokyo | Osaka | Kyoto | Nagoya | A',
    'Con vật nào kêu meo meo? | Chó | Mèo | Gà | Vịt | B',
    'Tab | separated | line',
    '100 | Streamer hát 1 câu'
  ]);
});

test('every bank with a sample can be sent to the AI, and the samples pass their own check', () => {
  let banks = 0;
  for (const game of GAMES) {
    for (const field of game.settings) {
      if (field.type !== 'textarea' || !field.sample) continue;
      banks += 1;
      const request = normalizeGenerateRequest({ game: game.title, format: field.sample, count: 10 });
      assert.ok(request, `${game.id}.${field.key}`);
      // A reply that repeats the sample's example lines is accepted by the game's parser.
      const lines = cleanGeneratedLines(field.sample);
      if (game.checkBank && lines.length) {
        const report = game.checkBank(field.key, lines.join('\n'));
        assert.ok(report && report.valid === lines.length, `${game.id}.${field.key}: ${JSON.stringify(report)}`);
      }
    }
  }
  assert.ok(banks >= 20, `found ${banks} banks`);
});
