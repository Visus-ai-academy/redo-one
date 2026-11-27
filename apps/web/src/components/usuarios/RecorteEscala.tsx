import { Button } from '@base-ui/react/button';
import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import { useEscopoApiControllerDefinir } from '../../gen/hooks/useEscopoApiControllerDefinir';
import {
  escopoApiControllerObterQueryKey,
  useEscopoApiControllerObter,
} from '../../gen/hooks/useEscopoApiControllerObter';
import { useFrentesControllerListar } from '../../gen/hooks/useFrentesControllerListar';
import { useTurnosControllerListar } from '../../gen/hooks/useTurnosControllerListar';
import type { EscopoDto } from '../../gen/types/EscopoDto';
import type { ReferenciaEscopoDto } from '../../gen/types/ReferenciaEscopoDto';
import { Alerta } from '../alerta/Alerta';
import { BotaoComCarregamento } from '../button/BotaoComCarregamento';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { opcoesDeFrentes } from '../escala/opcoes-frentes';
import { Interruptor } from '../interruptor/Interruptor';
import { Skeleton } from '../skeleton/Skeleton';
import { useAvisos } from '../toast/use-avisos';

export type RecorteEscalaProps = {
  usuarioId: string;
  /** É quem está logado: ninguém edita o próprio recorte (a API também recusa). */
  proprio: boolean;
  /** usuarios.escopo-escala.editar. */
  podeEditar: boolean;
  /** escala.ver: sem ela não dá para listar os turnos e as frentes para marcar. */
  podeVerCadastros: boolean;
  /** Turnos ou frentes marcados e não salvos (o painel pergunta antes de fechar). */
  onAlterado?: (alterado: boolean) => void;
};

const AJUDA =
  'A gestora vê e edita só as alocações e ausências desses turnos ou dessas frentes. Para ela ver tudo, ligue "Vê toda a escala".';

// A API devolve no máximo 100 por página; turnos e frentes ativos são bem menos que isso.
const CADASTROS_ATIVOS = { query: { ativo: true, porPagina: 100 } };

