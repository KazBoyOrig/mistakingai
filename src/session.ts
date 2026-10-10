import { z } from 'zod';
import type { GameSession } from '../shared/types.ts';

const key = 'mistakingai.session.v1';
const text = z.string().min(1);
const stepNumber = z.number().int().min(1).max(5);
const reviewSchema = z.strictObject({
  selectedStepCorrect: z.boolean(), feedback: text,
  explanationAssessment: z.enum(['correct', 'partial', 'incorrect', 'not_evaluated']),
  explanationFeedback: text,
  rubricResults: z.array(z.strictObject({ criterion: text, met: z.boolean(), evidence: text })).max(10),
  explanationIssue: z.enum(['not_configured', 'timeout', 'unavailable', 'invalid_response', 'refused', 'busy']).nullable(),
}).refine(review => review.explanationAssessment === 'not_evaluated'
  ? review.explanationIssue !== null && review.rubricResults.length === 0
  : review.explanationIssue === null && review.rubricResults.length > 0);
const solutionSchema = z.strictObject({
  firstWrongStep: stepNumber, referenceExplanation: text, correctSteps: z.array(text).min(3).max(5),
  correctAnswer: z.number().finite().nonnegative(), answerUnit: z.enum(['₽', '%', 'п.п.']),
  practice: z.strictObject({ prompt: text, unit: z.enum(['₽', '%', 'п.п.']) }),
});
const sessionSchema = z.strictObject({
  exerciseId: text, hintCount: z.number().int().min(0).max(2),
  selectedStep: stepNumber.nullable(), explanation: z.string().max(2000),
  review: reviewSchema.nullable(), solution: solutionSchema.nullable(), answer: z.string().max(100),
  practiceResult: z.strictObject({ correct: z.boolean(), expectedAnswer: z.number().finite().nonnegative(), explanation: text }).nullable(),
  activeAttemptId: text.nullable(),
}).superRefine((session, context) => {
  if (session.review && (session.selectedStep === null || session.explanation.trim().length < 10 || !session.activeAttemptId)
    || !session.review && (session.solution || session.practiceResult || session.activeAttemptId)
    || session.practiceResult && !session.solution) {
    context.addIssue({ code: 'custom', message: 'Несогласованные этапы попытки.' });
  }
});

export function loadSession(): { session: GameSession | null; error: string | null } {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { session: null, error: null };
    return { session: sessionSchema.parse(JSON.parse(raw)), error: null };
  } catch {
    return { session: null, error: 'Не удалось восстановить текущую задачу. Начни новую попытку; история результатов хранится отдельно.' };
  }
}

export function saveSession(session: GameSession): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(session));
    return true;
  } catch { return false; }
}
