import { CheckCircle, Info, Lock, Warning, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

type Tom = 'erro' | 'atencao' | 'bloqueio' | 'info' | 'sucesso';

const tons: Record<Tom, { classe: string; Icone: typeof Info }> = {
  erro: { classe: 'bg-destructive-soft text-destructive', Icone: WarningCircle },
  atencao: { classe: 'bg-warning-soft text-warning', Icone: Warning },
  bloqueio: { classe: 'bg-warning-soft text-warning', Icone: Lock },
  info: { classe: 'bg-info-soft text-info', Icone: Info },
  sucesso: { classe: 'bg-success-soft text-success', Icone: CheckCircle },
};

/** Mensagem de estado no fluxo da tela (não flutua): fundo claro + texto escuro da mesma matiz + ícone. */
export function Alerta({
  tom,
  children,
  className,
  role,
}: {
  tom: Tom;
  children: ReactNode;
  className?: string;
  /** Padrão: `alert` para erro, bloqueio e atenção; `status` para o resto. Informação parada (que
   * não acabou de acontecer) passa `role="note"`, para o leitor de tela não interromper. */
  role?: 'alert' | 'status' | 'note';
}) {
  const { classe, Icone } = tons[tom];
  const urgente = tom === 'erro' || tom === 'bloqueio' || tom === 'atencao';

  return (
    <div
      role={role ?? (urgente ? 'alert' : 'status')}
      className={cn('flex items-start gap-3 rounded-md p-3 leading-normal', classe, className)}
    >
      <Icone size={18} aria-hidden className="mt-px flex-none" />
      <div>{children}</div>
    </div>
  );
}
