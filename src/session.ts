import { z } from 'zod';
import type { GameSession } from '../shared/types.ts';

export const sessionKey = 'mistakingai.session.v1';
const key = sessionKey;
const text = z.string().min(1);
const stepNumber = z.number().int().min(1).max(5);
const legacyReviewSchema = z.strictObject({
  selectedStepCorrect: z.boolean(), feedback: text,
  explanationAssessment: z.enum(['correct', 'partial', 'incorrect', 'not_evaluated']),
  explanationFeedback: text,
  rubricResults: z.array(z.strictObject({ criterion: text, met: z.boolean(), evidence: text })).max(10),
  explanationIssue: z.enum(['not_configured', 'timeout', 'unavailable', 'invalid_response', 'refused', 'busy']).nullable(),
}).refine(review => review.explanationAssessment === 'not_evaluated'
  ? review.explanationIssue !== null && review.rubricResults.length === 0
  : review.explanationIssue === null && review.rubricResults.length > 0);
const reviewSchema = z.union([
  z.strictObject({
    selectedStepCorrect: z.boolean(), stepFeedback: text,
    verdict: z.enum(['correct', 'partial', 'incorrect', 'unclear']).nullable(),
    feedback: text, followUpQuestion: text.nullable(),
    explanationIssue: z.enum(['not_configured', 'timeout', 'unavailable', 'invalid_response', 'refused', 'busy']).nullable(),
  }).refine(review => review.verdict === null ? review.explanationIssue !== null && review.followUpQuestion === null : review.explanationIssue === null),
  legacyReviewSchema.transform(review => ({
    selectedStepCorrect: review.selectedStepCorrect, stepFeedback: review.feedback,
    verdict: review.explanationAssessment === 'not_evaluated' ? null : review.explanationAssessment,
    feedback: review.explanationFeedback, followUpQuestion: null, explanationIssue: review.explanationIssue,
  })),
]);
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
  clarificationQuestion: z.string().trim().min(1).max(240).nullable().optional(),
}).superRefine((session, context) => {
  if (session.review && (session.selectedStep === null || !session.explanation.trim() || !session.activeAttemptId)
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
