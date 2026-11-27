import { Fieldset } from '@base-ui/react/fieldset';

import { cn } from '../../lib/cn';
import { IntervaloDeDatas } from '../periodo/IntervaloDeDatas';
import type { ValorPeriodo } from '../periodo/periodo';
import { useFieldContext } from './context';
import { Legenda } from './Legenda';
import { useCampo } from './use-campo';

/**
 * Período num formulário: De e Até lado a lado (`CampoData`), num valor só (`{ de, ate }`). O
 * esquema valida o intervalo (`erroDoPeriodo`) e o obrigatório; o erro aparece abaixo das datas.
 * Para filtrar uma lista, o `FiltroPeriodo` (atalhos + "Personalizado…").
 */
export function PeriodoField({
  label,
  required = false,
  description,
  className,
}: {
  label: string;
  required?: boolean;
  description?: string;
  className?: string;
}) {
  const field = useFieldContext<ValorPeriodo>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  return (
    // Sem `Field.Root`: ele daria o mesmo id às duas datas. Cada data tem o próprio rótulo.
    <div ref={ref} className={cn('flex flex-col gap-2', className)}>
      <Fieldset.Root className="flex flex-col gap-2">
        <Legenda required={required}>{label}</Legenda>
        <IntervaloDeDatas
          valor={field.state.value}
          obrigatorio={required}
          erro={invalido ? erros.join(', ') : undefined}
          onMudar={(valor) => field.handleChange(valor)}
          onSair={aoSair}
        />
        {description && <p className="text-muted-foreground text-[13px]">{description}</p>}
      </Fieldset.Root>
    </div>
  );
}
