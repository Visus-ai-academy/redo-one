import { Combobox } from '@base-ui/react/combobox';
import { Field } from '@base-ui/react/field';
import { X } from '@phosphor-icons/react';
import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import {
  adicionarEtiquetas,
  avisoDeRepetidas,
  type ComparacaoEtiqueta,
  iguaisExato,
  separarEtiquetas,
} from './etiquetas';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const classeCaixa = cn(
  'border-input bg-card text-foreground flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-md border px-1.5 py-1',
  'focus-within:outline-ring focus-within:outline-2 focus-within:outline-offset-2',
  'has-[[aria-invalid=true]]:border-destructive',
);
const classeEtiqueta =
  'bg-muted text-foreground flex h-6 max-w-full min-w-0 items-center gap-1 rounded-sm pr-0.5 pl-2 text-[13px] outline-none focus-visible:outline-ring focus-visible:outline-2 data-[highlighted]:bg-accent';
const classeRemover =
  'text-muted-foreground hover:bg-background hover:text-foreground flex size-5 flex-none items-center justify-center rounded-sm';
const classePopup =
  'bg-popover text-popover-foreground origin-(--transform-origin) max-h-[min(var(--available-height),320px)] w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-y-auto overscroll-contain rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none';
const classeItem =
  'data-[highlighted]:bg-muted flex min-h-9 items-center rounded-md px-2 py-1.5 outline-none';

type EtiquetasFieldProps = {
  label: string;
  /** Exemplo com o campo vazio (`Ex.: CRD_APOIO`). */
  placeholder: string;
  required?: boolean;
  description?: string;
  /** Valores conhecidos, sugeridos enquanto digita; valor livre continua valendo. */
  sugestoes?: readonly string[];
  /** Quando duas etiquetas são a mesma. Padrão: iguais depois de aparar. */
  iguais?: ComparacaoEtiqueta;
  className?: string;
};

/**
 * Lista de valores curtos sem ordem, como etiquetas (Combobox múltiplo do Base UI com Chips):
 * Enter ou vírgula cria, × remove, Backspace no campo vazio apaga a última, colar uma lista cria
 * todas; repetida não entra (com aviso). O valor do campo é a lista de textos.
 */
export function EtiquetasField({
  label,
  placeholder,
  required = false,
  description,
  sugestoes = [],
  iguais = iguaisExato,
  className,
}: EtiquetasFieldProps) {
  const field = useFieldContext<string[]>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const valores = field.state.value ?? [];
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [aberta, setAberta] = useState(false);
  const destacada = useRef<string | undefined>(undefined);

  // Sem as que já estão (escolher de novo tiraria a etiqueta).
  const disponiveis = [...new Set(sugestoes)].filter((s) => !valores.some((v) => iguais(v, s)));
  const temSugestoes = disponiveis.length > 0;

  const adicionar = (novas: string[]) => {
    const { valores: proximos, repetidas } = adicionarEtiquetas(valores, novas, iguais);
    setAviso(avisoDeRepetidas(repetidas));
    if (proximos.length !== valores.length) field.handleChange(proximos);
    setTexto('');
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLInputElement>) => {
    const criar = evento.key === ',' || (evento.key === 'Enter' && !destacada.current);
    if (!criar || evento.nativeEvent.isComposing) return;
    // Vírgula nunca entra no texto; Enter com texto cria em vez de enviar o formulário.
    if (evento.key === ',' || texto.trim()) {
      evento.preventDefault();
      if (texto.trim()) adicionar([texto]);
    }
  };

  const aoColar = (evento: ClipboardEvent<HTMLInputElement>) => {
    const colado = evento.clipboardData.getData('text');
    if (!/[,\r\n]/.test(colado)) return;
    evento.preventDefault();
    const el = evento.currentTarget;
    const inicio = el.selectionStart ?? el.value.length;
    const fim = el.selectionEnd ?? el.value.length;
    adicionar(separarEtiquetas(el.value.slice(0, inicio) + colado + el.value.slice(fim)));
  };

  // O que ficou digitado entra ao sair (salvar sem Enter não perde o valor).
  const aoSairDoCampo = () => {
    if (texto.trim()) adicionar([texto]);
    aoSair();
  };

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <Combobox.Root
        multiple
        items={disponiveis}
        value={valores}
        onValueChange={(novos) => {
          setAviso('');
          field.handleChange([...(novos as string[])]);
        }}
        inputValue={texto}
        onInputValueChange={(novo) => {
          setTexto(novo);
          if (novo) setAviso('');
        }}
        open={temSugestoes && aberta}
        onOpenChange={setAberta}
        onItemHighlighted={(item) => {
          destacada.current = item as string | undefined;
        }}
        filter={(item: string, busca) => semAcento(item).includes(semAcento(busca.trim()))}
        required={required}
      >
        <Combobox.InputGroup className={classeCaixa}>
          <Combobox.Chips className="contents">
            {valores.map((valor) => (
              <Combobox.Chip key={valor} className={classeEtiqueta}>
                <span className="truncate">{valor}</span>
                <Combobox.ChipRemove aria-label={`Remover ${valor}`} className={classeRemover}>
                  <X size={12} aria-hidden />
                </Combobox.ChipRemove>
              </Combobox.Chip>
            ))}
            <Combobox.Input
              placeholder={valores.length ? undefined : placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalido || undefined}
              onKeyDown={aoTeclar}
              onPaste={aoColar}
              onBlur={aoSairDoCampo}
              className="placeholder:text-subtle-foreground h-7 min-w-24 flex-1 bg-transparent px-1.5 text-base outline-none sm:text-sm"
            />
          </Combobox.Chips>
        </Combobox.InputGroup>
        {temSugestoes && (
          <Combobox.Portal>
            <Combobox.Positioner sideOffset={4} align="start" className="z-50 outline-none">
              <Combobox.Popup className={classePopup}>
                <Combobox.Empty className="text-muted-foreground px-2 py-1.5 text-[13px] empty:hidden">
                  {texto.trim() && `Nenhuma sugestão. Enter adiciona “${texto.trim()}”.`}
                </Combobox.Empty>
                <Combobox.List>
                  {(item: string) => (
                    <Combobox.Item key={item} value={item} className={classeItem}>
                      {item}
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        )}
        {/* Fica sempre montado para o leitor de tela anunciar; vazio, não ocupa espaço. */}
        <Combobox.Status className="text-warning text-[13px] empty:-mt-2">{aviso}</Combobox.Status>
      </Combobox.Root>
      <Field.Description className="text-muted-foreground text-[13px]">
        {description}
        <span className="sr-only">
          {' '}
          Enter ou vírgula adiciona; Backspace com o campo vazio apaga a última.
        </span>
      </Field.Description>
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
