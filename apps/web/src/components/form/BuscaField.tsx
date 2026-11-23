import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { useFieldContext } from './context';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

type BuscaFieldProps = {
  label: string;
  placeholder: string;
  chave: string;
  buscar: (termo: string) => Promise<OpcaoBusca[]>;
  required?: boolean;
  description?: string;
  className?: string;
};

/** Escolha numa lista grande, buscando enquanto digita; mesmo rótulo, ajuda e erro dos outros campos. */
export function BuscaField({
  label,
  placeholder,
  chave,
  buscar,
  required = false,
  description,
  className,
}: BuscaFieldProps) {
  const field = useFieldContext<OpcaoBusca | null>();
  const { erros: errors, invalido: invalid, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <BuscaSelecao
        chave={chave}
        buscar={buscar}
        valor={field.state.value}
        onMudar={(opcao) => {
          field.handleChange(opcao);
          aoSair();
        }}
        placeholder={placeholder}
      />
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}
