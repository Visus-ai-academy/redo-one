import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type TomEtiqueta = 'sucesso' | 'atencao' | 'erro' | 'info' | 'inativo';

const tons: Record<TomEtiqueta, string> = {
  sucesso: 'bg-success-soft text-success',
  atencao: 'bg-warning-soft text-warning',
  erro: 'bg-destructive-soft text-destructive',
  info: 'bg-info-soft text-info',
  inativo: 'bg-inactive-soft text-inactive',
};

/**
 * Status pequeno em pílula: fundo claro + texto escuro da mesma matiz, sempre com texto (e ícone).
 * Em espaço apertado, encolhe e corta o texto com reticências; o texto inteiro fica no `title`.
 */
export function Etiqueta({
  tom,
  icone: Icone,
  children,
}: {
  tom: TomEtiqueta;
  icone?: Icon;
  children: ReactNode;
}) {
  return (
    <span
      title={typeof children === 'string' ? children : undefined}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tons[tom],
      )}
    >
      {Icone && <Icone size={14} aria-hidden className="flex-none" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
