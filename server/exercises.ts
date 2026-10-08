import type { Exercise, Review } from '../shared/types.ts';

// Эталон хранится на сервере: клиент получает ответы только после отправки.
export const demoExercise: Exercise = {
  id: 'discount-then-markup-01',
  title: 'Скидка, а потом наценка',
  topic: 'Проценты · скидки и наценки',
  difficulty: 'Базовый уровень',
  prompt: 'Рюкзак стоил 2 000 ₽. Магазин снизил цену на 20%, а затем повысил новую цену на 20%. Сколько стоит рюкзак теперь?',
  steps: [
    { number: 1, title: 'Записываю начальную цену', text: 'До всех изменений рюкзак стоит 2 000 ₽.' },
    { number: 2, title: 'Считаю цену после скидки', text: '2 000 × 0,8 = 1 600 ₽.' },
    { number: 3, title: 'Сравниваю проценты', text: 'Скидка 20% и наценка 20% взаимно компенсируются, ведь проценты одинаковые.' },
    { number: 4, title: 'Получаю итоговую цену', text: 'Цена вернулась к начальной: рюкзак стоит 2 000 ₽.' },
  ],
};

export const demoReference = {
  firstWrongStep: 3,
  explanation: 'Первый неверный шаг — 3. У процентов разные базы: скидка считается от 2 000 ₽, а наценка — уже от 1 600 ₽. Поэтому одинаковые проценты не компенсируют друг друга.',
  // Основа будущей проверки объяснения языковой моделью.
  rubric: [
    'Пользователь объяснил, что база для наценки изменилась после скидки.',
    'Наценка 20% считается от 1 600 ₽, а не от 2 000 ₽.',
    'Не требуется дословное совпадение с эталоном или обязательное указание итогового числа.',
  ],
  correctSteps: [
    'Скидка: 2 000 × 20 / 100 = 400 ₽.',
    'После скидки: 2 000 − 400 = 1 600 ₽.',
    'Наценка на новую цену: 1 600 × 20 / 100 = 320 ₽.',
    'Итог: 1 600 + 320 = 1 920 ₽. Это на 80 ₽ меньше начальной цены.',
  ],
  practice: {
    prompt: 'Футболка стоила 1 000 ₽. Сначала цену снизили на 10%, затем новую цену повысили на 10%. Какова итоговая цена?',
    unit: '₽',
    answer: 990,
    explanation: 'После скидки: 1 000 × 0,9 = 900 ₽. После наценки: 900 × 1,1 = 990 ₽.',
  },
};

export function reviewAttempt(selectedStep: number): Review {
  const selectedStepCorrect = selectedStep === demoReference.firstWrongStep;
  return {
    selectedStepCorrect,
    firstWrongStep: demoReference.firstWrongStep,
    explanationAssessment: 'not_evaluated',
    feedback: selectedStepCorrect
      ? 'Ты нашёл первый неверный шаг! Теперь сравни своё объяснение с разбором.'
      : selectedStep < demoReference.firstWrongStep
        ? 'Выбранный шаг верен. Первая ошибка появляется на шаге 3.'
        : 'В выбранном шаге тоже есть ошибка, но первая появляется раньше — на шаге 3.',
    referenceExplanation: demoReference.explanation,
    correctSteps: demoReference.correctSteps,
    practice: { prompt: demoReference.practice.prompt, unit: demoReference.practice.unit },
  };
}

// Допускаем десятичную запятую, пробелы между разрядами и знак рубля.
// Формулы, проценты и частично числовые строки не являются числовым ответом.
export function parseNumericAnswer(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(/₽$/, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
