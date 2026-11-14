import { Fieldset } from '@base-ui/react/fieldset';
import { Switch } from '@base-ui/react/switch';
import { useId, useState } from 'react';
import type { TelaCatalogoDto } from '../../gen/types/TelaCatalogoDto';
import { cn } from '../../lib/cn';
import { CampoBusca } from '../busca/CampoBusca';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import {
  agruparPorArea,
  alternarAcao,
  alternarTela,
  buscarNoCatalogo,
  podeConceder,
} from './permissoes-papel';

export type EditorPermissoesProps = {
  catalogo: TelaCatalogoDto[];
  marcadas: ReadonlySet<string>;
  onChange: (marcadas: Set<string>) => void;
  /** Quem está editando: só concede o que tem. */
  acesso: { acessoTotal: boolean; permissoes: readonly string[] };
  /** Papel do sistema ou sem papeis.editar. */
  somenteLeitura?: boolean;
};

/** Permissões de um papel por área › tela › ação; o interruptor da tela é o `ver`. */
export function EditorPermissoes({
  catalogo,
  marcadas,
  onChange,
  acesso,
  somenteLeitura = false,
}: EditorPermissoesProps) {
  const [termo, setTermo] = useState('');
  const grupos = agruparPorArea(buscarNoCatalogo(catalogo, termo));

  return (
    <div className="flex flex-col gap-4">
      <CampoBusca
        rotulo="Buscar tela ou ação"
        placeholder="Buscar tela ou ação"
        valor={termo}
        onMudar={setTermo}
        className="max-w-[320px]"
      />

      {grupos.length === 0 && (
        <p className="text-muted-foreground">Nenhuma tela ou ação com “{termo.trim()}”.</p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.area} className="flex flex-col gap-2">
          <h3 className="text-subtle-foreground text-xs font-medium">{grupo.area}</h3>
          <div className="rounded-md border">
            {grupo.telas.map((tela, indice) => (
              <Tela
                key={tela.tela}
                tela={tela}
                marcadas={marcadas}
                onChange={onChange}
                acesso={acesso}
                somenteLeitura={somenteLeitura}
                primeira={indice === 0}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tela({
  tela,
  marcadas,
  onChange,
  acesso,
  somenteLeitura,
  primeira,
}: {
  tela: TelaCatalogoDto;
  marcadas: ReadonlySet<string>;
  onChange: (marcadas: Set<string>) => void;
  acesso: EditorPermissoesProps['acesso'];
  somenteLeitura: boolean;
  primeira: boolean;
}) {
  const rotuloId = useId();
  const ver = `${tela.tela}.ver`;
  const ligada = marcadas.has(ver);
  const marcadasDaTela = tela.acoes.filter((acao) => marcadas.has(acao.chave)).length;

  return (
    <Fieldset.Root
      aria-labelledby={rotuloId}
      className={cn('m-0 min-w-0 p-0', !primeira && 'border-t')}
    >
      <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
        <span className="flex min-w-0 flex-col">
          <span id={rotuloId} className="font-medium">
            {tela.rotulo}
          </span>
          <span className="text-muted-foreground text-[13px] tabular-nums">
            {marcadasDaTela} de {tela.acoes.length}
          </span>
        </span>
        <Switch.Root
          checked={ligada}
          onCheckedChange={() => onChange(alternarTela(marcadas, tela))}
          disabled={somenteLeitura || !podeConceder(acesso, ver)}
          aria-labelledby={rotuloId}
          className="bg-input focus-visible:outline-ring data-[checked]:bg-primary relative flex h-5 w-9 flex-none rounded-full p-0.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 motion-reduce:transition-none"
        >
          <Switch.Thumb className="bg-card size-4 rounded-full shadow-sm transition-transform duration-150 data-[checked]:translate-x-4 motion-reduce:transition-none" />
        </Switch.Root>
      </div>

      {ligada && (
        <div className="bg-background flex flex-col gap-1 border-t px-3 py-2">
          {tela.acoes.map((acao) => {
            const concedivel = podeConceder(acesso, acao.chave);
            return (
              // biome-ignore lint/a11y/noLabelWithoutControl: o Checkbox do Base UI renderiza o input dentro do label.
              <label
                key={acao.chave}
                className={cn(
                  'flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1',
                  (somenteLeitura || !concedivel) && 'cursor-not-allowed',
                )}
              >
                <CaixaDeSelecao
                  checked={marcadas.has(acao.chave)}
                  onCheckedChange={() => onChange(alternarAcao(marcadas, tela, acao.chave))}
                  disabled={somenteLeitura || !concedivel}
                />
                <span>{acao.rotulo}</span>
                {acao.sensivel && <Etiqueta tom="atencao">Sensível</Etiqueta>}
                <code className="text-subtle-foreground font-mono text-xs">{acao.chave}</code>
                {!concedivel && !somenteLeitura && (
                  <span className="text-subtle-foreground text-[13px]">
                    Você não tem esta permissão
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </Fieldset.Root>
  );
}
