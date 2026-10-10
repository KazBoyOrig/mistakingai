import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Attempt, Exercise, Health, PracticeResult, Review, Solution } from '../shared/types.ts';
import { request } from './api.ts';
import { loadAttempts, saveAttempts, upsertAttempt } from './storage.ts';
import { loadSession, saveSession } from './session.ts';

const stages = ['Найди ошибку', 'Объясни своими словами', 'Закрепи понимание'];
const assessmentLabels = { correct: 'Объяснение верное', partial: 'Объяснение частично верное', incorrect: 'Объяснение неверное', unclear: 'Нужно уточнить смысл объяснения', not_evaluated: 'Объяснение не оценено' };

function attemptWord(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return 'попыток';
  if (count % 10 === 1) return 'попытка';
  if (count % 10 >= 2 && count % 10 <= 4) return 'попытки';
  return 'попыток';
}

export default function App() {
  const [restored] = useState(loadSession);
  const initial = restored.session;
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseId, setExerciseId] = useState(initial?.exerciseId ?? 'discount-then-markup-01');
  const exercise = exercises.find(item => item.id === exerciseId) ?? null;
  const exerciseIndex = exercises.findIndex(item => item.id === exerciseId);
  const [hintCount, setHintCount] = useState(initial?.hintCount ?? 0);
  const [selectedStep, setSelectedStep] = useState<number | null>(initial?.selectedStep ?? null);
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [review, setReview] = useState<Review | null>(initial?.review ?? null);
  const [solution, setSolution] = useState<Solution | null>(initial?.solution ?? null);
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(initial?.practiceResult ?? null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(initial?.activeAttemptId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(loadAttempts);
  const [saved, setSaved] = useState(() => !!initial?.activeAttemptId && progress.attempts.some(attempt => attempt.id === initial.activeAttemptId
    && attempt.selectedStep === initial.selectedStep && attempt.explanation === initial.explanation.trim()
    && attempt.explanationAssessment === (initial.review?.verdict ?? 'not_evaluated')
    && attempt.practiceCorrect === (initial.practiceResult?.correct ?? null)
    && attempt.practiceAnswer === (initial.practiceResult ? initial.answer.trim() : '')));
  const [sessionError, setSessionError] = useState(restored.error);
  const [loadVersion, setLoadVersion] = useState(0);
  const [explanationMode, setExplanationMode] = useState<Health['mode'] | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const solutionHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const successfulAttempts = progress.attempts.filter(attempt => attempt.selectedStepCorrect && attempt.practiceCorrect).length;
  const understoodAttempts = progress.attempts.filter(attempt => attempt.selectedStepCorrect && attempt.practiceCorrect && attempt.explanationAssessment === 'correct').length;
  const attemptedIds = new Set(progress.attempts.filter(attempt => attempt.practiceCorrect !== null).map(attempt => attempt.exerciseId));
  const recentAttempts = progress.attempts.filter(attempt => attempt.exerciseId === exerciseId).slice(-5).reverse();

  useEffect(() => {
    let active = true;
    request<Exercise[]>('/api/exercises')
      .then(data => { if (active) setExercises(data); })
      .catch(() => { if (active) setError('Не удалось загрузить задачу. Проверь, что сервер запущен, и попробуй снова.'); });
    request<Health>('/api/health').then(data => { if (active) setExplanationMode(data.mode); }).catch(() => { if (active) setExplanationMode(null); });
    return () => { active = false; };
  }, [loadVersion]);

  useEffect(() => {
    if (review) reviewHeading.current?.focus();
    else if (explanation) document.getElementById('explanation')?.focus();
  }, [review]);
  useEffect(() => { if (solution) solutionHeading.current?.focus(); }, [solution]);
  useEffect(() => { if (practiceResult) resultHeading.current?.focus(); }, [practiceResult]);

  useEffect(() => {
    if (!saveSession({ exerciseId, hintCount, selectedStep, explanation, review, solution, answer, practiceResult, activeAttemptId })) {
      setSessionError('Браузер не разрешил сохранить текущую задачу. После обновления страницы форма может сброситься.');
    }
  }, [exerciseId, hintCount, selectedStep, explanation, review, solution, answer, practiceResult, activeAttemptId]);

  useEffect(() => {
    if (!exercises.length) return;
    const current = exercises.find(item => item.id === exerciseId);
    if (!current || selectedStep !== null && !current.steps.some(step => step.number === selectedStep)) {
      reset();
      setExerciseId(current?.id ?? exercises[0].id);
      setSessionError('Сохранённая задача изменилась. Начни новую попытку; прежние результаты остаются в истории.');
    }
  }, [exercises, exerciseId, selectedStep]);

  function recordAttempt(attempt: Attempt) {
    const attempts = upsertAttempt(progress.attempts, attempt);
    const stored = saveAttempts(attempts);
    setProgress({ attempts, error: stored ? null : 'Браузер не разрешил сохранить прогресс. Результат доступен только до закрытия страницы.' });
    setSaved(stored);
  }

  async function submitExplanation(event?: FormEvent) {
    event?.preventDefault();
    if (!exercise || selectedStep === null || submitting.current || practiceResult) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await request<Review>('/api/review', { exerciseId: exercise.id, selectedStep, explanation });
      const id = activeAttemptId ?? crypto.randomUUID();
      recordAttempt({
        id, exerciseId: exercise.id, createdAt: progress.attempts.find(attempt => attempt.id === id)?.createdAt ?? new Date().toISOString(),
        selectedStep, explanation: explanation.trim(), selectedStepCorrect: result.selectedStepCorrect,
        explanationAssessment: result.verdict ?? 'not_evaluated', explanationFeedback: result.feedback,
        followUpQuestion: result.followUpQuestion, explanationIssue: result.explanationIssue,
        practiceAnswer: '', practiceCorrect: null,
      });
      setActiveAttemptId(id);
      setReview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить объяснение. Попробуй ещё раз.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function openSolution() {
    if (!exercise || !review || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try { setSolution(await request<Solution>('/api/solutions/' + encodeURIComponent(exercise.id))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось открыть разбор. Попробуй ещё раз.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function submitPractice(event: FormEvent) {
    event.preventDefault();
    if (!exercise || !review || !solution || selectedStep === null || submitting.current || practiceResult) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await request<PracticeResult>('/api/practice', { exerciseId: exercise.id, answer });
      const id = activeAttemptId ?? crypto.randomUUID();
      const attempt: Attempt = {
        id, exerciseId: exercise.id, createdAt: progress.attempts.find(item => item.id === id)?.createdAt ?? new Date().toISOString(),
        selectedStep, explanation: explanation.trim(), selectedStepCorrect: review.selectedStepCorrect,
        explanationAssessment: review.verdict ?? 'not_evaluated', explanationFeedback: review.feedback,
        followUpQuestion: review.followUpQuestion, explanationIssue: review.explanationIssue,
        practiceAnswer: answer.trim(), practiceCorrect: result.correct,
      };
      recordAttempt(attempt);
      setActiveAttemptId(id);
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
    setSolution(null);
    setAnswer('');
    setPracticeResult(null);
    setError(null);
    setSaved(false);
    setHintCount(0);
    setActiveAttemptId(null);
    setSessionError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function tryAgain() {
    if (busy) return;
    if (!review?.selectedStepCorrect) setSelectedStep(null);
    setReview(null);
    setSolution(null);
    setPracticeResult(null);
    setAnswer('');
    setActiveAttemptId(null);
    setError(null);
    setSaved(false);
    // Сохраняем написанное объяснение и открытые подсказки для уточнения мысли.
  }

  function chooseExercise(id: string) {
    if (busy || id === exerciseId || !exercises.some(item => item.id === id)) return;
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
              <p>Закрепление пройдено: {exercises.filter(item => attemptedIds.has(item.id)).length} / {exercises.length || 15}</p>
              <div className="task-navigation">
                <button type="button" className="hint-button" disabled={busy || exerciseIndex <= 0} onClick={() => chooseExercise(exercises[exerciseIndex - 1].id)}>← Предыдущая</button>
                <button type="button" className="hint-button" disabled={busy || exerciseIndex < 0 || exerciseIndex === exercises.length - 1} onClick={() => chooseExercise(exercises[exerciseIndex + 1].id)}>Следующая →</button>
              </div>
            </div>
            <div className="journey">
              <p className="small-label">Три шага к пониманию</p>
              <ol>
                {stages.map((stage, index) => {
                  const current = solution ? 2 : review && !review.selectedStepCorrect ? 0 : selectedStep ? 1 : 0;
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
            {sessionError && <p className="storage-warning" role="status">{sessionError}</p>}
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
                      const wrong = solution?.firstWrongStep === step.number;
                      return <label key={step.number} className={`solution-step${selected ? ' step-selected' : ''}${wrong ? ' step-error' : ''}`}>
                        <input type="radio" name="first-wrong-step" value={step.number} checked={selected} onChange={() => { setSelectedStep(step.number); setError(null); }} required />
                        <span className="step-index" aria-hidden="true">{step.number.toString().padStart(2, '0')}</span>
                        <span className="step-content"><strong>{step.title}</strong><span>{step.text}</span></span>
                        {wrong && <span className="step-badge">Первая ошибка</span>}
                      </label>;
                    })}
                  </fieldset>
                  {!solution && <div className="hints-panel">
                    <button type="button" className="hint-button" disabled={busy || hintCount === 2} onClick={() => setHintCount(count => Math.min(count + 1, 2))}>{hintCount === 0 ? 'Нужна подсказка?' : hintCount === 1 ? 'Показать вторую подсказку' : 'Обе подсказки открыты'}<span>{hintCount} / 2</span></button>
                    <div aria-live="polite">{exercise.hints.slice(0, hintCount).map((hint, index) => <p key={hint}><strong>Подсказка {index + 1}.</strong> {hint}</p>)}</div>
                  </div>}
                  <div className="explanation-field">
                    <label htmlFor="explanation">В чём ошибка?<span>Объясни своими словами</span></label>
                    <textarea id="explanation" rows={4} placeholder="Я думаю, ошибка в этом шаге, потому что…" value={explanation} onChange={event => setExplanation(event.target.value)} maxLength={2000} required disabled={!!review || busy} aria-describedby="explanation-help" />
                    <div className="field-help" id="explanation-help"><span>Короткий ответ допустим. Формулы необязательны.</span><span>{explanation.length} / 2000</span></div>
                  </div>
                  {!review && <div className="form-footer"><p>Можно ошибаться.<br />Для этого мы и тренируемся.</p><button className="primary-button" disabled={busy || selectedStep === null || !explanation.trim()}>{busy ? 'Проверяем объяснение…' : 'Проверить шаг и объяснение'}<span aria-hidden="true">→</span></button></div>}
                </form>
                <p className="demo-notice">{explanationMode === 'model' ? 'ИИ сверяет объяснение с проверенным эталоном. Твоё объяснение отправляется на проверку после нажатия кнопки.' : explanationMode === 'reference_only' ? 'Проверка объяснений пока не подключена. Сравни своё объяснение с эталоном, открыв разбор.' : 'После отправки увидишь обратную связь. Разбор можно открыть отдельно.'}</p>
              </article>

              {review && <section className="review-card" aria-labelledby="review-title">
                <p className="eyebrow">Разбираемся вместе</p>
                <h2 ref={reviewHeading} tabIndex={-1} id="review-title">{review.selectedStepCorrect ? 'Ошибка найдена!' : 'Посмотрим внимательнее'}</h2>
                <p className="review-feedback">{review.stepFeedback}</p>
                <div className={`explanation-assessment assessment-${review.verdict ?? 'not_evaluated'}`} aria-live="polite">
                  <h3>{assessmentLabels[review.verdict ?? 'not_evaluated']}</h3>
                  <p>{review.feedback}</p>
                  {review.followUpQuestion && <p className="follow-up-question"><strong>Уточняющий вопрос:</strong> {review.followUpQuestion}</p>}
                  {['partial', 'unclear', 'incorrect'].includes(review.verdict ?? '') && !practiceResult && <button type="button" className="hint-button" disabled={busy} onClick={tryAgain}>Уточнить объяснение</button>}
                  {review.verdict === null && !practiceResult && <button type="button" className="hint-button" disabled={busy} onClick={() => void submitExplanation()}>{busy ? 'Повторно проверяем…' : 'Повторить проверку объяснения'}</button>}
                </div>
                {!solution && <>
                  <div className="result-actions">
                    {!review.selectedStepCorrect && <button type="button" className="primary-button" disabled={busy} onClick={tryAgain}>Попробовать снова<span aria-hidden="true">↻</span></button>}
                    {hintCount < 2 && <button type="button" className="hint-button" disabled={busy} onClick={() => setHintCount(count => Math.min(count + 1, 2))}>Открыть подсказку<span>{hintCount + 1} / 2</span></button>}
                    <button type="button" className="hint-button" disabled={busy} onClick={() => void openSolution()}>{busy ? 'Загружаем…' : 'Открыть правильный разбор'}<span aria-hidden="true">→</span></button>
                  </div>
                  {hintCount > 0 && <div className="hints-panel" aria-live="polite">{exercise.hints.slice(0, hintCount).map((hint, index) => <p key={hint}><strong>Подсказка {index + 1}.</strong> {hint}</p>)}</div>}
                </>}
                {error && !solution && <p className="error-message" role="alert">{error}</p>}
              </section>}

              {solution && <section className="review-card" aria-labelledby="solution-title">
                <p className="eyebrow">Проверенный разбор</p>
                <h2 ref={solutionHeading} tabIndex={-1} id="solution-title">Первая ошибка — на шаге {solution.firstWrongStep}</h2>
                <div className="reference-explanation">{solution.referenceExplanation}</div>
                <h3>Правильное решение</h3>
                <ol className="correct-steps">{solution.correctSteps.map(step => <li key={step}>{step}</li>)}</ol>
                <p className="correct-answer">Правильный ответ: {solution.correctAnswer.toLocaleString('ru-RU')} {solution.answerUnit}</p>
                <p className="self-check">Сравни разбор со своим объяснением. Ты указал причину первого неверного шага?</p>
              </section>}

              {review && solution && <section className="exercise-card practice-card" aria-labelledby="practice-title">
                <p className="eyebrow">Теперь твоя очередь</p>
                <h2 id="practice-title">Проверь, что понял</h2>
                <p className="problem-text">{solution.practice.prompt}</p>
                {!practiceResult && <form className="practice-form" onSubmit={submitPractice}>
                  <label htmlFor="practice-answer">Твой ответ, {solution.practice.unit}</label>
                  <div className="practice-input-row"><input id="practice-answer" type="text" inputMode="decimal" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Твой ответ" maxLength={100} required disabled={busy} /><button className="primary-button" disabled={busy || !answer.trim()}>{busy ? 'Проверяем…' : 'Проверить ответ'}<span aria-hidden="true">→</span></button></div>
                  <p className="field-help">Запятая, точка и пробелы допустимы. Единицу можно не писать: {solution.practice.unit === '₽' ? 'например, 1 000,50 руб.' : solution.practice.unit === '%' ? 'например, 12,5%' : 'например, 12 п.п. или 12 процентных пунктов'}</p>
                  {error && <p className="error-message" role="alert">{error}</p>}
                </form>}
                {practiceResult && <div className="practice-result" role="status">
                  <h3 ref={resultHeading} tabIndex={-1}>{practiceResult.correct ? 'Закрепление решено верно!' : `Правильный ответ — ${practiceResult.expectedAnswer.toLocaleString('ru-RU')} ${solution.practice.unit}`}</h3>
                  <p>{practiceResult.explanation}</p>
                  <dl className="attempt-outcomes">
                    <div><dt>Выбор шага</dt><dd>{review.selectedStepCorrect ? 'Верно' : 'Неверно'}</dd></div>
                    <div><dt>Объяснение</dt><dd>{assessmentLabels[review.verdict ?? 'not_evaluated']}</dd></div>
                    <div><dt>Закрепление</dt><dd>{practiceResult.correct ? 'Верно' : 'Неверно'}</dd></div>
                  </dl>
                  <p className="saved-note">{saved ? '✓ Попытка сохранена в этом браузере' : 'Попытка не сохранена: локальное хранилище недоступно'}</p>
                  <div className="result-actions"><button type="button" className="primary-button" onClick={() => chooseExercise(exercises[(exerciseIndex + 1) % exercises.length].id)}>Следующая задача<span aria-hidden="true">→</span></button><button type="button" className="hint-button" onClick={reset}>Пройти ещё раз<span aria-hidden="true">↻</span></button></div>
                </div>}
              </section>}
              {recentAttempts.length > 0 && <details className="attempt-history">
                <summary>Последние попытки этой задачи ({recentAttempts.length})</summary>
                <ul>{recentAttempts.map(attempt => <li key={attempt.id}>
                  <time dateTime={attempt.createdAt}>{new Date(attempt.createdAt).toLocaleString('ru-RU')}</time>
                  <span>Шаг {attempt.selectedStep}: {attempt.selectedStepCorrect ? 'верно' : 'неверно'}</span>
                  <span>{assessmentLabels[attempt.explanationAssessment]}</span>
                  <span>Закрепление: {attempt.practiceCorrect === null ? 'ещё не решено' : attempt.practiceCorrect ? 'верно' : 'неверно'}</span>
                </li>)}</ul>
              </details>}
            </>}
          </section>
        </div>

        <details className="how-it-works" id="how-it-works"><summary>Почему мы учим ошибающегося ИИ?</summary><p>Чтобы объяснить чужую ошибку, нужно разобраться в принципе самому. Сначала найди первый неверный шаг и объясни причину. После обратной связи можно попробовать снова или открыть подсказку. Правильный разбор открывается отдельной кнопкой; затем реши похожую задачу. Доступны 15 проверенных задач. ИИ оценивает объяснение по эталону, когда проверка подключена. Выбор шага, объяснение и закрепление сохраняются отдельно. Текущая задача и форма восстанавливаются после обновления страницы. Переход к другой задаче начинает новую форму; история попыток остаётся.</p></details>
      </main>
      <footer className="site-footer"><span>Меньше угадывания. Больше понимания.</span><span>Обучи ошибающегося ИИ · 2026</span></footer>
    </div>
  );
}
