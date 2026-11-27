import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

import { cn } from '../../lib/cn';

type EscolhaSegmentadaProps<V extends string> = {
  opcoes: readonly { valor: V; rotulo: string }[];
  /** `''` quando nada foi escolhido ainda (campo obrigatório sem valor padrão). */
  valor: V | '';
  onMudar: (valor: V) => void;
  'aria-label'?: string;
  /** No formulário, o id do título do campo. */
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
  onBlur?: () => void;
  /** Desabilita a escolha inteira (ex.: enquanto salva). */
  disabled?: boolean;
  className?: string;
};

/**
 * Uma escolha entre poucas opções sempre à vista (ex.: Semana | Mês | Por médico), sobre o
 * ToggleGroup do Base UI: a marcada fica com o fundo do acento suave. Clicar na marcada não a
 * desmarca. Setas do teclado andam entre as opções. No formulário, o `SegmentadaField`.
 */
export function EscolhaSegmentada<V extends string>({
  opcoes,
  valor,
  onMudar,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-invalid': ariaInvalid,
  onBlur,
  disabled,
  className,
}: EscolhaSegmentadaProps<V>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-invalid={ariaInvalid || undefined}
      onBlur={onBlur}
      disabled={disabled}
      value={valor ? [valor] : []}
      onValueChange={(valores) => {
        const novo = valores[0] as V | undefined;
        if (novo && novo !== valor) onMudar(novo);
      }}
      className={cn(
        'border-input bg-card inline-flex h-9 max-w-full rounded-md border p-0.5',
        'aria-[invalid]:border-destructive',
        className,
      )}
    >
      {opcoes.map((opcao) => (
        <Toggle
          key={opcao.valor}
          value={opcao.valor}
          className={cn(
            'text-muted-foreground hover:text-foreground rounded-[4px] px-3 whitespace-nowrap',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
            'data-[pressed]:bg-accent data-[pressed]:text-foreground data-[pressed]:font-medium',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
          )}
        >
          {opcao.rotulo}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
