import { X } from '@phosphor-icons/react';
import { type ReactNode, useId } from 'react';

import { buttonClassName } from '../button/button-class';

type PainelLateralProps = {
  titulo: ReactNode;
  /** Linha abaixo do título (ex.: e-mail da pessoa). */
  subtitulo?: ReactNode;
  /** À esquerda do título (ex.: avatar). */
  inicio?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
};

/**
 * Painel ao lado de uma lista (detalhe, convite, edição): a lista continua à vista. No celular,
 * quem o usa esconde a lista e o painel ocupa a tela; "Fechar" volta para ela.
 */
export function PainelLateral({
  titulo,
  subtitulo,
  inicio,
  onFechar,
  children,
}: PainelLateralProps) {
  const tituloId = useId();

  return (
    <aside
      aria-labelledby={tituloId}
      className="bg-card flex min-w-0 flex-[1_1_340px] flex-col self-start rounded-lg border lg:max-w-[400px]"
    >
      <div className="flex items-center gap-3 border-b p-4">
        {inicio}
        <span className="flex min-w-0 flex-1 flex-col">
          <h2 id={tituloId} className="truncate text-base font-semibold">
            {titulo}
          </h2>
          {subtitulo && (
            <span className="text-muted-foreground truncate text-[13px]">{subtitulo}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar painel"
          className={buttonClassName({ variant: 'ghost', className: 'size-9 flex-none px-0' })}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {children}
    </aside>
  );
}
