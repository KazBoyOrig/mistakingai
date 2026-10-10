import { attemptsKey } from './storage.ts';
import { sessionKey } from './session.ts';

// Удаляем только данные тренажёра. При частичном отказе пытаемся вернуть обе записи.
export function resetLocalProgress(): boolean {
  try {
    const storage = localStorage;
    const backup = [sessionKey, attemptsKey].map(key => [key, storage.getItem(key)] as const);
    try {
      for (const [key] of backup) storage.removeItem(key);
      return true;
    } catch {
      for (const [key, value] of backup) {
        try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); }
        catch { /* Хранилище может запретить и восстановление; успех не подтверждаем. */ }
      }
      return false;
    }
  } catch { return false; }
}
