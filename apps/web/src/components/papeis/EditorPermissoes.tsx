import { Button } from '@base-ui/react/button';
import { Collapsible } from '@base-ui/react/collapsible';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import { CaretDown, CaretRight, Copy, Eye, ShieldWarning } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import { cn } from '../../lib/cn';
import { Alerta } from '../alerta/Alerta';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { Dica } from '../dica/Dica';
import { Etiqueta } from '../etiqueta/Etiqueta';
import {
  type AcaoPadrao,
  agruparPorArea,
  alternarAcao,
  alternarColuna,
  alternarLinha,
  buscarTelas,
  type CatalogoMatriz,
  COLUNAS,
  celula,
  contarEspeciais,
  copiarDePapel,
  estadoDaColuna,
  resumoDaArea,
  soLeitura,
  type TelaMatriz,
} from './matriz-permissoes';
import { podeConceder } from './permissoes-papel';

type PapelOrigem = { acessoTotal: boolean; permissoes: readonly string[] };

export type EditorPermissoesProps = {
  catalogo: CatalogoMatriz;
  marcadas: ReadonlySet<string>;
  onChange: (marcadas: Set<string>) => void;
  /** Quem está editando: só concede o que tem. */
  acesso: { acessoTotal: boolean; permissoes: readonly string[] };
  /** Papel do sistema ou sem permissão de salvar. */
  somenteLeitura?: boolean;
  /** Papéis de onde copiar (sem o aberto). */
  papeisParaCopiar?: { id: string; nome: string }[];
  obterPapel?: (id: string) => Promise<PapelOrigem>;
};

const NOME_COLUNA: Record<AcaoPadrao, string> = {
  ver: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
};

const DICA_SENSIVEL =
  'Ação sensível: dá acesso a dado pessoal, financeiro ou a algo difícil de desfazer.';

// Mesma grade em todas as tabelas da matriz, para as colunas das áreas ficarem alinhadas.
function Colunas() {
  return (
    <colgroup>
      <col />
      {COLUNAS.map((coluna) => (
        <col key={coluna} className="w-[72px]" />
      ))}
      <col className="w-[104px]" />
    </colgroup>
  );
}

const celulaNome = 'bg-card sticky left-0 z-10 px-3 text-left';

/**
 * Matriz de permissões de um papel: linhas = telas (por área, que abre e fecha), colunas = ver,
 * criar, editar, excluir e as especiais da tela (num popover).
 */
