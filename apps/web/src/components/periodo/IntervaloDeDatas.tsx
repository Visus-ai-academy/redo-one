import { useId } from 'react';

import { cn } from '../../lib/cn';
import { CampoData } from '../campo-data/CampoData';
import { MarcaObrigatorio } from '../form/field-parts';

/**
 * De e Até lado a lado (`CampoData`), com o erro do intervalo abaixo, ligado ao "Até". Peça comum
 * do `FiltroPeriodo` (no popover) e do `PeriodoField` (no formulário).
 */
export function IntervaloDeDatas({
  valor,
  onMudar,
  onSair,
  erro,
  obrigatorio = false,
  className,
}: {
  valor: { de: string; ate: string };
  onMudar: (valor: { de: string; ate: string }) => void;
  onSair?: () => void;
  erro?: string;
  obrigatorio?: boolean;
  className?: string;
}) {
  const deId = useId();
  const ateId = useId();
  const erroId = useId();
  const rotulo = (id: string, texto: string) => (
    <span>
      <label htmlFor={id} className="font-medium">
        {texto}
      </label>
      {obrigatorio && <MarcaObrigatorio />}
    </span>
  );
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          {rotulo(deId, 'De')}
          <CampoData
            id={deId}
            value={valor.de}
            required={obrigatorio}
            onValueChange={(de) => onMudar({ ...valor, de })}
            onBlur={onSair}
            className="min-w-0"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          {rotulo(ateId, 'Até')}
          <CampoData
            id={ateId}
            value={valor.ate}
            min={valor.de || undefined}
            required={obrigatorio}
            aria-invalid={Boolean(erro) || undefined}
            aria-describedby={erro ? erroId : undefined}
            onValueChange={(ate) => onMudar({ ...valor, ate })}
            onBlur={onSair}
            className="min-w-0"
          />
        </span>
      </div>
      {erro && (
        <p id={erroId} className="text-destructive text-[13px]">
          {erro}
        </p>
      )}
    </div>
  );
}
