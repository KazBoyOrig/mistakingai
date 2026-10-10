export interface Exercise {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  prompt: string;
  steps: { number: number; title: string; text: string }[];
  hints: [string, string];
}

export type ExplanationVerdict = 'correct' | 'partial' | 'incorrect' | 'unclear';
export type ExplanationAssessment = ExplanationVerdict | 'not_evaluated';
export type ExplanationIssue = 'not_configured' | 'timeout' | 'unavailable' | 'invalid_response' | 'refused' | 'busy';
export interface RubricResult { criterion: string; met: boolean; evidence: string }

export interface ExplanationEvaluation {
  verdict: ExplanationVerdict | null;
  feedback: string;
  followUpQuestion: string | null;
  explanationIssue: ExplanationIssue | null;
}

export interface Health {
  status: 'ok';
  mode: 'model' | 'reference_only';
  exerciseCount: number;
}

export interface Review extends ExplanationEvaluation {
  selectedStepCorrect: boolean;
  stepFeedback: string;
}

export interface Solution {
  firstWrongStep: number;
  referenceExplanation: string;
  correctSteps: string[];
  correctAnswer: number;
  answerUnit: string;
  practice: { prompt: string; unit: string };
}

export interface PracticeResult {
  correct: boolean;
  expectedAnswer: number;
  explanation: string;
}

export interface Attempt {
  id: string;
  exerciseId: string;
  createdAt: string;
  selectedStep: number;
  explanation: string;
  selectedStepCorrect: boolean;
  explanationAssessment: ExplanationAssessment;
  explanationFeedback?: string;
  followUpQuestion?: string | null;
  rubricResults?: RubricResult[];
  explanationIssue?: ExplanationIssue | null;
  practiceAnswer: string;
  practiceCorrect: boolean | null;
}

export interface GameSession {
  exerciseId: string;
  hintCount: number;
  selectedStep: number | null;
  explanation: string;
  review: Review | null;
  solution: Solution | null;
  answer: string;
  practiceResult: PracticeResult | null;
  activeAttemptId: string | null;
}