export function EditorPermissoes({
  catalogo,
  marcadas,
  onChange,
  acesso,
  somenteLeitura = false,
  papeisParaCopiar = [],
  obterPapel,
}: EditorPermissoesProps) {
  const [termo, setTermo] = useState('');
  const [fechadas, setFechadas] = useState<ReadonlySet<string>>(() => new Set());
  const [erroCopia, setErroCopia] = useState(false);
  const pode = (chave: string) => podeConceder(acesso, chave);
  const buscando = termo.trim() !== '';
  const grupos = agruparPorArea(buscarTelas(catalogo, termo));

  const copiar = async (id: string) => {
    if (!obterPapel) return;
    setErroCopia(false);
    try {
      onChange(copiarDePapel(await obterPapel(id), catalogo, pode));
    } catch {
      setErroCopia(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca
          rotulo="Buscar tela"
          placeholder="Buscar tela"
          valor={termo}
          onMudar={setTermo}
          className="min-w-0 flex-[1_1_220px] sm:max-w-[320px]"
        />
        {!somenteLeitura && (
          <span className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onChange(soLeitura(marcadas, catalogo, pode))}
              className={buttonClassName({ variant: 'secondary' })}
            >
              <Eye size={16} aria-hidden />
              Só leitura
            </Button>
            {obterPapel && papeisParaCopiar.length > 0 && (
              <CopiarDePapel papeis={papeisParaCopiar} onEscolher={copiar} />
            )}
          </span>
        )}
      </div>

      {erroCopia && (
        <Alerta tom="erro">Não foi possível copiar o papel agora. Tente de novo.</Alerta>
      )}

      {grupos.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma tela com “{termo.trim()}”.</p>
      ) : (
        // No celular a matriz rola na horizontal dentro do cartão, com o nome da tela fixo. O
        // `isolate` prende o z-index do nome dentro da matriz, para ele não passar por cima do
        // rodapé fixo do cartão; o `relative` faz a rolagem cortar também os textos `sr-only`
        // (absolutos), que senão alargam a página no celular.
        <div className="relative isolate overflow-x-auto rounded-md border">
          <div className="min-w-[600px]">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <Colunas />
              <thead>
                <tr className="text-subtle-foreground h-9 border-b font-medium">
                  <th scope="col" className={cn(celulaNome, 'font-medium')}>
                    Tela
                  </th>
                  {COLUNAS.map((coluna) => (
                    <th key={coluna} scope="col" className="text-center font-medium">
                      {NOME_COLUNA[coluna]}
                    </th>
                  ))}
                  <th scope="col" className="text-center font-medium">
                    Especiais
                  </th>
                </tr>
              </thead>
            </table>
            {grupos.map((grupo) => (
              <Area
                key={grupo.area}
                area={grupo.area}
                telas={grupo.telas}
                aberta={buscando || !fechadas.has(grupo.area)}
                onAbrir={(aberta) => {
                  const novas = new Set(fechadas);
                  if (aberta) novas.delete(grupo.area);
                  else novas.add(grupo.area);
                  setFechadas(novas);
                }}
                catalogo={catalogo}
                marcadas={marcadas}
                onChange={onChange}
                pode={pode}
                somenteLeitura={somenteLeitura}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Comum = {
  catalogo: CatalogoMatriz;
  marcadas: ReadonlySet<string>;
  onChange: (marcadas: Set<string>) => void;
  pode: (chave: string) => boolean;
  somenteLeitura: boolean;
};

function Area({
  area,
  telas,
  aberta,
  onAbrir,
  ...comum
}: Comum & {
  area: string;
  telas: TelaMatriz[];
  aberta: boolean;
  onAbrir: (aberta: boolean) => void;
}) {
  const { catalogo, marcadas, onChange, pode, somenteLeitura } = comum;
  const Caret = aberta ? CaretDown : CaretRight;

  return (
    <Collapsible.Root open={aberta} onOpenChange={onAbrir} className="border-t first:border-t-0">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <Colunas />
        <tbody>
          <tr className="bg-muted/50 h-10">
            <th scope="rowgroup" className={cn(celulaNome, 'bg-muted px-0')}>
              <Collapsible.Trigger className="focus-visible:outline-ring flex h-10 w-full items-center gap-2 px-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2">
                <Caret size={14} aria-hidden className="text-muted-foreground flex-none" />
                <span className="text-sm font-semibold">{area}</span>
                {!aberta && (
                  <span className="text-muted-foreground truncate font-normal tabular-nums">
                    {resumoDaArea(marcadas, telas)}
                  </span>
                )}
              </Collapsible.Trigger>
            </th>
            {COLUNAS.map((coluna) => {
              const estado = estadoDaColuna(marcadas, telas, coluna);
              const concedivel = telas.some((t) => {
                const acao = celula(t, coluna);
                return acao && pode(acao.chave);
              });
              return (
                <td key={coluna} className="text-center">
                  {estado !== 'indisponivel' && (
                    <span className="inline-flex align-middle">
                      <CaixaDeSelecao
                        aria-label={`${NOME_COLUNA[coluna]} em ${area}`}
                        checked={estado === 'todas'}
                        indeterminate={estado === 'algumas'}
                        onCheckedChange={() =>
                          onChange(alternarColuna(marcadas, catalogo, telas, coluna, pode))
                        }
                        disabled={somenteLeitura || !concedivel}
                      />
                    </span>
                  )}
                </td>
              );
            })}
            <td />
          </tr>
        </tbody>
      </table>
      <Collapsible.Panel>
        <table className="w-full table-fixed border-collapse text-[13px]">
          <Colunas />
          <tbody>
            {telas.map((tela) => (
              <Linha key={tela.tela} tela={tela} {...comum} />
            ))}
          </tbody>
        </table>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function Linha({ tela, ...comum }: Comum & { tela: TelaMatriz }) {
  const { catalogo, marcadas, onChange, pode, somenteLeitura } = comum;
  const nomeId = useId();
  const linhaConcedivel = tela.padrao.some((a) => pode(a.chave));

  return (
    <tr aria-labelledby={nomeId} className="h-10 border-t text-sm">
      <th scope="row" className={cn(celulaNome, 'font-normal')}>
        <Button
          id={nomeId}
          type="button"
          onClick={() => onChange(alternarLinha(marcadas, catalogo, tela, pode))}
          disabled={somenteLeitura || !linhaConcedivel}
          className="focus-visible:outline-ring w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:cursor-default data-[disabled]:no-underline"
        >
          {tela.rotulo}
        </Button>
      </th>
      {COLUNAS.map((coluna) => {
        const acao = celula(tela, coluna);
        if (!acao) {
          return (
            <td key={coluna} className="text-subtle-foreground text-center">
              <span aria-hidden>—</span>
              <span className="sr-only">Não se aplica</span>
            </td>
          );
        }
        // O rótulo próprio da ação ("Enviar planilha", "Convidar") e o aviso de sensível ficam na
        // dica; a célula mostra só a caixa.
        const rotuloProprio = acao.rotulo !== NOME_COLUNA[coluna] ? acao.rotulo : undefined;
        const dica = [rotuloProprio, acao.sensivel && DICA_SENSIVEL].filter(Boolean).join('. ');
        const nome = `${tela.rotulo}: ${acao.rotulo}${acao.sensivel ? ' (sensível)' : ''}`;
        const caixa = (
          <CaixaDeSelecao
            aria-label={nome}
            checked={marcadas.has(acao.chave)}
            onCheckedChange={() => onChange(alternarAcao(marcadas, catalogo, tela, acao.chave))}
            disabled={somenteLeitura || !pode(acao.chave)}
          />
        );
        return (
          <td key={coluna} className="text-center">
            <span className="relative inline-flex items-center align-middle">
              {dica ? (
                <Dica rotulo={dica} lado="top">
                  {caixa}
                </Dica>
              ) : (
                caixa
              )}
              {acao.sensivel && (
                <ShieldWarning
                  size={12}
                  aria-hidden
                  className="text-warning absolute -top-1.5 -right-3.5"
                />
              )}
            </span>
          </td>
        );
      })}
      <td className="text-center">
        {tela.especiais.length === 0 ? (
          <span className="text-subtle-foreground">
            <span aria-hidden>—</span>
            <span className="sr-only">Não se aplica</span>
          </span>
        ) : (
          <Especiais tela={tela} {...comum} />
        )}
      </td>
    </tr>
  );
}

function Especiais({
  tela,
  catalogo,
  marcadas,
  onChange,
  pode,
  somenteLeitura,
}: Comum & { tela: TelaMatriz }) {
  const { marcadas: quantas, total } = contarEspeciais(marcadas, tela);
  const temSensivel = tela.especiais.some((a) => a.sensivel);

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Especiais de ${tela.rotulo}: ${quantas} de ${total}`}
        className={buttonClassName({
          variant: 'ghost',
          className: 'h-7 gap-1 px-2 text-[13px] font-normal tabular-nums',
        })}
      >
        {quantas} de {total}
        {temSensivel && <ShieldWarning size={12} aria-hidden className="text-warning" />}
        <CaretDown size={12} aria-hidden className="text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50 outline-none">
          <Popover.Popup className="bg-popover text-popover-foreground w-[min(320px,calc(100vw-32px))] origin-(--transform-origin) rounded-lg border p-3 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Popover.Title className="mb-2 font-semibold">Especiais: {tela.rotulo}</Popover.Title>
            <ul className="flex flex-col gap-2">
              {tela.especiais.map((acao) => {
                const concedivel = pode(acao.chave);
                return (
                  <li key={acao.chave}>
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: o Checkbox do Base UI renderiza o input dentro do label. */}
                    <label
                      className={cn(
                        'flex items-start gap-2',
                        (somenteLeitura || !concedivel) && 'cursor-not-allowed',
                      )}
                    >
                      <CaixaDeSelecao
                        className="mt-0.5"
                        checked={marcadas.has(acao.chave)}
                        onCheckedChange={() =>
                          onChange(alternarAcao(marcadas, catalogo, tela, acao.chave))
                        }
                        disabled={somenteLeitura || !concedivel}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{acao.rotulo}</span>
                          {acao.sensivel && (
                            <Etiqueta tom="atencao" icone={ShieldWarning}>
                              Sensível
                            </Etiqueta>
                          )}
                        </span>
                        {acao.descricao && (
                          <span className="text-muted-foreground text-[13px]">
                            {acao.descricao}
                          </span>
                        )}
                        {!concedivel && !somenteLeitura && (
                          <span className="text-subtle-foreground text-[13px]">
                            Você não tem esta permissão
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CopiarDePapel({
  papeis,
  onEscolher,
}: {
  papeis: { id: string; nome: string }[];
  onEscolher: (id: string) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className={buttonClassName({ variant: 'secondary' })}>
        <Copy size={16} aria-hidden />
        Copiar de outro papel
        <CaretDown size={14} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={4} className="z-50 outline-none">
          <Menu.Popup className="bg-popover text-popover-foreground max-h-[min(320px,var(--available-height))] min-w-[220px] origin-(--transform-origin) overflow-y-auto rounded-lg border py-1 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            {papeis.map((papel) => (
              <Menu.Item
                key={papel.id}
                onClick={() => onEscolher(papel.id)}
                className="data-[highlighted]:bg-muted flex h-9 items-center px-3 outline-none"
              >
                {papel.nome}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
