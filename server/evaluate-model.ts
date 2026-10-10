import { explanationCases } from './explanation-cases.ts';
import { createExplanationEvaluator } from './explanation-evaluator.ts';
import { getExercise } from './exercise-bank.ts';

try { process.loadEnvFile('.env'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

const evaluator = createExplanationEvaluator();
if (!evaluator.configured) {
  console.error('Добавьте OPENAI_API_KEY в локальный .env. Этот прогон вызывает настоящую модель и расходует API-кредиты.');
  process.exit(2);
}
const caseId = process.argv[2];
const cases = caseId ? explanationCases.filter(item => item.id === caseId) : explanationCases;
if (!cases.length) { console.error('Неизвестный id контрольного примера.'); process.exit(2); }
let passed = 0;
for (const item of cases) {
  const result = await evaluator.evaluate(getExercise(item.exerciseId)!, item.explanation);
  const matches = result.explanationAssessment === item.expected;
  if (matches) passed += 1;
  console.log(`${matches ? '✓' : '✗'} ${item.id}: ожидалось ${item.expected}, получено ${result.explanationAssessment}${result.explanationIssue ? ` (${result.explanationIssue})` : ''}`);
}
console.log(`Совпало с контрольными оценками: ${passed}/${cases.length}.`);
if (passed !== cases.length) process.exitCode = 1;
