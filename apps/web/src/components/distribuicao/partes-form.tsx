// Peças dos formulários da distribuição (regras da frente, configuração global, ajuste do dia).
import { Button } from '@base-ui/react/button';
import { ArrowDown, ArrowUp, Trash } from '@phosphor-icons/react';
import { type ReactNode, useId } from 'react';

import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';

/** Um grupo do formulário com título curto e a ajuda em linguagem da operação. */
export function Secao({
  titulo,
  ajuda,
  children,
  className,
}: {
  titulo: string;
  ajuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-1">
        <h3 id={tituloId} className="text-base font-semibold">
          {titulo}
        </h3>
        {ajuda && <p className="text-muted-foreground text-[13px]">{ajuda}</p>}
      </div>
      {children}
    </section>
  );
}

/** Erro que vale para a lista inteira (ex.: "os percentuais precisam somar 100"). */
export function ErroDaLista({ erros }: { erros: unknown[] }) {
  const textos = erros
    .map((e) => (typeof e === 'string' ? e : (e as { message?: string } | undefined)?.message))
    .filter(Boolean);
  if (textos.length === 0) return null;
  return (
    <p role="alert" className="text-destructive text-[13px]">
      {textos.join(' ')}
    </p>
  );
}

const botaoIcone = buttonClassName({
  variant: 'ghost',
  className: 'text-muted-foreground size-9 flex-none px-0',
});

/** Subir, descer e remover um item de uma lista ordenada do formulário. */
export function AcoesDaLinha({
  nome,
  indice,
  total,
  ordenavel = false,
  onMover,
  onRemover,
}: {
  /** Como o item se chama para o leitor de tela ("horário 2"). */
  nome: string;
  indice: number;
  total: number;
  ordenavel?: boolean;
  onMover?: (de: number, para: number) => void;
  onRemover: () => void;
}) {
  return (
    <span className="ml-auto flex flex-none">
      {ordenavel && (
        <>
          <Button
            type="button"
            aria-label={`Subir ${nome}`}
            disabled={indice === 0}
            onClick={() => onMover?.(indice, indice - 1)}
            className={botaoIcone}
          >
            <ArrowUp size={16} aria-hidden />
          </Button>
          <Button
            type="button"
            aria-label={`Descer ${nome}`}
            disabled={indice === total - 1}
            onClick={() => onMover?.(indice, indice + 1)}
            className={botaoIcone}
          >
            <ArrowDown size={16} aria-hidden />
          </Button>
        </>
      )}
      <Button
        type="button"
        aria-label={`Remover ${nome}`}
        onClick={onRemover}
        className={botaoIcone}
      >
        <Trash size={16} aria-hidden />
      </Button>
    </span>
  );
}

/** Uma linha da lista no formulário: borda leve, título curto e as ações. */
export function ItemDaLista({
  titulo,
  acoes,
  children,
}: {
  titulo: string;
  acoes: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium">{titulo}</span>
        {acoes}
      </div>
      {children}
    </li>
  );
}

/** Linhas "rótulo: valor" do resumo só leitura, em grupos com título. */
export function ResumoEmGrupos({
  grupos,
}: {
  grupos: { titulo: string; linhas: { rotulo: string; valor: string }[] }[];
}) {
  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => (
        <Secao key={g.titulo} titulo={g.titulo}>
          <dl className="flex flex-col gap-2">
            {g.linhas.map((l) => (
              <div key={l.rotulo} className="flex flex-col gap-0.5">
                <dt className="text-subtle-foreground text-[13px]">{l.rotulo}</dt>
                <dd className="break-words">{l.valor}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      ))}
    </div>
  );
}
