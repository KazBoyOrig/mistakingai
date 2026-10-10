import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { ExplanationVerdict } from '../shared/types.ts';
import { createApp } from './app.ts';
import { getExercise } from './exercise-bank.ts';
import { explanationCases } from './explanation-cases.ts';
import { buildEvaluationRequest, createExplanationEvaluator, parseModelResponse, validateEvaluation } from './explanation-evaluator.ts';

const exercise = getExercise('discount-then-markup-01')!;
function modelValue(verdict: ExplanationVerdict) {
  return { verdict, feedback: 'Сравни базы процентов.', followUpQuestion: ['partial', 'unclear'].includes(verdict) ? 'От какой цены берётся наценка?' : null };
}
function envelope(value: unknown) {
  return { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] };
}
function fakeFetch(value: unknown): typeof fetch { return async () => Response.json(value); }

test('JSON: четыре вердикта, короткая обратная связь и вопрос только для partial/unclear', () => {
  for (const verdict of ['correct', 'partial', 'incorrect', 'unclear'] as const) {
    assert.deepEqual(validateEvaluation(modelValue(verdict)), { ...modelValue(verdict), explanationIssue: null });
  }
});

test('неверный формат и несогласованный уточняющий вопрос не создают автоматическую оценку', () => {
  const correct = modelValue('correct');
  const invalid = [
    {}, { ...correct, verdict: 'excellent' }, { ...correct, verdict: null },
    { ...correct, feedback: '' }, { ...correct, feedback: 'x'.repeat(501) },
    { ...correct, feedback: 123 }, { verdict: 'correct', feedback: 'Верно' },
    { ...correct, followUpQuestion: 'Почему?' }, { ...correct, selectedStepCorrect: true },
    { ...modelValue('partial'), followUpQuestion: null }, { ...modelValue('unclear'), followUpQuestion: '' },
    { ...modelValue('partial'), followUpQuestion: 'От какой цены? Почему?' },
    { ...modelValue('unclear'), followUpQuestion: 'Уточни рассуждение.' },
    { ...modelValue('partial'), followUpQuestion: 'x'.repeat(240) + '?' },
  ];
  for (const value of invalid) {
    const result = parseModelResponse(envelope(value));
    assert.equal(result.verdict, null);
    assert.equal(result.explanationIssue, 'invalid_response');
    assert.equal(result.followUpQuestion, null);
  }
});

test('Responses API: текст сообщения, отказ, незавершённый и повреждённый ответ', () => {
  assert.equal(parseModelResponse(envelope(modelValue('correct'))).verdict, 'correct');
  const invalid = [null, {}, { status: 'incomplete', output: [] }, { status: 'failed', output: [] },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }, { type: 'output_text', text: '{}' }] }] },
  ];
  for (const value of invalid) assert.equal(parseModelResponse(value).explanationIssue, 'invalid_response');
  assert.equal(parseModelResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }).explanationIssue, 'refused');
});

test('контрольные тексты: все четыре оценки, пять ошибок и разные правильные формулировки', () => {
  assert.equal(explanationCases.length, 35);
  assert.equal(new Set(explanationCases.map(item => item.id)).size, 35);
  for (const item of explanationCases) {
    const task = getExercise(item.exerciseId)!;
    assert.ok(task);
    assert.ok(item.explanation.trim().length > 0 && item.explanation.length <= 2000);
    assert.equal(item.expected, item.kind === 'injection' ? 'incorrect' : item.kind);
    const request = buildEvaluationRequest(task, item.selectedStep, item.explanation, 'gpt-4o-mini');
    assert.equal(request.input.length, 2);
    assert.equal(request.input[0].role, 'system');
    assert.deepEqual(JSON.parse(request.input[1].content), { explanation: item.explanation });
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    assert.equal(request.text.format.schema.additionalProperties, false);
    const reference = JSON.parse(request.input[0].content.split('Проверенный эталон: ')[1]);
    assert.equal(reference.prompt, task.prompt);
    assert.deepEqual(reference.mistakenSteps, task.steps);
    assert.equal(reference.selectedStep, item.selectedStep);
    assert.deepEqual(reference.correctSteps, task.correctSteps);
    assert.equal(reference.referenceExplanation, task.errorExplanation);
    assert.ok(!request.input[0].content.includes(item.explanation));
  }
  for (const type of ['equal-cancel', 'wrong-base', 'sum-sequential', 'percentage-points', 'reverse-value']) {
    const cases = explanationCases.filter(item => getExercise(item.exerciseId)!.errorType === type);
    assert.deepEqual(new Set(cases.map(item => item.kind)), new Set(['correct', 'partial', 'incorrect', 'unclear', 'injection']));
    assert.equal(cases.filter(item => item.expected === 'correct').length, 3);
  }
});

test('без ключа запросов нет, verdict=null и причина отображается явно', async () => {
  let calls = 0;
  const evaluator = createExplanationEvaluator({ apiKey: '', fetcher: async () => { calls += 1; throw new Error(); } });
  assert.equal(evaluator.configured, false);
  const result = await evaluator.evaluate(exercise, 3, exercise.errorExplanation);
  assert.equal(result.verdict, null);
  assert.equal(result.explanationIssue, 'not_configured');
  assert.equal(calls, 0);
});

