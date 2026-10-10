import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { getExercise } from './exercise-bank.ts';
import { explanationCases } from './explanation-cases.ts';
import { buildEvaluationRequest, createExplanationEvaluator, parseModelResponse, validateEvaluation } from './explanation-evaluator.ts';

const exercise = getExercise('discount-then-markup-01')!;
function modelValue(met: boolean[], hasContradiction = false) {
  return { criteria: met.map((value, index) => ({ number: index + 1, met: value, evidence: 'Короткое обоснование оценки.' })), hasContradiction, feedback: 'Сравни базы процентов.' };
}
function envelope(value: unknown) {
  return { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] };
}
function fakeFetch(value: unknown): typeof fetch { return async () => Response.json(value); }

test('оценка определяется полнотой рубрики и противоречиями, а не номером шага', () => {
  assert.equal(validateEvaluation(modelValue([true, true]), exercise).explanationAssessment, 'correct');
  assert.equal(validateEvaluation(modelValue([true, false]), exercise).explanationAssessment, 'partial');
  assert.equal(validateEvaluation(modelValue([false, false]), exercise).explanationAssessment, 'incorrect');
  assert.equal(validateEvaluation(modelValue([true, true], true), exercise).explanationAssessment, 'incorrect');
  assert.equal(validateEvaluation(modelValue([true, false], true), exercise).explanationAssessment, 'incorrect');
  assert.deepEqual(validateEvaluation(modelValue([true, true]), exercise).rubricResults.map(item => item.criterion), exercise.rubric);
});

test('неполная, переставленная и повреждённая рубрика не создают ложную оценку', () => {
  const invalid = [
    modelValue([true]), modelValue([true, true, true]),
    { ...modelValue([true, true]), criteria: [{ number: 2, met: true, evidence: 'Текст' }, { number: 1, met: true, evidence: 'Текст' }] },
    { ...modelValue([true, true]), criteria: [{ number: 1, met: true, evidence: 'Текст' }, { number: 1, met: true, evidence: 'Текст' }] },
    { ...modelValue([true, true]), feedback: '' }, { ...modelValue([true, true]), feedback: 'x'.repeat(701) },
    { ...modelValue([true, true]), hasContradiction: 'false' },
    { ...modelValue([true, true]), selectedStepCorrect: true, correctAnswer: 2000 },
    { ...modelValue([true, true]), criteria: [{ number: 1, met: 'true', evidence: 'Текст' }, { number: 2, met: true, evidence: 'Текст' }] },
  ];
  for (const value of invalid) {
    const result = parseModelResponse(envelope(value), exercise);
    assert.equal(result.explanationAssessment, 'not_evaluated');
    assert.equal(result.explanationIssue, 'invalid_response');
    assert.deepEqual(result.rubricResults, []);
  }
});

test('Responses API: читаем текст сообщения, обрабатываем отказ и незавершённый ответ', () => {
  assert.equal(parseModelResponse(envelope(modelValue([true, true])), exercise).explanationAssessment, 'correct');
  const invalid = [null, {}, { status: 'incomplete', output: [] }, { status: 'failed', output: [] },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }, { type: 'output_text', text: '{}' }] }] },
  ];
  for (const value of invalid) assert.equal(parseModelResponse(value, exercise).explanationIssue, 'invalid_response');
  assert.equal(parseModelResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, exercise).explanationIssue, 'refused');
});

test('20 контрольных объяснений покрывают пять ошибок и отделены от системных инструкций', () => {
  assert.equal(explanationCases.length, 20);
  assert.equal(new Set(explanationCases.map(item => item.id)).size, 20);
  for (const item of explanationCases) {
    const task = getExercise(item.exerciseId)!;
    assert.ok(task);
    assert.ok(item.explanation.length >= 10 && item.explanation.length <= 2000);
    assert.equal(item.expected, item.kind === 'injection' ? 'incorrect' : item.kind);
    const request = buildEvaluationRequest(task, item.explanation, 'gpt-4o-mini');
    assert.equal(request.input.length, 2);
    assert.equal(request.input[0].role, 'system');
    assert.equal(request.input[1].role, 'user');
    assert.deepEqual(JSON.parse(request.input[1].content), { explanation: item.explanation });
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    assert.equal(request.text.format.schema.additionalProperties, false);
    assert.ok(request.input[0].content.includes(task.errorExplanation));
  }
  for (const type of ['equal-cancel', 'wrong-base', 'sum-sequential', 'percentage-points', 'reverse-value']) {
    const cases = explanationCases.filter(item => getExercise(item.exerciseId)!.errorType === type);
    assert.deepEqual(new Set(cases.map(item => item.kind)), new Set(['correct', 'partial', 'incorrect', 'injection']));
  }
});

