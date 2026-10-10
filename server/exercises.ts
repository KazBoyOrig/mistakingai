import type { Review, Solution } from '../shared/types.ts';
import type { ExerciseRecord } from './exercise-bank.ts';
import { unevaluated } from './explanation-evaluator.ts';

export function reviewAttempt(exercise: ExerciseRecord, selectedStep: number): Review {
  const selectedStepCorrect = selectedStep === exercise.firstWrongStep;
  return {
    selectedStepCorrect,
    ...unevaluated('not_configured'),
    feedback: selectedStepCorrect
      ? 'Ты нашёл первый неверный шаг! Открой разбор, когда будешь готов.'
      : selectedStep < exercise.firstWrongStep
        ? 'Выбранный шаг верен. Попробуй снова или открой подсказку.'
        : 'Этот шаг продолжает ошибочное рассуждение, но первая ошибка появилась раньше. Попробуй снова или открой подсказку.',
  };
}

export function exerciseSolution(exercise: ExerciseRecord): Solution {
  return {
    firstWrongStep: exercise.firstWrongStep,
    referenceExplanation: exercise.errorExplanation,
    correctSteps: exercise.correctSteps,
    correctAnswer: exercise.correctAnswer,
    answerUnit: exercise.answerUnit,
    practice: { prompt: exercise.practice.prompt, unit: exercise.practice.unit },
  };
}

const units: Record<string, string> = {
  '₽': '₽', 'руб': '₽', 'руб.': '₽', 'рубль': '₽', 'рубля': '₽', 'рублей': '₽', 'р.': '₽', 'р': '₽',
  '%': '%', 'процент': '%', 'процента': '%', 'процентов': '%',
  'п.п.': 'п.п.', 'п. п.': 'п.п.', 'пп': 'п.п.', 'п.п': 'п.п.', 'п. п': 'п.п.', 'п п': 'п.п.',
  'процентный пункт': 'п.п.', 'процентных пункта': 'п.п.', 'процентных пунктов': 'п.п.',
  'процентного пункта': 'п.п.', 'процентные пункты': 'п.п.',
};

function parseAnswer(input: string): { value: number; unit: string | null } | null {
  const match = input.trim().toLocaleLowerCase('ru-RU').match(/^(\d[\d\s]*(?:[.,]\s*\d+)?)\s*([^\d\s].*)?$/u);
  if (!match) return null;
  const normalized = match[1].replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const suffix = match[2]?.trim().replace(/\s+/g, ' ');
  if (suffix && !Object.hasOwn(units, suffix)) return null;
  const unit = suffix ? units[suffix] : null;
  if (suffix && !unit) return null;
  return { value, unit };
}

export function parseNumericAnswer(input: string): number | null {
  return parseAnswer(input)?.value ?? null;
}

export function checkNumericAnswer(input: string, expected: number, expectedUnit: string): boolean | null {
  const parsed = parseAnswer(input);
  if (!parsed || (parsed.unit && parsed.unit !== expectedUnit)) return null;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(parsed.value)) * 4;
  return Math.abs(parsed.value - expected) <= tolerance;
}