test('провайдер получает серверный ключ, выбранный шаг и проверенный контекст', async () => {
  const evaluator = createExplanationEvaluator({ apiKey: 'test-secret', model: 'gpt-4o-mini', fetcher: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-secret');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.store, false);
    assert.equal(body.input.some((item: { content: string }) => item.content.includes('test-secret')), false);
    assert.equal(JSON.parse(body.input[0].content.split('Проверенный эталон: ')[1]).selectedStep, 2);
    return Response.json(envelope(modelValue('partial')));
  } });
  assert.equal((await evaluator.evaluate(exercise, 2, 'Объяснение от ученика')).verdict, 'partial');
});

test('HTTP ошибки, сбой сети и тайм-аут не выставляют оценку и не раскрывают секреты', async () => {
  for (const status of [400, 401, 429, 500]) {
    const evaluator = createExplanationEvaluator({ apiKey: 'secret-marker', fetcher: async () => new Response('secret-marker provider error', { status }) });
    const result = await evaluator.evaluate(exercise, 3, 'Объяснение от ученика');
    assert.equal(result.explanationIssue, 'unavailable');
    assert.equal(result.verdict, null);
    assert.equal(JSON.stringify(result).includes('secret-marker'), false);
  }
  const disconnected = createExplanationEvaluator({ apiKey: 'secret-marker', fetcher: async () => { throw new Error('secret-marker'); } });
  assert.equal((await disconnected.evaluate(exercise, 3, 'Короткий текст')).explanationIssue, 'unavailable');
  const timedOut = createExplanationEvaluator({ apiKey: 'test-key', timeoutMs: 5, fetcher: async (_url, init) => {
    await new Promise(resolve => setTimeout(resolve, 20));
    init?.signal?.throwIfAborted();
    return Response.json({});
  } });
  const timeout = await timedOut.evaluate(exercise, 3, 'Короткий текст');
  assert.equal(timeout.verdict, null);
  assert.equal(timeout.explanationIssue, 'timeout');
  const badJson = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => new Response('not json') });
  assert.equal((await badJson.evaluate(exercise, 3, 'Короткий текст')).explanationIssue, 'invalid_response');
});

test('двойное нажатие объединяет одинаковые запросы; новая проверка после завершения разрешена', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => { calls += 1; await gate; return Response.json(envelope(modelValue('correct'))); } });
  const first = evaluator.evaluate(exercise, 3, 'Наценка от новой цены');
  const second = evaluator.evaluate(exercise, 3, 'Наценка от новой цены');
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, await second);
  await evaluator.evaluate(exercise, 3, 'Наценка от новой цены');
  assert.equal(calls, 2);
});

test('лимит трёх разных проверок освобождается после завершения', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => { await gate; return Response.json(envelope(modelValue('correct'))); } });
  const pending = Array.from({ length: 3 }, (_, index) => evaluator.evaluate(exercise, 3, 'Текст ' + index));
  assert.equal((await evaluator.evaluate(exercise, 3, 'Четвёртый текст')).explanationIssue, 'busy');
  release();
  assert.ok((await Promise.all(pending)).every(item => item.verdict === 'correct'));
  assert.equal((await evaluator.evaluate(exercise, 3, 'Четвёртый текст')).verdict, 'correct');
});

test('API: все вердикты независимы от шага, короткий ответ принят и разбор доступен при сбое', async t => {
  let nextResponse: unknown = envelope(modelValue('correct'));
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => Response.json(nextResponse) });
  const server = createApp(evaluator);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  assert.equal((await (await fetch(base + '/api/health')).json()).mode, 'model');
  const review = async (step: number) => {
    const response = await fetch(base + '/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exerciseId: exercise.id, selectedStep: step, explanation: 'Базы' }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const correctExplanationWrongStep = await review(2);
  assert.equal(correctExplanationWrongStep.selectedStepCorrect, false);
  assert.equal(correctExplanationWrongStep.verdict, 'correct');
  for (const verdict of ['partial', 'incorrect', 'unclear'] as const) {
    nextResponse = envelope(modelValue(verdict));
    const result = await review(3);
    assert.equal(result.selectedStepCorrect, true);
    assert.equal(result.verdict, verdict);
    assert.equal(result.followUpQuestion, modelValue(verdict).followUpQuestion);
    assert.equal(result.feedback, modelValue(verdict).feedback);
  }
  nextResponse = { status: 'incomplete', output: [] };
  const unavailable = await review(3);
  assert.equal(unavailable.verdict, null);
  assert.equal(unavailable.firstWrongStep, undefined);
  assert.equal(unavailable.correctSteps, undefined);
  const solution = await (await fetch(base + '/api/solutions/' + exercise.id)).json();
  assert.equal(solution.firstWrongStep, 3);
  assert.equal(solution.correctAnswer, 1920);
  assert.deepEqual(solution.correctSteps, exercise.correctSteps);
  assert.equal(solution.practice.answer, undefined);
});

test('парсер допускает дополнительные поля оболочки API', async () => {
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: fakeFetch({ ...envelope(modelValue('correct')), id: 'resp_test', usage: { output_tokens: 120 } }) });
  assert.equal((await evaluator.evaluate(exercise, 3, 'Текст')).verdict, 'correct');
});
