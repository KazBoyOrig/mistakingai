import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attempt } from '../shared/types.ts';
import { loadAttempts, saveAttempts } from '../src/storage.ts';

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
