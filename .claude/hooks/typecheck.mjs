// Hook Stop: roda o typecheck do monorepo antes do Claude encerrar o turno.
// Com o cache do Turborepo, pacotes sem mudança não são checados de novo.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const input = JSON.parse(await readStdin());
// Evita loop: se o Claude já está continuando por causa deste hook, deixa parar.
if (input.stop_hook_active) process.exit(0);

const result = spawnSync('pnpm', ['turbo', 'run', 'typecheck', '--output-logs=errors-only'], {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(
    `O typecheck falhou. Corrija os erros abaixo:\n${result.stdout}${result.stderr}`,
  );
  process.exit(2);
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
