import type { Attempt } from '../shared/types.ts';

const key = 'mistakingai.attempts.v1';

function isAttempt(value: unknown): value is Attempt {
  if (typeof value !== 'object' || value === null) return false;
  const attempt = value as Record<string, unknown>;
  return typeof attempt.id === 'string' && typeof attempt.exerciseId === 'string'
    && typeof attempt.createdAt === 'string' && Number.isFinite(Date.parse(attempt.createdAt))
    && Number.isInteger(attempt.selectedStep) && typeof attempt.explanation === 'string'
    && typeof attempt.selectedStepCorrect === 'boolean' && typeof attempt.practiceAnswer === 'string'
    && typeof attempt.practiceCorrect === 'boolean' && attempt.explanationAssessment === 'not_evaluated';
}

export function loadAttempts(): { attempts: Attempt[]; error: string | null } {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value) || !value.every(isAttempt)) throw new Error();
    return { attempts: value.slice(-100), error: null };
  } catch {
    return { attempts: [], error: 'Не удалось прочитать локальный прогресс. Новая попытка заменит повреждённые данные, если хранилище доступно.' };
  }
}

export function saveAttempts(attempts: Attempt[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(attempts.slice(-100)));
    return true;
  } catch {
    return false;
  }
}
