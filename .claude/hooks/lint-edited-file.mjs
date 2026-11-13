// Hook PostToolUse: roda o Biome (lint, formatação e imports) no arquivo que o Claude acabou de
// editar, espelhando o lint-staged. Erros que o Biome não corrige sozinho voltam para o Claude (exit 2).
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import process from 'node:process';

const input = JSON.parse(await readStdin());
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (!file || relative(root, file).startsWith('..') || file.includes('node_modules'))
  process.exit(0);

// Tipos de arquivo não suportados e os excluídos no biome.json (gerados, Markdown) são ignorados.
const biome = spawnSync(
  'pnpm',
  [
    'exec',
    'biome',
    'check',
    '--write',
    '--error-on-warnings',
    '--no-errors-on-unmatched',
    '--files-ignore-unknown=true',
    file,
  ],
  { cwd: root, encoding: 'utf8' },
);

if (biome.status !== 0) {
  process.stderr.write(`O Biome encontrou problemas em ${file}:\n${biome.stdout}${biome.stderr}`);
  process.exit(2);
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
