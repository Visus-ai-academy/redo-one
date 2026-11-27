import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { Interruptor } from '../interruptor/Interruptor';

type ChaveProps = {
  rotulo: string;
  descricao?: string;
  ligado: boolean;
  onMudar: (ligado: boolean) => void;
  /** Mostra o estado sem deixar mudar (sem permissão). */
  somenteLeitura?: boolean;
  /** Enquanto salva: não aceita outro clique. */
  desabilitado?: boolean;
  className?: string;
};

/**
 * Liga/desliga que vale na hora (ex.: "Habilitado no robô"), sobre o `Interruptor`, com o
 * rótulo ao lado e a ajuda abaixo. Para um campo de formulário que só vale ao salvar, use o
 * `InterruptorField` do kit de formulário.
 */
export function Chave({
  rotulo,
  descricao,
  ligado,
  onMudar,
  somenteLeitura = false,
  desabilitado = false,
  className,
}: ChaveProps) {
  return (
    <Field.Root className={cn('flex flex-col gap-1', className)} disabled={desabilitado}>
      <Field.Label className="flex items-center gap-3 font-medium">
        <Interruptor checked={ligado} onCheckedChange={onMudar} readOnly={somenteLeitura} />
        {rotulo}
      </Field.Label>
      {descricao && (
        <Field.Description className="text-muted-foreground pl-12 text-[13px]">
          {descricao}
        </Field.Description>
      )}
    </Field.Root>
  );
}
