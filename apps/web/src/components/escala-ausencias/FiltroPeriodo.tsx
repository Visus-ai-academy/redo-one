import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { Popover } from '@base-ui/react/popover';
import { useId, useRef, useState } from 'react';

import { buttonClassName } from '../button/button-class';
import { controlClassName } from '../form/control-class';
import { Select } from '../select/Select';
import {
  ATALHOS_PERIODO,
  type AtalhoPeriodo,
  atalhoDoPeriodo,
  periodoDoAtalho,
  rotuloDoIntervalo,
} from './ausencias';

type Periodo = { de: string | undefined; ate: string | undefined };

/**
 * Período da lista de ausências numa peça só: atalhos (hoje, próximos 7/30/90 dias) e
 * "Personalizado…", que abre De e Até num popover ancorado no seletor. Com datas escolhidas, o
 * seletor mostra o intervalo ("05/12 a 12/12"). Sem nada, vale o padrão da API (desde 30 dias atrás).
 */
export function FiltroPeriodo({
  de,
  ate,
  hoje,
  onMudar,
  className,
}: {
  de?: string;
  ate?: string;
  /** Hoje em Brasília, "AAAA-MM-DD". */
  hoje: string;
  onMudar: (periodo: Periodo) => void;
  className?: string;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const atalho = atalhoDoPeriodo(de, ate, hoje);
  // O intervalo escolhido vira uma opção própria; "Personalizado…" fica livre para reabrir.
  const valor = atalho === 'personalizado' ? 'intervalo' : atalho;

  return (
    <div ref={ancora} className={className}>
      <Select
        aria-label="Período"
        value={valor}
        onValueChange={(escolha) => {
          if (escolha === 'personalizado') return setAberto(true);
          if (escolha === 'intervalo') return;
          onMudar(
            escolha
              ? periodoDoAtalho(escolha as AtalhoPeriodo, hoje)
              : { de: undefined, ate: undefined },
          );
        }}
        opcoes={[
          { valor: '', rotulo: 'Desde 30 dias atrás' },
          ...ATALHOS_PERIODO.map((a) => ({ valor: a.valor, rotulo: a.rotulo })),
          ...(valor === 'intervalo'
            ? [{ valor: 'intervalo', rotulo: rotuloDoIntervalo(de, ate, hoje) }]
            : []),
          { valor: 'personalizado', rotulo: 'Personalizado…' },
        ]}
      />
      <Popover.Root open={aberto} onOpenChange={setAberto}>
        <Popover.Portal>
          <Popover.Positioner
            anchor={ancora}
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50 outline-none"
          >
            <Popover.Popup className="bg-popover text-popover-foreground w-[min(320px,calc(100vw-32px))] origin-(--transform-origin) rounded-lg border p-4 shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
              <Popover.Title className="mb-3 font-semibold">Período personalizado</Popover.Title>
              {aberto && (
                <Intervalo
                  de={de}
                  ate={ate}
                  onAplicar={(periodo) => {
                    setAberto(false);
                    onMudar(periodo);
                  }}
                />
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** De e Até em rascunho: só valem ao aplicar. */
function Intervalo({
  de,
  ate,
  onAplicar,
}: {
  de?: string;
  ate?: string;
  onAplicar: (periodo: Periodo) => void;
}) {
  const deId = useId();
  const ateId = useId();
  const erroId = useId();
  const [inicio, setInicio] = useState(de ?? '');
  const [fim, setFim] = useState(ate ?? '');
  const [erro, setErro] = useState(false);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (inicio && fim && fim < inicio) return setErro(true);
        onAplicar({ de: inicio || undefined, ate: fim || undefined });
      }}
    >
      <div className="flex gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <label htmlFor={deId} className="font-medium">
            De
          </label>
          <Input
            id={deId}
            type="date"
            value={inicio}
            onValueChange={(v) => {
              setInicio(v);
              setErro(false);
            }}
            className={controlClassName('app', 'min-w-0')}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <label htmlFor={ateId} className="font-medium">
            Até
          </label>
          <Input
            id={ateId}
            type="date"
            value={fim}
            aria-invalid={erro || undefined}
            aria-describedby={erro ? erroId : undefined}
            onValueChange={(v) => {
              setFim(v);
              setErro(false);
            }}
            className={controlClassName('app', 'aria-invalid:border-destructive min-w-0')}
          />
        </span>
      </div>
      {erro && (
        <p id={erroId} className="text-destructive text-[13px]">
          O fim não pode ser antes do início.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          onClick={() => onAplicar({ de: undefined, ate: undefined })}
          className={buttonClassName({ variant: 'secondary' })}
        >
          Limpar
        </Button>
        <Button type="submit" className={buttonClassName()}>
          Aplicar
        </Button>
      </div>
    </form>
  );
}
