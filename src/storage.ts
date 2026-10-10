import type { Attempt } from '../shared/types.ts';

const key = 'mistakingai.attempts.v1';
const assessments = ['correct', 'partial', 'incorrect', 'unclear', 'not_evaluated'];
const issues = ['not_configured', 'timeout', 'unavailable', 'invalid_response', 'refused', 'busy'];

function validEvaluation(attempt: Record<string, unknown>): boolean {
  if (!assessments.includes(attempt.explanationAssessment as string)) return false;
  if (attempt.followUpQuestion !== undefined) {
    const question = attempt.followUpQuestion;
    const needsQuestion = attempt.explanationAssessment === 'partial' || attempt.explanationAssessment === 'unclear';
    return typeof attempt.explanationFeedback === 'string' && attempt.explanationFeedback.trim().length > 0
      && (attempt.explanationAssessment === 'not_evaluated' ? issues.includes(attempt.explanationIssue as string) : attempt.explanationIssue === null)
      // Прежняя оценка partial могла быть сохранена до появления уточняющих вопросов.
      && (needsQuestion ? question === null || typeof question === 'string' && question.trim().length > 0 : question === null);
  }
  // Старые попытки без метаданных сохраняют честный статус «не оценено».
  if (attempt.explanationFeedback === undefined && attempt.rubricResults === undefined && attempt.explanationIssue === undefined) {
    return attempt.explanationAssessment === 'not_evaluated';
  }
  if (typeof attempt.explanationFeedback !== 'string' || !Array.isArray(attempt.rubricResults)) return false;
  const notEvaluated = attempt.explanationAssessment === 'not_evaluated';
  if (notEvaluated ? !issues.includes(attempt.explanationIssue as string) || attempt.rubricResults.length !== 0
    : attempt.explanationIssue !== null || attempt.rubricResults.length === 0) return false;
  return attempt.rubricResults.every((result: unknown) => {
    if (typeof result !== 'object' || result === null) return false;
    const criterion = result as Record<string, unknown>;
    return typeof criterion.criterion === 'string' && typeof criterion.met === 'boolean' && typeof criterion.evidence === 'string';
  });
}

function isAttempt(value: unknown): value is Attempt {
  if (typeof value !== 'object' || value === null) return false;
  const attempt = value as Record<string, unknown>;
  return typeof attempt.id === 'string' && typeof attempt.exerciseId === 'string'
    && typeof attempt.createdAt === 'string' && Number.isFinite(Date.parse(attempt.createdAt))
    && Number.isInteger(attempt.selectedStep) && typeof attempt.explanation === 'string'
    && typeof attempt.selectedStepCorrect === 'boolean' && typeof attempt.practiceAnswer === 'string'
    && (typeof attempt.practiceCorrect === 'boolean' || (attempt.practiceCorrect === null && attempt.practiceAnswer === ''))
    && validEvaluation(attempt);
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

// Проверка шага создаёт запись; закрепление обновляет её, а повтор выбора — новую.
export function upsertAttempt(attempts: Attempt[], attempt: Attempt): Attempt[] {
  const index = attempts.findIndex(item => item.id === attempt.id);
  const next = [...attempts];
  if (index === -1) next.push(attempt);
  else next[index] = attempt;
  return next.slice(-100);
}