test('без ключа нет запроса и нет имитации смысловой проверки', async () => {
  let calls = 0;
  const evaluator = createExplanationEvaluator({ apiKey: '', fetcher: async () => { calls += 1; throw new Error(); } });
  assert.equal(evaluator.configured, false);
  assert.equal((await evaluator.evaluate(exercise, exercise.errorExplanation)).explanationIssue, 'not_configured');
  assert.equal(calls, 0);
});

test('запрос к провайдеру использует серверный ключ и выбранную модель', async () => {
  const evaluator = createExplanationEvaluator({ apiKey: 'test-secret', model: 'gpt-4o-mini', fetcher: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-secret');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.store, false);
    assert.equal(body.input.some((item: { content: string }) => item.content.includes('test-secret')), false);
    return Response.json(envelope(modelValue([true, false])));
  } });
  assert.equal((await evaluator.evaluate(exercise, 'Объяснение от ученика')).explanationAssessment, 'partial');
});

test('HTTP ошибки, сбой сети и тайм-аут сохраняют статус «не оценено», без секретов', async () => {
  for (const status of [400, 401, 429, 500]) {
    const evaluator = createExplanationEvaluator({ apiKey: 'secret-marker', fetcher: async () => new Response('secret-marker provider error', { status }) });
    const result = await evaluator.evaluate(exercise, 'Объяснение от ученика');
    assert.equal(result.explanationIssue, 'unavailable');
    assert.equal(JSON.stringify(result).includes('secret-marker'), false);
  }
  const disconnected = createExplanationEvaluator({ apiKey: 'secret-marker', fetcher: async () => { throw new Error('secret-marker'); } });
  assert.equal((await disconnected.evaluate(exercise, 'Достаточно длинный текст')).explanationIssue, 'unavailable');
  const timedOut = createExplanationEvaluator({ apiKey: 'test-key', timeoutMs: 5, fetcher: async (_url, init) => {
    await new Promise(resolve => setTimeout(resolve, 20));
    init?.signal?.throwIfAborted();
    return Response.json({});
  } });
  assert.equal((await timedOut.evaluate(exercise, 'Достаточно длинный текст')).explanationIssue, 'timeout');
  const badJson = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => new Response('not json') });
  assert.equal((await badJson.evaluate(exercise, 'Достаточно длинный текст')).explanationIssue, 'invalid_response');
});

test('лимит одновременных проверок освобождается после завершения', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => { await gate; return Response.json(envelope(modelValue([true, true]))); } });
  const pending = Array.from({ length: 3 }, () => evaluator.evaluate(exercise, 'Достаточно длинный текст'));
  assert.equal((await evaluator.evaluate(exercise, 'Достаточно длинный текст')).explanationIssue, 'busy');
  release();
  assert.ok((await Promise.all(pending)).every(item => item.explanationAssessment === 'correct'));
  assert.equal((await evaluator.evaluate(exercise, 'Достаточно длинный текст')).explanationAssessment, 'correct');
});

test('API: оценка объяснения независима от шага, эталон доступен при сбое модели', async t => {
  let nextResponse: unknown = envelope(modelValue([true, true]));
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: async () => Response.json(nextResponse) });
  const server = createApp(evaluator);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  assert.equal((await (await fetch(base + '/api/health')).json()).mode, 'model');
  const review = async (step: number) => (await (await fetch(base + '/api/review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseId: exercise.id, selectedStep: step, explanation: exercise.errorExplanation }),
  })).json());
  const correctExplanationWrongStep = await review(2);
  assert.equal(correctExplanationWrongStep.selectedStepCorrect, false);
  assert.equal(correctExplanationWrongStep.explanationAssessment, 'correct');
  nextResponse = envelope(modelValue([false, false], true));
  const wrongExplanationCorrectStep = await review(3);
  assert.equal(wrongExplanationCorrectStep.selectedStepCorrect, true);
  assert.equal(wrongExplanationCorrectStep.explanationAssessment, 'incorrect');
  nextResponse = { status: 'incomplete', output: [] };
  const unavailable = await review(3);
  assert.equal(unavailable.explanationAssessment, 'not_evaluated');
  assert.equal(unavailable.firstWrongStep, 3);
  assert.equal(unavailable.correctAnswer, 1920);
  assert.deepEqual(unavailable.correctSteps, exercise.correctSteps);
  assert.equal(unavailable.practice.answer, undefined);
});

test('парсер допускает полезные дополнительные поля оболочки API', async () => {
  const evaluator = createExplanationEvaluator({ apiKey: 'test-key', fetcher: fakeFetch({ ...envelope(modelValue([true, true])), id: 'resp_test', usage: { output_tokens: 120 } }) });
  assert.equal((await evaluator.evaluate(exercise, 'Достаточно длинный текст')).explanationAssessment, 'correct');
});
