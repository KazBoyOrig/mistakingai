import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { GameSession } from '../shared/types.ts';
import { loadSession, saveSession } from '../src/session.ts';
import { exerciseSolution, reviewAttempt } from './exercises.ts';
import { getExercise } from './exercise-bank.ts';

function storage(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return values;
}
const exercise = getExercise('discount-then-markup-01')!;
const draft: GameSession = {
  exerciseId: exercise.id, hintCount: 1, selectedStep: 1, explanation: 'Думаю, неверна начальная цена.',
  review: null, solution: null, answer: '', practiceResult: null, activeAttemptId: null,
};

test('обновление страницы восстанавливает черновик, обратную связь, разбор и итог отдельно', t => {
  storage(t);
  assert.deepEqual(loadSession(), { session: null, error: null });
  const reviewed: GameSession = { ...draft, review: reviewAttempt(exercise, 1), activeAttemptId: 'attempt-1' };
  const revealed: GameSession = { ...reviewed, solution: exerciseSolution(exercise), answer: '990,00 руб.' };
  const completed: GameSession = { ...revealed, practiceResult: { correct: true, expectedAnswer: 990, explanation: '1000 × 0,9 × 1,1 = 990.' } };
  for (const session of [draft, reviewed, revealed, completed]) {
    assert.equal(saveSession(session), true);
    assert.deepEqual(loadSession(), { session, error: null });
  }
  assert.equal(loadSession().session!.review!.selectedStepCorrect, false);
  assert.equal(loadSession().session!.practiceResult!.correct, true);
  const nextTask: GameSession = { ...draft, exerciseId: 'percentage-points-01', hintCount: 0, selectedStep: null, explanation: '' };
  assert.equal(saveSession(nextTask), true);
  assert.equal(loadSession().session!.exerciseId, 'percentage-points-01');
  assert.equal(loadSession().session!.review, null);
});

test('повреждённый или противоречивый экран отклоняется, история попыток не удаляется', t => {
  const values = storage(t);
  values.set('mistakingai.attempts.v1', 'history-marker');
  const reviewed = { ...draft, review: reviewAttempt(exercise, 1), activeAttemptId: 'attempt-1' };
  const invalid = [
    { ...draft, hintCount: 3 }, { ...draft, selectedStep: 0 }, { ...draft, explanation: 'x'.repeat(2001) },
    { ...reviewed, selectedStep: null }, { ...reviewed, activeAttemptId: null },
    { ...draft, solution: exerciseSolution(exercise) },
    { ...reviewed, practiceResult: { correct: true, expectedAnswer: 990, explanation: 'Верно' } },
    { ...reviewed, review: { ...reviewed.review, explanationAssessment: 'correct' } },
    { ...draft, unrecognizedVersion: true },
  ];
  for (const value of invalid) {
    values.set('mistakingai.session.v1', JSON.stringify(value));
    assert.equal(loadSession().session, null);
    assert.ok(loadSession().error);
    assert.equal(values.get('mistakingai.attempts.v1'), 'history-marker');
  }
  values.set('mistakingai.session.v1', '{bad');
  assert.ok(loadSession().error);
});

test('при заблокированном localStorage игра не падает и не обещает восстановление', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  assert.equal(saveSession(draft), false);
  assert.ok(loadSession().error);
});
