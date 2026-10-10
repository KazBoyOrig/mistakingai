import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Attempt, Exercise, Health, PracticeResult, Review } from '../shared/types.ts';
import { request } from './api.ts';
import { loadAttempts, saveAttempts } from './storage.ts';

const stages = ['Найди ошибку', 'Объясни своими словами', 'Закрепи понимание'];
const assessmentLabels = { correct: 'Объяснение верное', partial: 'Объяснение частично верное', incorrect: 'Объяснение требует уточнения', not_evaluated: 'Объяснение не оценено' };

function attemptWord(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return 'попыток';
  if (count % 10 === 1) return 'попытка';
  if (count % 10 >= 2 && count % 10 <= 4) return 'попытки';
  return 'попыток';
}

export default function App() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseId, setExerciseId] = useState('discount-then-markup-01');
  const exercise = exercises.find(item => item.id === exerciseId) ?? null;
  const exerciseIndex = exercises.findIndex(item => item.id === exerciseId);
  const [hintCount, setHintCount] = useState(0);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [answer, setAnswer] = useState('');
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(loadAttempts);
  const [saved, setSaved] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [explanationMode, setExplanationMode] = useState<Health['mode'] | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const successfulAttempts = progress.attempts.filter(attempt => attempt.selectedStepCorrect && attempt.practiceCorrect).length;
  const understoodAttempts = progress.attempts.filter(attempt => attempt.selectedStepCorrect && attempt.practiceCorrect && attempt.explanationAssessment === 'correct').length;
  const attemptedIds = new Set(progress.attempts.map(attempt => attempt.exerciseId));

  useEffect(() => {
    let active = true;
    request<Exercise[]>('/api/exercises')
      .then(data => { if (active) setExercises(data); })
      .catch(() => { if (active) setError('Не удалось загрузить задачу. Проверь, что сервер запущен, и попробуй снова.'); });
    request<Health>('/api/health').then(data => { if (active) setExplanationMode(data.mode); }).catch(() => { if (active) setExplanationMode(null); });
    return () => { active = false; };
  }, [loadVersion]);

  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useEffect(() => { if (practiceResult) resultHeading.current?.focus(); }, [practiceResult]);

  async function submitExplanation(event?: FormEvent) {
    event?.preventDefault();
    if (!exercise || selectedStep === null || submitting.current || practiceResult) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      setReview(await request<Review>('/api/review', { exerciseId: exercise.id, selectedStep, explanation }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить объяснение. Попробуй ещё раз.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function submitPractice(event: FormEvent) {
    event.preventDefault();
    if (!exercise || !review || selectedStep === null || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await request<PracticeResult>('/api/practice', { exerciseId: exercise.id, answer });
      const attempt: Attempt = {
        id: crypto.randomUUID(), exerciseId: exercise.id, createdAt: new Date().toISOString(),
        selectedStep, explanation: explanation.trim(), selectedStepCorrect: review.selectedStepCorrect,
        explanationAssessment: review.explanationAssessment, explanationFeedback: review.explanationFeedback,
        rubricResults: review.rubricResults, explanationIssue: review.explanationIssue,
        practiceAnswer: answer.trim(), practiceCorrect: result.correct,
      };
      const attempts = [...progress.attempts, attempt].slice(-100);
      const stored = saveAttempts(attempts);
      setProgress({ attempts, error: stored ? null : 'Браузер не разрешил сохранить прогресс. Результат доступен только до закрытия страницы.' });
      setSaved(stored);
      setPracticeResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проверить ответ. Попробуй ещё раз.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function reset() {
    setSelectedStep(null);
    setExplanation('');
    setReview(null);
    setAnswer('');
    setPracticeResult(null);
    setError(null);
    setSaved(false);
    setHintCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseExercise(id: string) {
    if (busy || id === exerciseId) return;
    reset();
    setExerciseId(id);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#training">Перейти к задаче</a>
      <header className="site-header">
        <a className="brand" href="#" aria-label="Обучи ошибающегося ИИ — главная">
          <span className="brand-symbol" aria-hidden="true">!</span>
          <span>ошибка<span className="brand-dot">.</span></span>
        </a>
        <nav aria-label="Навигация">
          <a className="nav-active" href="#training">Тренировка</a>
          <a href="#how-it-works">Как это работает</a>
        </nav>
        <span className="demo-pill"><span aria-hidden="true" />Демоверсия</span>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Обучи ошибающегося ИИ</p>
            <h1 id="page-title">Лучший способ понять —<br /><span>объяснить ошибку.</span></h1>
            <p className="intro-copy">Сегодня ученик — искусственный интеллект. Найди, где он ошибся,<br className="desktop-break" /> и помоги ему разобраться с процентами.</p>
          </div>
          <div className="topic-card">
            <span className="topic-symbol" aria-hidden="true">%</span>
            <div><span className="small-label">Сегодня разбираем</span><strong>Скидки и наценки</strong><span className="topic-meta">15 задач · по 3 минуты</span></div>
          </div>
        </section>

        <div className="training-layout">
          <aside className="sidebar">
            <div className="exercise-picker">
              <label className="small-label" htmlFor="exercise-picker">Выбери задачу</label>
              <select id="exercise-picker" value={exerciseId} onChange={event => chooseExercise(event.target.value)} disabled={busy || !exercises.length}>
                {exercises.map((item, index) => <option key={item.id} value={item.id}>{attemptedIds.has(item.id) ? '✓ ' : ''}{String(index + 1).padStart(2, '0')}. {item.title}</option>)}
              </select>
              <p>С попыткой: {exercises.filter(item => attemptedIds.has(item.id)).length} / {exercises.length || 15}</p>
            </div>
            <div className="journey">
              <p className="small-label">Три шага к пониманию</p>
              <ol>
                {stages.map((stage, index) => {
                  const current = review ? 2 : selectedStep ? 1 : 0;
                  return <li key={stage} className={index === current && !practiceResult ? 'stage-current' : index < current || practiceResult ? 'stage-done' : ''}>
                    <span className="stage-number">{index < current || practiceResult ? '✓' : `0${index + 1}`}</span><span>{stage}</span>
                  </li>;
                })}
              </ol>
            </div>
            <div className="progress-card">
              <span className="small-label">Твой прогресс</span>
              <div className="progress-count">{progress.attempts.length}<span>{attemptWord(progress.attempts.length)}</span></div>
              <p>{successfulAttempts} с верным шагом и ответом</p>
              <p>{understoodAttempts} с верным объяснением, шагом и ответом</p>
              <span className="local-note">Сохраняется в этом браузере</span>
            </div>
            <div className="sidebar-note"><span aria-hidden="true">↳</span><p>Важен ход мысли.<br />Объясняй так, как объяснил бы другу.</p></div>
          </aside>

          <section className="exercise-area" id="training" aria-label="Тренировка">
            <div className="intent-banner"><span className="banner-symbol" aria-hidden="true">!</span><p><strong>ИИ специально ошибается. Найди первый неверный шаг</strong><span>Все шаги до него должны быть правильными.</span></p></div>
            {error && !review && <div className="error-message" role="alert">{error}{!exercise && <button type="button" className="text-button" onClick={() => { setError(null); setLoadVersion(version => version + 1); }}>Загрузить снова</button>}</div>}
            {progress.error && <p className="storage-warning" role="status">{progress.error}</p>}
            {!exercise && !error && <div className="exercise-card loading" role="status">Загружаем задачу…</div>}

            {exercise && <>
              <article className="exercise-card">
                <div className="card-meta"><span>Задача {String(exerciseIndex + 1).padStart(2, '0')} <span className="meta-divider">/</span> {exercises.length} · {exercise.topic}</span><span>{exercise.difficulty}</span></div>
                <h2>{exercise.title}</h2>
                <p className="problem-text">{exercise.prompt}</p>
                <form onSubmit={submitExplanation}>
                  <fieldset className="steps" disabled={!!review || busy}>
                    <legend><span className="student-dot" aria-hidden="true" />Решение ИИ<span className="legend-hint">Выбери первый неверный шаг</span></legend>
                    {exercise.steps.map(step => {
                      const selected = selectedStep === step.number;
                      const wrong = review?.firstWrongStep === step.number;
                      return <label key={step.number} className={`solution-step${selected ? ' step-selected' : ''}${wrong ? ' step-error' : ''}`}>
                        <input type="radio" name="first-wrong-step" value={step.number} checked={selected} onChange={() => { setSelectedStep(step.number); setError(null); }} required />
                        <span className="step-index" aria-hidden="true">{step.number.toString().padStart(2, '0')}</span>
                        <span className="step-content"><strong>{step.title}</strong><span>{step.text}</span></span>
                        {wrong && <span className="step-badge">Первая ошибка</span>}
                      </label>;
                    })}
                  </fieldset>
                  {!review && <div className="hints-panel">
                    <button type="button" className="hint-button" disabled={busy || hintCount === 2} onClick={() => setHintCount(count => Math.min(count + 1, 2))}>{hintCount === 0 ? 'Нужна подсказка?' : hintCount === 1 ? 'Показать вторую подсказку' : 'Обе подсказки открыты'}<span>{hintCount} / 2</span></button>
                    <div aria-live="polite">{exercise.hints.slice(0, hintCount).map((hint, index) => <p key={hint}><strong>Подсказка {index + 1}.</strong> {hint}</p>)}</div>
                  </div>}
                  <div className="explanation-field">
                    <label htmlFor="explanation">В чём ошибка?<span>Объясни своими словами</span></label>
                    <textarea id="explanation" rows={4} placeholder="Я думаю, ошибка в этом шаге, потому что…" value={explanation} onChange={event => setExplanation(event.target.value)} minLength={10} maxLength={2000} required disabled={!!review || busy} aria-describedby="explanation-help" />
                    <div className="field-help" id="explanation-help"><span>От 10 символов. Формулы необязательны.</span><span>{explanation.length} / 2000</span></div>
                  </div>
                  {!review && <div className="form-footer"><p>Можно ошибаться.<br />Для этого мы и тренируемся.</p><button className="primary-button" disabled={busy || selectedStep === null || explanation.trim().length < 10}>{busy ? 'Проверяем объяснение…' : 'Проверить и открыть разбор'}<span aria-hidden="true">→</span></button></div>}
                </form>
                <p className="demo-notice">{explanationMode === 'model' ? 'ИИ сверяет объяснение с проверенным эталоном. Твоё объяснение отправляется на проверку после нажатия кнопки.' : explanationMode === 'reference_only' ? 'Проверка объяснений пока не подключена. Сравни своё объяснение с эталоном после отправки.' : 'После отправки увидишь результат проверки и проверенный разбор.'}</p>
              </article>

              {review && <section className="review-card" aria-labelledby="review-title">
                <p className="eyebrow">Разбираемся вместе</p>
                <h2 ref={reviewHeading} tabIndex={-1} id="review-title">{review.selectedStepCorrect ? 'Ошибка найдена!' : 'Посмотрим внимательнее'}</h2>
                <p className="review-feedback">{review.feedback}</p>
                <div className={`explanation-assessment assessment-${review.explanationAssessment}`} aria-live="polite">
                  <h3>{assessmentLabels[review.explanationAssessment]}</h3>
                  <p>{review.explanationFeedback}</p>
                  {review.rubricResults.length > 0 && <ul>{review.rubricResults.map(result => <li key={result.criterion}><strong>{result.met ? '✓ Раскрыто' : 'Уточни'}: {result.criterion}</strong><span>{result.evidence}</span></li>)}</ul>}
                  {review.explanationAssessment === 'not_evaluated' && review.explanationIssue !== 'not_configured' && !practiceResult && <button type="button" className="hint-button" disabled={busy} onClick={() => void submitExplanation()}>{busy ? 'Повторно проверяем…' : 'Повторить проверку объяснения'}</button>}
                </div>
                <div className="reference-explanation">{review.referenceExplanation}</div>
                <h3>Правильное решение</h3>
                <ol className="correct-steps">{review.correctSteps.map(step => <li key={step}>{step}</li>)}</ol>
                <p className="correct-answer">Правильный ответ: {review.correctAnswer.toLocaleString('ru-RU')} {review.answerUnit}</p>
                <p className="self-check">Сравни разбор со своим объяснением. Ты указал причину первого неверного шага?</p>
              </section>}

              {review && <section className="exercise-card practice-card" aria-labelledby="practice-title">
                <p className="eyebrow">Теперь твоя очередь</p>
                <h2 id="practice-title">Проверь, что понял</h2>
                <p className="problem-text">{review.practice.prompt}</p>
                {!practiceResult && <form className="practice-form" onSubmit={submitPractice}>
                  <label htmlFor="practice-answer">Твой ответ, {review.practice.unit}</label>
                  <div className="practice-input-row"><input id="practice-answer" type="text" inputMode="decimal" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Твой ответ" maxLength={100} required disabled={busy} /><button className="primary-button" disabled={busy || !answer.trim()}>{busy ? 'Проверяем…' : 'Проверить ответ'}<span aria-hidden="true">→</span></button></div>
                  <p className="field-help">Можно использовать запятую или точку. Введи число без формулы.</p>
                  {error && <p className="error-message" role="alert">{error}</p>}
                </form>}
                {practiceResult && <div className="practice-result" role="status">
                  <h3 ref={resultHeading} tabIndex={-1}>{practiceResult.correct ? 'Верно! Теперь ты учитель.' : `Правильный ответ — ${practiceResult.expectedAnswer.toLocaleString('ru-RU')} ${review.practice.unit}`}</h3>
                  <p>{practiceResult.explanation}</p>
                  <p className="saved-note">{saved ? '✓ Попытка сохранена в этом браузере' : 'Попытка не сохранена: локальное хранилище недоступно'}</p>
                  <div className="result-actions"><button type="button" className="primary-button" onClick={() => chooseExercise(exercises[(exerciseIndex + 1) % exercises.length].id)}>Следующая задача<span aria-hidden="true">→</span></button><button type="button" className="hint-button" onClick={reset}>Пройти ещё раз<span aria-hidden="true">↻</span></button></div>
                </div>}
              </section>}
            </>}
          </section>
        </div>

        <details className="how-it-works" id="how-it-works"><summary>Почему мы учим ошибающегося ИИ?</summary><p>Чтобы объяснить чужую ошибку, нужно разобраться в принципе самому. Сначала найди первый неверный шаг, затем объясни причину и реши похожую задачу. Доступны 15 проверенных задач и по две подсказки к каждой. ИИ оценивает объяснение по проверенному эталону, когда проверка подключена. Оценка объяснения и выбор шага проверяются отдельно. Если проверка недоступна, приложение сообщит об этом и покажет эталон. При смене задачи незавершённая форма сбрасывается, завершённые попытки сохраняются.</p></details>
      </main>
      <footer className="site-footer"><span>Меньше угадывания. Больше понимания.</span><span>Обучи ошибающегося ИИ · 2026</span></footer>
    </div>
  );
}
