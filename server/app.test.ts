import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { demoExercise, demoReference, parseNumericAnswer, reviewAttempt } from './exercises.ts';

test('проверенный эталон: наценка применяется к цене после скидки', () => {
  assert.equal(demoReference.firstWrongStep, 3);
  assert.equal(2000 * 0.8 * 1.2, 1920);
  assert.equal(1000 * 90 * 110 / 10_000, demoReference.practice.answer);
  assert.equal(reviewAttempt(3).selectedStepCorrect, true);
  assert.equal(reviewAttempt(2).selectedStepCorrect, false);
  assert.match(reviewAttempt(4).feedback, /раньше/);
  assert.equal(reviewAttempt(3).explanationAssessment, 'not_evaluated');
});

test('числовые ответы: запятая, точка, рубли и пробелы; без формул', () => {
  for (const value of ['990', '990,00', '990.0', ' 990 ₽ ', '9\u00a090 ₽']) {
    assert.equal(parseNumericAnswer(value), 990);
  }
  for (const value of ['', ' ', '990рублей', '990%', '900*1.1', '990abc', 'Infinity', '-990', '0x3de', '990,0,0']) {
    assert.equal(parseNumericAnswer(value), null);
  }
  assert.equal(parseNumericAnswer('990,01'), 990.01);
});

test('API: полный демонстрационный сценарий и некорректные запросы', async t => {
  const server = createApp();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mode, 'demo');
  const taskResponse = await fetch(base + '/api/exercises/demo');
  assert.equal(taskResponse.status, 200);
  const task = await taskResponse.json();
  assert.equal(task.steps.length, 4);
  assert.equal(task.firstWrongStep, undefined);
  assert.equal(task.correctSteps, undefined);
  assert.equal(task.practice, undefined);

  const reviewResponse = await post('/api/review', {
    exerciseId: demoExercise.id, selectedStep: 3,
    explanation: 'Наценку надо считать от 1600, потому что цена после скидки изменилась.',
  });
  assert.equal(reviewResponse.status, 200);
  const review = await reviewResponse.json();
  assert.equal(review.selectedStepCorrect, true);
  assert.equal(review.explanationAssessment, 'not_evaluated');
  assert.equal(review.practice.answer, undefined);

  const valid = await post('/api/practice', { exerciseId: demoExercise.id, answer: '990,00' });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).correct, true);
  const incorrect = await post('/api/practice', { exerciseId: demoExercise.id, answer: '1000' });
  assert.equal((await incorrect.json()).correct, false);
  const almost = await post('/api/practice', { exerciseId: demoExercise.id, answer: '990.001' });
  assert.equal((await almost.json()).correct, false);

  for (const selectedStep of [0, 5, 2.5, '3', null]) {
    assert.equal((await post('/api/review', { exerciseId: demoExercise.id, selectedStep, explanation: 'Достаточно длинное объяснение' })).status, 400);
  }
  for (const explanation of ['', '         ', 'x'.repeat(2001), 123]) {
    assert.equal((await post('/api/review', { exerciseId: demoExercise.id, selectedStep: 3, explanation })).status, 400);
  }
  assert.equal((await post('/api/practice', { exerciseId: demoExercise.id, answer: '990%' })).status, 400);
  assert.equal((await post('/api/practice', { exerciseId: 'missing', answer: '990' })).status, 404);
  assert.equal((await post('/api/review', null)).status, 400);
  assert.equal((await fetch(base + '/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await fetch(base + '/api/review', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/api/missing')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 403);
});
