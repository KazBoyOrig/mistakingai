import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attempt } from '../shared/types.ts';
import { loadAttempts, saveAttempts, upsertAttempt } from '../src/storage.ts';

const oldAttempt: Attempt = {
  id: 'old', exerciseId: 'discount-then-markup-01', createdAt: '2026-10-08T00:00:00Z',
  selectedStep: 3, explanation: 'Наценка от новой цены', selectedStepCorrect: true,
  explanationAssessment: 'not_evaluated', practiceAnswer: '990', practiceCorrect: true,
};

test('прогресс: старые попытки читаются, новая оценка и рубрика переживают перезагрузку', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored: string | null = JSON.stringify([oldAttempt]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; },
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  assert.deepEqual(loadAttempts().attempts, [oldAttempt]);
  for (const explanationAssessment of ['correct', 'partial', 'incorrect', 'not_evaluated'] as const) {
    const attempt: Attempt = { ...oldAttempt, id: explanationAssessment, explanationAssessment,
      explanationFeedback: 'Сравни базы процентов.', explanationIssue: explanationAssessment === 'not_evaluated' ? 'timeout' : null,
      rubricResults: explanationAssessment === 'not_evaluated' ? [] : [{ criterion: 'Разные базы', met: explanationAssessment === 'correct', evidence: 'Короткий разбор' }],
    };
    assert.equal(saveAttempts([oldAttempt, attempt]), true);
    assert.deepEqual(loadAttempts(), { attempts: [oldAttempt, attempt], error: null });
  }
  stored = JSON.stringify([{ ...oldAttempt, explanationAssessment: 'correct' }]);
  assert.ok(loadAttempts().error);
  stored = '{broken';
  assert.ok(loadAttempts().error);
  assert.equal(saveAttempts(Array.from({ length: 105 }, (_, index) => ({ ...oldAttempt, id: String(index) }))), true);
  assert.equal(loadAttempts().attempts.length, 100);
  assert.equal(loadAttempts().attempts[0].id, '5');
});

test('недоступное хранилище не выдаёт подтверждение сохранения', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  assert.equal(saveAttempts([oldAttempt]), false);
  assert.ok(loadAttempts().error);
});

test('три результата сохраняются независимо; закрепление обновляет попытку, повтор создаёт новую', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const first: Attempt = { ...oldAttempt, id: 'first', selectedStepCorrect: false, practiceAnswer: '', practiceCorrect: null };
  let attempts = upsertAttempt([], first);
  assert.equal(saveAttempts(attempts), true);
  assert.deepEqual(loadAttempts().attempts, [first]);
  const completed: Attempt = { ...first, practiceAnswer: '990 руб.', practiceCorrect: true };
  attempts = upsertAttempt(attempts, completed);
  assert.equal(attempts.length, 1);
  assert.equal(saveAttempts(attempts), true);
  const loaded = loadAttempts().attempts[0];
  assert.equal(loaded.selectedStepCorrect, false);
  assert.equal(loaded.explanationAssessment, 'not_evaluated');
  assert.equal(loaded.practiceCorrect, true);
  attempts = upsertAttempt(attempts, { ...first, id: 'second', selectedStepCorrect: true });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].selectedStepCorrect, false);
  assert.equal(attempts[1].selectedStepCorrect, true);
});
