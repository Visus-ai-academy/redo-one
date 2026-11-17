import { Field } from '@base-ui/react/field';
import { Switch } from '@base-ui/react/switch';

import { cn } from '../../lib/cn';

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
 * Liga/desliga que vale na hora (ex.: "Habilitado no robô"), sobre o Switch do Base UI, com o
 * rótulo ao lado e a ajuda abaixo. Para um campo de formulário que só vale ao salvar, use a caixa
 * de marcar.
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
        <Switch.Root
          checked={ligado}
          onCheckedChange={(valor) => onMudar(valor)}
          readOnly={somenteLeitura}
          className="border-input bg-muted focus-visible:outline-ring data-[checked]:border-primary data-[checked]:bg-primary flex h-5 w-9 flex-none items-center rounded-full border p-0.5 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:opacity-60 data-[readonly]:opacity-70 motion-reduce:transition-none"
        >
          <Switch.Thumb className="bg-card size-3.5 rounded-full shadow-sm transition-[translate] duration-150 ease-out data-[checked]:translate-x-4 motion-reduce:transition-none" />
        </Switch.Root>
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
