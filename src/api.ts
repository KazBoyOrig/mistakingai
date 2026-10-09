export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Сервер не ответил. Проверь соединение и попробуй ещё раз.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Сервер вернул неожиданный ответ. Попробуй ещё раз.');
  }
  if (!response.ok) throw new Error(data.error ?? 'Не удалось получить ответ сервера.');
  return data as T;
}
