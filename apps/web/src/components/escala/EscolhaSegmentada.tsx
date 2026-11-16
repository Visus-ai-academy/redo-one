import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

import { cn } from '../../lib/cn';

type EscolhaSegmentadaProps<V extends string> = {
  opcoes: readonly { valor: V; rotulo: string }[];
  valor: V;
  onMudar: (valor: V) => void;
  'aria-label': string;
  className?: string;
};

/**
 * Uma escolha entre poucas opções sempre à vista (ex.: Semana | Mês | Por médico), sobre o
 * ToggleGroup do Base UI: a marcada fica com o fundo do acento suave. Sempre há uma marcada.
 */
export function EscolhaSegmentada<V extends string>({
  opcoes,
  valor,
  onMudar,
  'aria-label': ariaLabel,
  className,
}: EscolhaSegmentadaProps<V>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[valor]}
      onValueChange={(valores) => {
        const novo = valores[0] as V | undefined;
        if (novo && novo !== valor) onMudar(novo);
      }}
      className={cn('border-input bg-card inline-flex h-9 rounded-md border p-0.5', className)}
    >
      {opcoes.map((opcao) => (
        <Toggle
          key={opcao.valor}
          value={opcao.valor}
          className={cn(
            'text-muted-foreground hover:text-foreground rounded-[4px] px-3 whitespace-nowrap',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
            'data-[pressed]:bg-accent data-[pressed]:text-foreground data-[pressed]:font-medium',
          )}
        >
          {opcao.rotulo}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
