import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Exercise } from '../shared/types.ts';

export const errorTypes = ['wrong-base', 'sum-sequential', 'equal-cancel', 'percentage-points', 'reverse-value'] as const;
const text = z.string().trim().min(3);
const unit = z.enum(['₽', '%', 'п.п.']);
const rate = z.number().finite().min(-99).max(500);
const calculationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('sequential'), initial: z.number().positive(), changes: z.array(rate).min(1).max(3) }),
  z.strictObject({ kind: z.literal('relative-change'), before: z.number().positive(), after: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal('percentage-points'), before: z.number().min(0).max(100), after: z.number().min(0).max(100) }),
  z.strictObject({ kind: z.literal('reverse-change'), final: z.number().positive(), change: rate }),
  z.strictObject({ kind: z.literal('reverse-part'), part: z.number().positive(), percent: z.number().positive().max(100) }),
]);

const exerciseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: text,
  errorType: z.enum(errorTypes), topic: text, difficulty: text, prompt: text,
  steps: z.array(z.strictObject({ number: z.number().int().min(1), title: text, text })).min(3).max(5),
  firstWrongStep: z.number().int().min(1),
  correctSteps: z.array(text).min(3).max(5), correctAnswer: z.number().finite().nonnegative(),
  answerUnit: unit, errorExplanation: text, hints: z.tuple([text, text]), rubric: z.array(text).min(1),
  calculation: calculationSchema,
  practice: z.strictObject({ prompt: text, unit, answer: z.number().finite().nonnegative(), explanation: text, calculation: calculationSchema }),
}).superRefine((exercise, context) => {
  if (exercise.firstWrongStep > exercise.steps.length) {
    context.addIssue({ code: 'custom', path: ['firstWrongStep'], message: 'Первый неверный шаг должен существовать.' });
  }
  exercise.steps.forEach((step, index) => {
    if (step.number !== index + 1) context.addIssue({ code: 'custom', path: ['steps', index, 'number'], message: 'Шаги должны идти подряд начиная с 1.' });
  });
  if (exercise.hints[0] === exercise.hints[1]) context.addIssue({ code: 'custom', path: ['hints'], message: 'Подсказки должны различаться.' });
});

export type Calculation = z.infer<typeof calculationSchema>;
export type ExerciseRecord = z.infer<typeof exerciseSchema>;

// Числовые данные проверяются независимо от русских формулировок и эталонных шагов.
export function calculate(calculation: Calculation): number {
  switch (calculation.kind) {
    case 'sequential': return calculation.changes.reduce((value, percent) => value * (100 + percent) / 100, calculation.initial);
    case 'relative-change': return (calculation.after - calculation.before) * 100 / calculation.before;
    case 'percentage-points': return Math.abs(calculation.after - calculation.before);
    case 'reverse-change': return calculation.final * 100 / (100 + calculation.change);
    case 'reverse-part': return calculation.part * 100 / calculation.percent;
  }
}

function expectedUnit(calculation: Calculation) {
  if (calculation.kind === 'relative-change') return '%';
  if (calculation.kind === 'percentage-points') return 'п.п.';
  return '₽';
}

export function validateBank(input: unknown): ExerciseRecord[] {
  const bank = z.array(exerciseSchema).length(15).parse(input);
  const ids = new Set<string>();
  for (const exercise of bank) {
    if (ids.has(exercise.id)) throw new Error(`Повторяющийся id: ${exercise.id}`);
    ids.add(exercise.id);
    for (const [label, calculation, answer, answerUnit] of [
      ['основная задача', exercise.calculation, exercise.correctAnswer, exercise.answerUnit],
      ['закрепление', exercise.practice.calculation, exercise.practice.answer, exercise.practice.unit],
    ] as const) {
      const calculated = calculate(calculation);
      if (!Number.isFinite(calculated) || Math.abs(calculated - answer) > 1e-8) {
        throw new Error(`${exercise.id}, ${label}: расчёт ${calculated} не совпадает с ответом ${answer}`);
      }
      if (expectedUnit(calculation) !== answerUnit) throw new Error(`${exercise.id}, ${label}: неверная единица измерения`);
    }
  }
  for (const errorType of errorTypes) {
    if (bank.filter(exercise => exercise.errorType === errorType).length !== 3) throw new Error(`Тип ${errorType}: нужны ровно три задачи.`);
  }
  return bank;
}

// При повреждённой структуре или неверной арифметике банк не запустится.
export const exerciseBank = validateBank(JSON.parse(readFileSync(new URL('./exercises.json', import.meta.url), 'utf8')));

export function getExercise(id: unknown): ExerciseRecord | undefined {
  return exerciseBank.find(exercise => exercise.id === id);
}

export function publicExercise(exercise: ExerciseRecord): Exercise {
  const { id, title, topic, difficulty, prompt, steps, hints } = exercise;
  return { id, title, topic, difficulty, prompt, steps, hints };
}
