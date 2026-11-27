import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

import { cn } from '../../lib/cn';

const VAZIA = '__vazia__';
const deDentro = (v: string) => (v === '' ? VAZIA : v);
const deFora = (v: string) => (v === VAZIA ? '' : v);

type EscolhaSegmentadaProps<V extends string> = {
  opcoes: readonly { valor: V; rotulo: string }[];
  /** `''` quando nada foi escolhido ainda; ou a opção de valor `''`, se houver ("Não informado"). */
  valor: V | '';
  onMudar: (valor: V) => void;
  'aria-label'?: string;
  /** No formulário, o id do título do campo. */
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
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
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
  onBlur,
  disabled,
  className,
}: EscolhaSegmentadaProps<V>) {
  // Uma opção pode valer `''` (ex.: "Não informado"); o ToggleGroup precisa de um valor não vazio.
  const temVazia = opcoes.some((o) => o.valor === '');
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid || undefined}
      onBlur={onBlur}
      disabled={disabled}
      value={valor || temVazia ? [deDentro(valor)] : []}
      onValueChange={(valores) => {
        const escolhido = valores[0];
        if (escolhido === undefined) return;
        const novo = deFora(escolhido) as V;
        if (novo !== valor) onMudar(novo);
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
          value={deDentro(opcao.valor)}
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
