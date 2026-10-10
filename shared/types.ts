export interface Exercise {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  prompt: string;
  steps: { number: number; title: string; text: string }[];
  hints: [string, string];
}

export type ExplanationAssessment = 'correct' | 'partial' | 'incorrect' | 'not_evaluated';
export type ExplanationIssue = 'not_configured' | 'timeout' | 'unavailable' | 'invalid_response' | 'refused' | 'busy';
export interface RubricResult { criterion: string; met: boolean; evidence: string }

export interface ExplanationEvaluation {
  explanationAssessment: ExplanationAssessment;
  explanationFeedback: string;
  rubricResults: RubricResult[];
  explanationIssue: ExplanationIssue | null;
}

export interface Health {
  status: 'ok';
  mode: 'model' | 'reference_only';
  exerciseCount: number;
}

export interface Review extends ExplanationEvaluation {
  selectedStepCorrect: boolean;
  firstWrongStep: number;
  feedback: string;
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
  rubricResults?: RubricResult[];
  explanationIssue?: ExplanationIssue | null;
  practiceAnswer: string;
  practiceCorrect: boolean;
}
