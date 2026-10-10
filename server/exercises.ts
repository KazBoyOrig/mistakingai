import type { Review } from '../shared/types.ts';
import type { ExerciseRecord } from './exercise-bank.ts';
import { unevaluated } from './explanation-evaluator.ts';

export function reviewAttempt(exercise: ExerciseRecord, selectedStep: number): Review {
  const selectedStepCorrect = selectedStep === exercise.firstWrongStep;
  return {
    selectedStepCorrect,
    firstWrongStep: exercise.firstWrongStep,
    ...unevaluated('not_configured'),
    feedback: selectedStepCorrect
      ? 'Ты нашёл первый неверный шаг! Теперь сравни своё объяснение с разбором.'
      : selectedStep < exercise.firstWrongStep
        ? `Выбранный шаг верен. Первая ошибка появляется на шаге ${exercise.firstWrongStep}.`
        : `В выбранном шаге тоже есть ошибка, но первая появляется раньше — на шаге ${exercise.firstWrongStep}.`,
    referenceExplanation: exercise.errorExplanation,
    correctSteps: exercise.correctSteps,
    correctAnswer: exercise.correctAnswer,
    answerUnit: exercise.answerUnit,
    practice: { prompt: exercise.practice.prompt, unit: exercise.practice.unit },
  };
}

export function parseNumericAnswer(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(/(?:₽|%|п\.п\.)$/, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function checkNumericAnswer(input: string, expected: number, expectedUnit: string): boolean | null {
  const suffix = input.trim().match(/(₽|%|п\.п\.)$/)?.[1];
  if (suffix && suffix !== expectedUnit) return null;
  const value = parseNumericAnswer(input);
  return value === null ? null : value === expected;
}
