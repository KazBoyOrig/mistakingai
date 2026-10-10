import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { resetLocalProgress } from '../src/reset-progress.ts';
import { attemptsKey, loadAttempts } from '../src/storage.ts';
import { sessionKey, loadSession, saveSession } from '../src/session.ts';
import type { GameSession } from '../shared/types.ts';

function withStorage(t: TestContext, values: Map<string, string>, failKey?: string) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { if (key === failKey) throw new Error('Storage denied'); values.delete(key); },
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
}

test('сброс удаляет историю и текущую попытку, сохраняя посторонние ключи', t => {
  const values = new Map([[attemptsKey, 'history'], [sessionKey, 'session'], ['unrelated', 'keep']]);
  withStorage(t, values);
  assert.equal(resetLocalProgress(), true);
  assert.deepEqual(loadAttempts(), { attempts: [], error: null });
  assert.deepEqual(loadSession(), { session: null, error: null });
  assert.deepEqual([...values], [['unrelated', 'keep']]);
  assert.equal(resetLocalProgress(), true);
});

test('частичный отказ сброса восстанавливает прежние записи и не сообщает успех', t => {
  const values = new Map([[attemptsKey, 'history'], [sessionKey, 'session']]);
  withStorage(t, values, attemptsKey);
  assert.equal(resetLocalProgress(), false);
  assert.equal(values.get(attemptsKey), 'history');
  assert.equal(values.get(sessionKey), 'session');
});

test('заблокированное хранилище не вызывает падение при сбросе', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  assert.equal(resetLocalProgress(), false);
});

test('уточняющий вопрос сохраняется при редактировании и переживает обновление', t => {
  withStorage(t, new Map());
  const session: GameSession = { exerciseId: 'discount-then-markup-01', hintCount: 1, selectedStep: 3,
    explanation: 'Скидка от 2000', review: null, solution: null, answer: '', practiceResult: null,
    activeAttemptId: null, clarificationQuestion: 'От какой цены берётся наценка?' };
  assert.equal(saveSession(session), true);
  assert.deepEqual(loadSession(), { session, error: null });
  const cleared = { ...session, clarificationQuestion: null };
  assert.equal(saveSession(cleared), true);
  assert.equal(loadSession().session!.clarificationQuestion, null);
});
