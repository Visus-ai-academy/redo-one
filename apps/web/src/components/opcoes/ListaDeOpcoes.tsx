import { Field } from '@base-ui/react/field';
import { Radio } from '@base-ui/react/radio';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';

export type OpcaoDaLista = {
  valor: string;
  rotulo: string;
  /** Explicação da opção, abaixo do rótulo (com ela, as opções ficam uma embaixo da outra). */
  ajuda?: ReactNode;
  /** Com `cor` (mesmo nula), a opção leva a bolinha da cor antes do rótulo. */
  cor?: string | null;
  /** Peça ao lado do rótulo (ex.: as horas do "Prazo mínimo" quando ele está marcado). */
  anexo?: ReactNode;
  disabled?: boolean;
};

/** O círculo da opção (Radio do Base UI), igual em toda escolha de uma entre poucas. */
export function BolinhaDeOpcao({ valor, disabled }: { valor: string; disabled?: boolean }) {
  return (
    <Radio.Root
      value={valor}
      disabled={disabled}
      className="border-input bg-card focus-visible:outline-ring data-[checked]:border-primary flex size-4 flex-none items-center justify-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
    >
      <Radio.Indicator className="bg-primary size-2 rounded-full data-[unchecked]:hidden" />
    </Radio.Root>
  );
}

/**
 * As opções redondas de um RadioGroup do Base UI (vai dentro dele, dentro de um `Field.Root`:
 * cada opção é um `Field.Item` com o seu rótulo). Sem ajuda, ficam lado a lado,
 * quebrando linha; com ajuda em alguma, uma embaixo da outra, com a ajuda alinhada ao rótulo.
 */
export function ListaDeOpcoes({
  opcoes,
  direcao,
  className,
}: {
  opcoes: readonly OpcaoDaLista[];
  /** Padrão: `coluna` se alguma opção tem ajuda; senão `linha`. */
  direcao?: 'linha' | 'coluna';
  className?: string;
}) {
  const coluna = direcao ? direcao === 'coluna' : opcoes.some((o) => o.ajuda);
  return (
    <div
      className={cn(coluna ? 'flex flex-col gap-2' : 'flex flex-wrap gap-x-5 gap-y-2', className)}
    >
      {opcoes.map((o) => (
        <div key={o.valor} className="flex flex-col gap-0.5">
          <div className={cn('flex items-center gap-3', o.anexo ? 'min-h-9' : 'min-h-6')}>
            {/* O anexo fica fora do item: o campo dele tem o próprio rótulo. */}
            <Field.Item>
              <Field.Label
                className={cn(
                  'flex items-center gap-2',
                  coluna && 'font-medium',
                  o.disabled && 'cursor-not-allowed',
                )}
              >
                <BolinhaDeOpcao valor={o.valor} disabled={o.disabled} />
                {o.cor !== undefined && <BolinhaCor cor={o.cor} className="size-2.5" />}
                {o.rotulo}
              </Field.Label>
            </Field.Item>
            {o.anexo}
          </div>
          {o.ajuda && <div className="text-muted-foreground pl-6 text-[13px]">{o.ajuda}</div>}
        </div>
      ))}
    </div>
  );
}
