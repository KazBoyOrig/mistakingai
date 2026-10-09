import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { exerciseBank, validateBank, calculate, getExercise } from './exercise-bank.ts';
import type { ExerciseRecord } from './exercise-bank.ts';
import { checkNumericAnswer, parseNumericAnswer, reviewAttempt } from './exercises.ts';

// Независимые контрольные ответы: значения не выводятся из текста или из correctAnswer банка.
const golden: [string, number, number, number][] = [
  ['discount-then-markup-01', 1920, 990, 3],
  ['equal-change-02', 1125, 300, 3],
  ['equal-change-03', 9900, 4800, 3],
  ['wrong-base-01', 17100, 5400, 3],
  ['wrong-base-02', 1100, 1080, 3],
  ['wrong-base-03', 30, 25, 2],
  ['sum-changes-01', 3600, 7200, 2],
  ['sum-changes-02', 52800, 26400, 2],
  ['sum-changes-03', 3120, 2700, 2],
  ['percentage-points-01', 5, 12, 2],
  ['percentage-points-02', 50, 100, 2],
  ['percentage-points-03', 3, 6, 2],
  ['reverse-price-01', 3000, 2400, 2],
  ['reverse-price-02', 1200, 1500, 2],
  ['reverse-value-03', 30000, 20000, 2],
];

for (const [id, answer, practiceAnswer, firstWrongStep] of golden) {
  test('математика и эталон: ' + id, () => {
    const exercise = getExercise(id)!;
    assert.ok(exercise);
    assert.equal(calculate(exercise.calculation), answer);
    assert.equal(calculate(exercise.practice.calculation), practiceAnswer);
    assert.equal(exercise.correctAnswer, answer);
    assert.equal(exercise.practice.answer, practiceAnswer);
    assert.equal(exercise.firstWrongStep, firstWrongStep);
    assert.equal(reviewAttempt(exercise, firstWrongStep).selectedStepCorrect, true);
    assert.equal(reviewAttempt(exercise, firstWrongStep - 1).selectedStepCorrect, false);
    assert.match(reviewAttempt(exercise, firstWrongStep + 1).feedback, /раньше/);
  });
}

test('валидатор отклоняет повреждённую структуру и неверную математику', () => {
  assert.equal(exerciseBank.length, 15);
  assert.deepEqual(new Set(exerciseBank.map(exercise => exercise.id)), new Set(golden.map(item => item[0])));
  const corruptions: ((bank: ExerciseRecord[]) => void)[] = [
    bank => { bank.pop(); },
    bank => { bank[0].id = bank[1].id; },
    bank => { bank[0].firstWrongStep = 0; },
    bank => { bank[0].firstWrongStep = 5; },
    bank => { bank[0].steps[0].number = 0; },
    bank => { bank[0].steps[1].number = 1; },
    bank => { bank[0].hints.pop(); },
    bank => { bank[0].hints[1] = bank[0].hints[0]; },
    bank => { Reflect.deleteProperty(bank[0].practice, 'unit'); },
    bank => { bank[0].correctAnswer += 1; },
    bank => { bank[0].practice.answer += 1; },
    bank => { bank[0].correctAnswer = Infinity; },
    bank => { bank[0].practice.unit = '%'; },
    bank => { bank[0].errorType = 'wrong-base'; },
    bank => { bank[0].title = ''; },
  ];
  for (const corrupt of corruptions) {
    const copy = structuredClone(exerciseBank);
    corrupt(copy);
    assert.throws(() => validateBank(copy));
  }
});

test('числовая проверка учитывает единицы и запрещает формулы', () => {
  for (const value of ['990', '990,00', '990.0', ' 990 ₽ ', '9\u00a090 ₽']) {
    assert.equal(parseNumericAnswer(value), 990);
    assert.equal(checkNumericAnswer(value, 990, '₽'), true);
  }
  assert.equal(checkNumericAnswer('12 п.п.', 12, 'п.п.'), true);
  assert.equal(checkNumericAnswer('25%', 25, '%'), true);
  assert.equal(checkNumericAnswer('12%', 12, 'п.п.'), null);
  assert.equal(checkNumericAnswer('990%', 990, '₽'), null);
  assert.equal(checkNumericAnswer('990,01', 990, '₽'), false);
  for (const value of ['', ' ', '990рублей', '900*1.1', '990abc', 'Infinity', '-990', '0x3de', '990,0,0']) {
    assert.equal(parseNumericAnswer(value), null);
  }
});

test('API: все 15 задач, ответы и подсказки без утечки эталонов', async t => {
  const server = createApp();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const post = (path: string, body: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).exerciseCount, 15);
  const list = await fetch(base + '/api/exercises');
  const tasks = await list.json();
  assert.equal(tasks.length, 15);
  for (const task of tasks) {
    assert.equal(task.hints.length, 2);
    for (const hidden of ['firstWrongStep', 'correctSteps', 'correctAnswer', 'errorExplanation', 'practice', 'rubric', 'calculation']) {
      assert.equal(task[hidden], undefined);
    }
  }

  for (const [id, answer, practiceAnswer, firstWrongStep] of golden) {
    const task = getExercise(id)!;
    const individual = await fetch(base + '/api/exercises/' + id);
    assert.equal(individual.status, 200);
    assert.equal((await individual.json()).id, id);
    const reviewed = await post('/api/review', {
      exerciseId: id, selectedStep: firstWrongStep, explanation: 'Объяснение своими словами для проверки маршрута.',
    });
    assert.equal(reviewed.status, 200);
    const review = await reviewed.json();
    assert.equal(review.selectedStepCorrect, true);
    assert.equal(review.correctAnswer, answer);
    assert.equal(review.answerUnit, task.answerUnit);
    assert.equal(review.explanationAssessment, 'not_evaluated');
    assert.equal(review.practice.answer, undefined);
    const valid = await post('/api/practice', { exerciseId: id, answer: practiceAnswer + ' ' + task.practice.unit });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).correct, true);
    const invalid = await post('/api/practice', { exerciseId: id, answer: String(practiceAnswer + 1) });
    assert.equal((await invalid.json()).correct, false);
  }

  const demoId = golden[0][0];
  assert.equal((await fetch(base + '/api/exercises/demo')).status, 200);
  assert.equal((await fetch(base + '/api/exercises/missing')).status, 404);
  for (const selectedStep of [0, 5, 2.5, '3', null]) {
    assert.equal((await post('/api/review', { exerciseId: demoId, selectedStep, explanation: 'Достаточно длинное объяснение' })).status, 400);
  }
  for (const explanation of ['', '         ', 'x'.repeat(2001), 123]) {
    assert.equal((await post('/api/review', { exerciseId: demoId, selectedStep: 3, explanation })).status, 400);
  }
  assert.equal((await post('/api/practice', { exerciseId: demoId, answer: '990%' })).status, 400);
  assert.equal((await post('/api/practice', { exerciseId: 'missing', answer: '990' })).status, 404);
  assert.equal((await post('/api/review', null)).status, 400);
  assert.equal((await fetch(base + '/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await fetch(base + '/api/review', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/api/missing')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 403);
});
