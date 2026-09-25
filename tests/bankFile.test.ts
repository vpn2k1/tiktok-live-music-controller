/* eslint-disable @typescript-eslint/no-explicit-any */
// Bank files (import/samples) and question order. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bankFileToText, checkBankLines, splitCsvLine } from '../src/game/bankFile';
import { parseQuestions } from '../src/game/games/quiz';
import { GAMES } from '../src/game/registry';
import { pickSet } from '../src/game/series';

test('CSV cells: quotes, escaped quotes, semicolons, trailing empties', () => {
  assert.deepEqual(splitCsvLine('Q?,"a, b",c,"say ""hi""",B', ','), ['Q?', 'a, b', 'c', 'say "hi"', 'B']);
  assert.deepEqual(splitCsvLine('apple;quả táo;;', ';'), ['apple', 'quả táo']);
});

test('bankFileToText: csv / tsv / pipe files become bank lines', () => {
  const csv = '﻿# comment\r\nThủ đô VN?,Hà Nội,Huế,"Đà Nẵng, Việt Nam",TP.HCM,A\r\n\r\n7x8?,54,56,58,64,56\r\n';
  assert.equal(bankFileToText(csv, 'quiz.csv'), 'Thủ đô VN? | Hà Nội | Huế | Đà Nẵng, Việt Nam | TP.HCM | A\n7x8? | 54 | 56 | 58 | 64 | 56');
  assert.equal(bankFileToText('apple;quả táo\nbike;xe đạp', 'words.csv'), 'apple | quả táo\nbike | xe đạp');
  assert.equal(bankFileToText('apple\tquả táo\nx | y', 'paste.txt'), 'apple | quả táo\nx | y');
  assert.equal(bankFileToText('a|b\n# note\n  \nc | d', 'bank.txt'), 'a|b\nc | d');
  assert.equal(bankFileToText('Q?,a|b,c,A', 'q.csv'), 'Q? | a/b | c | A', '"|" inside a cell cannot split fields');
});

test('quiz: the correct cell may be a letter or the answer text', () => {
  const [byText] = parseQuestions('2+2? | 3 | 4 | 5 | 4');
  assert.equal(byText?.correct, 1);
  const [byLetter] = parseQuestions('Pick | x | y | B');
  assert.equal(byLetter?.correct, 1);
  assert.equal(parseQuestions('Pick | x | y | z').length, 0);
  const [threeOptions] = parseQuestions('Max? | 3 | 9 | 5 |  | 9');
  assert.deepEqual(threeOptions?.answers, ['3', '9', '5']);
  assert.equal(threeOptions?.correct, 1);
  assert.equal(parseQuestions('Q? | x |  |  | A').length, 0, 'needs 2 options');
});

test('checkBankLines reports the skipped line numbers', () => {
  assert.deepEqual(checkBankLines('ok\n\nbad\nok', (line) => line === 'ok'), { valid: 2, invalid: [3] });
});

test('every sample file is valid for its own game', () => {
  let samples = 0;
  for (const game of GAMES) {
    for (const field of game.settings.filter((f: any) => f.sample)) {
      const text = bankFileToText(field.sample as string, 'sample.txt');
      const report = game.checkBank?.(field.key, text);
      assert.ok(report, `${game.id}.${field.key} has a sample but no checkBank`);
      assert.deepEqual(report.invalid, [], `${game.id}.${field.key} sample has invalid lines`);
      assert.ok(report.valid >= 2);
      samples += 1;
    }
  }
  assert.ok(samples >= 9, `only ${samples} samples`);
});

test('pickSet "file" order: bank order, continuing across rounds and wrapping', () => {
  const first = pickSet(5, 2, [], Math.random, 'file');
  assert.deepEqual(first.indices, [0, 1]);
  const second = pickSet(5, 2, first.asked, Math.random, 'file');
  assert.deepEqual(second.indices, [2, 3]);
  const third = pickSet(5, 2, second.asked, Math.random, 'file');
  assert.deepEqual(third.indices, [4, 0]);
  assert.deepEqual(pickSet(3, 10, [], Math.random, 'file').indices, [0, 1, 2]);
});
