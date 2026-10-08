import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoExercise, demoReference, parseNumericAnswer, reviewAttempt } from './exercises.ts';

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new RequestError(415, 'Отправьте данные в формате JSON.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 16_384) throw new RequestError(413, 'Запрос слишком большой.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new RequestError(400, 'Не удалось прочитать данные запроса.');
  }
}

export function createApp() {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/api/health') {
        json(response, 200, { status: 'ok', mode: 'demo', exerciseCount: 1, explanationAssessment: 'not_evaluated' });
        return;
      }
      if (request.method === 'GET' && pathname === '/api/exercises/demo') {
        json(response, 200, demoExercise);
        return;
      }
      if (request.method === 'POST' && (pathname === '/api/review' || pathname === '/api/practice')) {
        const body = await readBody(request);
        if (body.exerciseId !== demoExercise.id) throw new RequestError(404, 'Задача не найдена.');
        if (pathname === '/api/review') {
          if (!Number.isInteger(body.selectedStep) || !demoExercise.steps.some(step => step.number === body.selectedStep)) {
            throw new RequestError(400, 'Выберите шаг решения.');
          }
          if (typeof body.explanation !== 'string' || body.explanation.trim().length < 10 || body.explanation.length > 2_000) {
            throw new RequestError(400, 'Напишите объяснение длиной от 10 до 2 000 символов.');
          }
          // На первом этапе смысл объяснения не оценивается. Не имитируем ответ ИИ.
          json(response, 200, reviewAttempt(body.selectedStep as number));
        } else {
          if (typeof body.answer !== 'string' || body.answer.length > 100) throw new RequestError(400, 'Введите числовой ответ.');
          const answer = parseNumericAnswer(body.answer);
          if (answer === null) throw new RequestError(400, 'Введите число, например 990 или 990,00.');
          json(response, 200, {
            correct: answer === demoReference.practice.answer,
            expectedAnswer: demoReference.practice.answer,
            explanation: demoReference.practice.explanation,
          });
        }
        return;
      }
      if (pathname.startsWith('/api/')) throw new RequestError(404, 'API-маршрут не найден.');
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new RequestError(405, 'Метод не поддерживается.');
      const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      const fullPath = resolve(distDirectory, relativePath);
      if (!fullPath.startsWith(resolve(distDirectory) + sep)) throw new RequestError(403, 'Путь недоступен.');
      try {
        const file = await readFile(fullPath);
        response.writeHead(200, { 'Content-Type': mimeTypes[extname(fullPath)] ?? 'application/octet-stream' });
        response.end(request.method === 'HEAD' ? undefined : file);
      } catch {
        throw new RequestError(404, 'Страница не найдена. Для запуска выполните npm run build.');
      }
    } catch (error) {
      if (error instanceof RequestError) json(response, error.status, { error: error.message });
      else if (error instanceof URIError) json(response, 400, { error: 'Некорректный адрес.' });
      else {
        console.error('Ошибка обработки запроса:', error);
        json(response, 500, { error: 'Ошибка сервера. Попробуйте ещё раз.' });
      }
    }
  });
}
