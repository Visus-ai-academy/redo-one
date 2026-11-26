import { Collapsible } from '@base-ui/react/collapsible';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import { numero } from '../../lib/formato';
import { buttonClassName } from '../button/button-class';

const classeDaLista = 'flex flex-wrap gap-1.5';
const classeDoNome = 'bg-muted rounded-md px-2 py-0.5 text-[13px] leading-5 break-all';

/**
 * Nomes citados (ex.: as tabelas de preço que usam um item), em etiquetas que quebram linha, com o
 * total no rótulo. Passando de `visiveis`, mostra os primeiros e recolhe o resto atrás de
 * "Mostrar todos os N" (Collapsible do Base UI).
 */
export function ListaDeNomes({
  rotulo,
  nomes,
  visiveis = 12,
}: {
  rotulo: string;
  nomes: readonly string[];
  visiveis?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const idRotulo = useId();
  // Sobra de 1 ou 2 não vale o botão: mostra todos.
  const recolhe = nomes.length > visiveis + 2;
  const primeiros = recolhe ? nomes.slice(0, visiveis) : nomes;
  const resto = recolhe ? nomes.slice(visiveis) : [];

  return (
    <section aria-labelledby={idRotulo} className="flex flex-col gap-2">
      <h3 className="text-muted-foreground flex items-baseline gap-2 text-[13px] font-medium">
        <span id={idRotulo}>{rotulo}</span>
        <span className="text-subtle-foreground tabular-nums">{numero(nomes.length)}</span>
      </h3>
      <Collapsible.Root open={aberto} onOpenChange={setAberto} className="flex flex-col gap-1.5">
        <ul aria-labelledby={idRotulo} className={classeDaLista}>
          {primeiros.map((nome) => (
            <li key={nome} className={classeDoNome}>
              {nome}
            </li>
          ))}
        </ul>
        {recolhe && (
          <>
            <Collapsible.Panel
              render={<ul aria-label={`${rotulo} (continuação)`} />}
              className={classeDaLista}
            >
              {resto.map((nome) => (
                <li key={nome} className={classeDoNome}>
                  {nome}
                </li>
              ))}
            </Collapsible.Panel>
            <div>
              <Collapsible.Trigger
                className={buttonClassName({ variant: 'ghost', className: '-ml-2 gap-1.5 px-2' })}
              >
                {aberto ? (
                  <>
                    <CaretUp size={16} aria-hidden />
                    Mostrar menos
                  </>
                ) : (
                  <>
                    <CaretDown size={16} aria-hidden />
                    Mostrar todos os {numero(nomes.length)}
                  </>
                )}
              </Collapsible.Trigger>
            </div>
          </>
        )}
      </Collapsible.Root>
    </section>
  );
}
