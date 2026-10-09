export interface Exercise {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  prompt: string;
  steps: { number: number; title: string; text: string }[];
  hints: [string, string];
}

export interface Review {
  selectedStepCorrect: boolean;
  firstWrongStep: number;
  explanationAssessment: 'not_evaluated';
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
  explanationAssessment: 'not_evaluated';
  practiceAnswer: string;
  practiceCorrect: boolean;
}
