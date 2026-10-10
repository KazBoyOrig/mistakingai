import { createApp } from './app.ts';
import { createExplanationEvaluator } from './explanation-evaluator.ts';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT должен быть числом от 1 до 65535.');
const host = process.env.HOST ?? '127.0.0.1';
const evaluator = createExplanationEvaluator();
const server = createApp(evaluator);
server.on('error', error => {
  console.error('Не удалось запустить сервер:', error.message);
  process.exit(1);
});
server.listen(port, host, () => console.log(`Сервер: http://${host}:${port} · ${evaluator.configured ? 'проверка объяснений подключена' : 'проверка объяснений не подключена'}`));