/** Seção "Recorte da escala" do painel do usuário: lê e, com permissão, troca o recorte. */
export function RecorteEscala({
  usuarioId,
  proprio,
  podeEditar,
  podeVerCadastros,
  onAlterado,
}: RecorteEscalaProps) {
  const consulta = useEscopoApiControllerObter({ path: { usuarioId } });
  const tituloId = useId();
  const escopo = consulta.data;
  const editavel = podeEditar && podeVerCadastros && !proprio;

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-2">
      <h3 id={tituloId} className="font-medium">
        Recorte da escala
      </h3>
      {consulta.isError ? (
        <Alerta tom="erro">
          <span className="flex flex-col items-start gap-2">
            Não foi possível carregar o recorte da escala.
            <Button
              type="button"
              onClick={() => void consulta.refetch()}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Tentar de novo
            </Button>
          </span>
        </Alerta>
      ) : !escopo ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-64" />
        </div>
      ) : editavel ? (
        <EditorRecorte usuarioId={usuarioId} escopo={escopo} onAlterado={onAlterado} />
      ) : (
        <>
          <LeituraRecorte escopo={escopo} />
          {proprio && podeEditar && (
            <p className="text-muted-foreground text-[13px]">
              Você não pode alterar o próprio recorte.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function LeituraRecorte({ escopo }: { escopo: EscopoDto }) {
  if (escopo.veTodaEscala) {
    return <p className="text-muted-foreground">Vê toda a escala.</p>;
  }
  if (escopo.turnos.length === 0 && escopo.frentes.length === 0) {
    return <p className="text-muted-foreground">Sem turno nem frente: não vê a escala.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ListaDeNomes rotulo="Turnos" itens={escopo.turnos} />
      <ListaDeNomes rotulo="Frentes" itens={escopo.frentes} />
    </div>
  );
}

function ListaDeNomes({ rotulo, itens }: { rotulo: string; itens: ReferenciaEscopoDto[] }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-subtle-foreground text-xs">
        {rotulo}
      </span>
      {itens.length === 0 ? (
        <span className="text-muted-foreground text-[13px]">Nenhum</span>
      ) : (
        <ul aria-labelledby={id} className="flex flex-wrap gap-1">
          {itens.map((item) => (
            <li
              key={item.id}
              className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {item.nome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Opções ativas e, no fim, as do recorte que deixaram de estar ativas (para não sumirem caladas). */
type OpcaoDeMarcar = { id: string; nome: string; grupo?: string };

function opcoesCom(ativas: OpcaoDeMarcar[], doRecorte: ReferenciaEscopoDto[]): OpcaoDeMarcar[] {
  const ids = new Set(ativas.map((a) => a.id));
  return [...ativas, ...doRecorte.filter((r) => !ids.has(r.id))];
}

const mesmoConjunto = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

function EditorRecorte({
  usuarioId,
  escopo,
  onAlterado,
}: {
  usuarioId: string;
  escopo: EscopoDto;
  onAlterado?: (alterado: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const ajudaId = useId();
  const turnos = useTurnosControllerListar(CADASTROS_ATIVOS);
  const frentes = useFrentesControllerListar(CADASTROS_ATIVOS);
  const definir = useEscopoApiControllerDefinir();
  const [veTodaEscala, setVeTodaEscala] = useState(escopo.veTodaEscala);
  const [turnoIds, setTurnoIds] = useState(escopo.turnoIds);
  const [frenteIds, setFrenteIds] = useState(escopo.frenteIds);
  const [falhou, setFalhou] = useState(false);
  const [semNada, setSemNada] = useState(false);
  const erroId = useId();

  const mudou =
    veTodaEscala !== escopo.veTodaEscala ||
    (!veTodaEscala &&
      (!mesmoConjunto(turnoIds, escopo.turnoIds) || !mesmoConjunto(frenteIds, escopo.frenteIds)));
  useEffect(() => {
    onAlterado?.(mudou);
    return () => onAlterado?.(false);
  }, [mudou, onAlterado]);

  const salvar = async () => {
    setFalhou(false);
    // Vazio nunca é "toda a escala": sem o "todos", ao menos um turno ou uma frente.
    if (!veTodaEscala && turnoIds.length === 0 && frenteIds.length === 0) {
      setSemNada(true);
      return;
    }
    setSemNada(false);
    const body = veTodaEscala
      ? { veTodaEscala, turnoIds: [], frenteIds: [] }
      : { veTodaEscala, turnoIds, frenteIds };
    try {
      await definir.mutateAsync({ path: { usuarioId }, body });
    } catch {
      setFalhou(true);
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: escopoApiControllerObterQueryKey({ path: { usuarioId } }),
    });
    avisos.sucesso('Recorte da escala salvo.');
  };

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        void salvar();
      }}
      aria-describedby={ajudaId}
      className="flex flex-col gap-3"
    >
      <p id={ajudaId} className="text-muted-foreground text-[13px]">
        {AJUDA}
      </p>
      {falhou && (
        <Alerta tom="erro">
          Não foi possível salvar o recorte da escala. Confira sua conexão e tente de novo.
        </Alerta>
      )}
      {(turnos.isError || frentes.isError) && (
        <Alerta tom="erro">
          Não foi possível carregar os turnos e as frentes. Feche e abra o painel de novo.
        </Alerta>
      )}
      <Field.Root>
        <Field.Label className="flex items-center gap-3 font-medium">
          <Interruptor
            checked={veTodaEscala}
            onCheckedChange={(marcada) => {
              setVeTodaEscala(marcada);
              setSemNada(false);
            }}
          />
          Vê toda a escala
        </Field.Label>
      </Field.Root>
      {!veTodaEscala && (
        <>
          <GrupoDeMarcar
            legenda="Turnos"
            carregando={!turnos.data}
            opcoes={opcoesCom(
              (turnos.data?.itens ?? []).map((t) => ({ id: t.id, nome: t.nome })),
              escopo.turnos,
            )}
            valor={turnoIds}
            onMudar={setTurnoIds}
          />
          <GrupoDeMarcar
            legenda="Frentes"
            carregando={!frentes.data}
            opcoes={opcoesCom(
              // Especialidades, depois modalidades, cada grupo com o subtítulo.
              opcoesDeFrentes(
                (frentes.data?.itens ?? []).map((f) => ({
                  id: f.id,
                  rotulo: f.rotulo,
                  cor: null,
                  tipo: f.tipo,
                })),
              ).map((o) => ({ id: o.valor, nome: o.rotulo, grupo: o.grupo })),
              escopo.frentes,
            )}
            valor={frenteIds}
            onMudar={setFrenteIds}
          />
          {semNada && (
            <p id={erroId} role="alert" className="text-destructive text-[13px]">
              Marque ao menos um turno ou uma frente (ou "Vê toda a escala").
            </p>
          )}
        </>
      )}
      <div className="flex justify-end">
        <BotaoComCarregamento
          type="submit"
          disabled={!mudou}
          carregando={definir.isPending}
          rotuloCarregando="Salvando…"
          variant="secondary"
        >
          Salvar recorte
        </BotaoComCarregamento>
      </div>
    </form>
  );
}

function GrupoDeMarcar({
  legenda,
  carregando,
  opcoes,
  valor,
  onMudar,
}: {
  legenda: string;
  carregando: boolean;
  opcoes: OpcaoDeMarcar[];
  valor: string[];
  onMudar: (ids: string[]) => void;
}) {
  // Opções com `grupo` (frentes) ficam sob o subtítulo do grupo, na ordem recebida.
  const grupos = opcoes.reduce<{ grupo?: string; itens: OpcaoDeMarcar[] }[]>((acc, o) => {
    const ultimo = acc.at(-1);
    if (ultimo && ultimo.grupo === o.grupo) ultimo.itens.push(o);
    else acc.push({ grupo: o.grupo, itens: [o] });
    return acc;
  }, []);
  return (
    <Field.Root>
      <Fieldset.Root
        render={<CheckboxGroup value={valor} onValueChange={onMudar} />}
        className="flex flex-col gap-2"
      >
        <Fieldset.Legend className="text-subtle-foreground text-xs">{legenda}</Fieldset.Legend>
        {carregando ? (
          <div aria-busy="true" className="grid grid-cols-2 gap-2">
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
          </div>
        ) : opcoes.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">Nenhum cadastrado.</p>
        ) : (
          grupos.map(({ grupo, itens }) => (
            <div key={grupo ?? 'sem-grupo'} className="flex flex-col gap-2">
              {grupo && (
                <span className="text-muted-foreground text-[13px] font-medium">{grupo}</span>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {itens.map((opcao) => (
                  <Field.Item key={opcao.id}>
                    <Field.Label className="flex min-w-0 items-center gap-2">
                      <CaixaDeSelecao value={opcao.id} />
                      <span className="truncate">{opcao.nome}</span>
                    </Field.Label>
                  </Field.Item>
                ))}
              </div>
            </div>
          ))
        )}
      </Fieldset.Root>
    </Field.Root>
  );
}
