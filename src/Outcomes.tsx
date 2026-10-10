import type { Attempt } from '../shared/types.ts';

type OutcomesProps = Pick<Attempt, 'selectedStepCorrect' | 'explanationAssessment' | 'practiceCorrect'>;

export default function Outcomes({ selectedStepCorrect, explanationAssessment, practiceCorrect }: OutcomesProps) {
  const results = [
    { label: 'Нашёл ошибочный шаг', state: selectedStepCorrect ? 'success' : 'miss', value: selectedStepCorrect ? 'Верно' : 'Попробуй ещё раз' },
    { label: 'Объяснил причину', state: explanationAssessment === 'correct' ? 'success' : explanationAssessment === 'not_evaluated' ? 'pending' : 'miss', value: { correct: 'Верно', partial: 'Частично', incorrect: 'Пока неверно', unclear: 'Нужно уточнить', not_evaluated: 'Не оценено' }[explanationAssessment] },
    { label: 'Решил похожую задачу', state: practiceCorrect === true ? 'success' : practiceCorrect === null ? 'pending' : 'miss', value: practiceCorrect === true ? 'Верно' : practiceCorrect === null ? 'Ещё не решена' : 'Попробуй ещё раз' },
  ];
  return <dl className="attempt-outcomes">{results.map(result => <div className={`outcome outcome-${result.state}`} key={result.label}>
    <span className="outcome-icon" aria-hidden="true">{result.state === 'success' ? '✓' : result.state === 'pending' ? '·' : '↻'}</span>
    <dt>{result.label}</dt><dd>{result.value}</dd>
  </div>)}</dl>;
}
