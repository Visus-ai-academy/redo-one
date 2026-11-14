import { CheckCircle, Circle } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';
import { requisitosDaSenha } from '../../lib/senha';

/** Requisitos da senha nova, marcados enquanto a pessoa digita; o leitor de tela ouve o estado. */
export function RequisitosSenha({ senha, confirmacao }: { senha: string; confirmacao: string }) {
  return (
    <ul
      aria-label="Requisitos da senha"
      className="bg-card flex flex-col gap-2 rounded-md border p-3 text-[13px]"
    >
      {requisitosDaSenha(senha, confirmacao).map((requisito) => (
        <li
          key={requisito.texto}
          className={cn(
            'flex items-center gap-2',
            requisito.atendido ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {requisito.atendido ? (
            <CheckCircle size={16} aria-hidden className="flex-none" />
          ) : (
            <Circle size={16} aria-hidden className="flex-none" />
          )}
          <span>
            {requisito.texto}
            <span className="sr-only">{requisito.atendido ? ' (atendido)' : ' (pendente)'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
