import { Button } from '@base-ui/react/button';
import { Collapsible } from '@base-ui/react/collapsible';
import { CaretDown, CaretRight, Plus } from '@phosphor-icons/react';
import { type ReactNode, useId, useState } from 'react';

import type { ExcecaoRecebimentoDto } from '../../gen/types/ExcecaoRecebimentoDto';
import type { ExcecaoRecebimentoEdicaoDto } from '../../gen/types/ExcecaoRecebimentoEdicaoDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { type ExcluirPainel, RodapePainel } from '../catalogo/rodape-painel';
import { opcoesDeFrentes } from '../escala/opcoes-frentes';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { DateField } from '../form/DateField';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado } from '../painel/fechamento';
import { Painel } from '../painel/Painel';
import { PainelLateral } from '../painel/PainelLateral';
import {
  diaAnterior,
  diaCurto,
  esquemaExcecao,
  excecaoParaApi,
  periodoExcecao,
  recorteExcecao,
  separarPorSituacao,
  TODAS,
  valoresDaExcecao,
} from './excecoes-recebimento';
import { OPCOES_RECEBIMENTO, rotuloRecebimento } from './recebimento';

type Item = { id: string; nome: string };
type Frente = { especialidadeId: string | null; modalidadeId: string | null; rotulo: string };

type Props = {
  excecoes: readonly ExcecaoRecebimentoDto[];
  turnos: readonly Item[];
  prioridades: readonly Item[];
  frentes: readonly Frente[];
  /** Hoje em Brasília, "AAAA-MM-DD". */
  hoje: string;
  podeEditar: boolean;
  onCriar: (dados: ExcecaoRecebimentoEdicaoDto) => Promise<void>;
  onEditar: (id: string, dados: ExcecaoRecebimentoEdicaoDto) => Promise<void>;
  onEncerrar: (id: string) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
};

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const chaveFrente = (f: Frente) =>
  f.especialidadeId ? `E|${f.especialidadeId}` : `M|${f.modalidadeId}`;

/** "Lista: segue o SLA". */
function tituloExcecao(e: ExcecaoRecebimentoDto, nome: (id: string) => string) {
  return `${nome(e.turnoId)}: ${minuscula(rotuloRecebimento(e.regra))}`;
}

function PainelExcecao({
  excecao,
  hoje,
  podeEditar,
  turnos,
  prioridades,
  frentes,
  nome,
  onSalvar,
  onEncerrar,
  onExcluir,
  onFechar,
}: {
  excecao?: ExcecaoRecebimentoDto;
  hoje: string;
  podeEditar: boolean;
  turnos: readonly Item[];
  prioridades: readonly Item[];
  frentes: readonly Frente[];
  nome: (id: string) => string;
  onSalvar: (dados: ExcecaoRecebimentoEdicaoDto) => Promise<void>;
  onEncerrar: () => Promise<void>;
  onExcluir: () => Promise<void>;
  onFechar: () => void;
}) {
  const [erro, setErro] = useState<string>();
  const iniciais = valoresDaExcecao(excecao, hoje);
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaExcecao },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar(excecaoParaApi(value));
      } catch (falha) {
        setErro(mensagemDaApi(falha, 'Não foi possível salvar a exceção.'));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const titulo = excecao ? tituloExcecao(excecao, nome) : 'Nova exceção';

  if (excecao && (!podeEditar || excecao.situacao === 'encerrada')) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          {excecao.situacao === 'encerrada' && (
            <Alerta tom="info">A exceção encerrada fica no histórico e não muda.</Alerta>
          )}
          <CampoSomenteLeitura label="Turno" value={nome(excecao.turnoId)} />
          <CampoSomenteLeitura label="Regra" value={rotuloRecebimento(excecao.regra)} />
          <CampoSomenteLeitura label="Vale para" value={recorteExcecao(excecao, nome)} />
          <CampoSomenteLeitura label="Período" value={periodoExcecao(excecao)} />
        </div>
      </PainelLateral>
    );
  }

  // A vigente que começou antes de hoje mantém o primeiro dia (o que já passou é histórico).
  const comecou = excecao !== undefined && excecao.de < hoje;
  const tirar = (falhou: string, acao: () => Promise<void>) => async () => {
    setErro(undefined);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, falhou));
    }
  };
  let acaoDestrutiva: ExcluirPainel | undefined;
  if (excecao?.podeExcluir) {
    acaoDestrutiva = {
      acao: 'Excluir exceção',
      titulo: 'Excluir a exceção?',
      consequencia: 'Ela ainda não valeu em nenhum dia passado. A grade volta a valer no período.',
      onConfirmar: tirar('Não foi possível excluir a exceção.', onExcluir),
    };
  } else if (excecao && comecou) {
    acaoDestrutiva = {
      acao: 'Encerrar exceção',
      titulo: 'Encerrar a exceção?',
      consequencia: `Ela vale até ontem (${diaCurto(diaAnterior(hoje))}) e fica no histórico; a partir de hoje volta a valer a grade.`,
      onConfirmar: tirar('Não foi possível encerrar a exceção.', onEncerrar),
    };
  }

  const opcoesFrente = [
    { valor: TODAS, rotulo: 'Todas as frentes' },
    // Especialidades, depois modalidades, cada grupo com o subtítulo.
    ...opcoesDeFrentes(
      frentes.map((f) => ({
        id: chaveFrente(f),
        rotulo: f.rotulo,
        cor: null,
        tipo: f.especialidadeId ? ('especialidade' as const) : ('modalidade' as const),
      })),
    ).map(({ valor, rotulo, grupo }) => ({ valor, rotulo, grupo })),
  ];
  const opcoesPrioridade = [
    { valor: TODAS, rotulo: 'Todas as prioridades' },
    ...prioridades.map((p) => ({ valor: p.id, rotulo: p.nome })),
  ];

  return (
    <PainelLateral titulo={titulo} onFechar={onFechar} alterado={alterado}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="turnoId">
          {(field) => (
            <field.SelectField
              label="Turno"
              placeholder="Escolha o turno"
              opcoes={turnos.map((t) => ({ valor: t.id, rotulo: t.nome }))}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="regra">
          {(field) => (
            <field.OpcoesField
              label="Regra"
              opcoes={OPCOES_RECEBIMENTO}
              description="No período, vale esta regra no lugar da grade geral e da grade da frente. O ajuste do dia do médico continua valendo por cima."
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(s) => s.values.regra}>
          {(regra) =>
            regra === 'prazo_minimo' && (
              <form.AppField name="horas">
                {(field) => (
                  <field.NumberField
                    label="Prazo mínimo, em horas"
                    placeholder="Ex.: 24"
                    description="O turno só recebe o exame com mais que isso até o prazo."
                    min={1}
                    max={720}
                    required
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.AppField name="frente">
          {(field) => (
            <field.SelectField
              label="Frente"
              placeholder="Todas as frentes"
              opcoes={opcoesFrente}
              description="Só a especialidade ou a modalidade do período do médico; todas, se não escolher."
            />
          )}
        </form.AppField>
        <form.AppField name="prioridadeOperacaoId">
          {(field) => (
            <field.SelectField
              label="Prioridade da operação"
              placeholder="Todas as prioridades"
              opcoes={opcoesPrioridade}
            />
          )}
        </form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          {comecou ? (
            <CampoSomenteLeitura
              label="Primeiro dia"
              value={diaCurto(excecao.de)}
              description="Já começou: não muda."
            />
          ) : (
            <form.AppField name="de">
              {() => <DateField label="Primeiro dia" min={hoje} required />}
            </form.AppField>
          )}
          <form.Subscribe selector={(s) => s.values.de}>
            {(de) => (
              <form.AppField name="ate">
                {() => (
                  <DateField
                    label="Último dia"
                    min={comecou ? diaAnterior(hoje) : de > hoje ? de : hoje}
                    description="Inclusive. Depois dele, a grade volta sozinha."
                    required
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
        </div>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar exceção"
            editando={Boolean(excecao)}
            excluir={acaoDestrutiva}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}

function ListaExcecoes({
  rotulo,
  itens,
  nome,
  porId,
  onAbrir,
}: {
  rotulo: string;
  itens: readonly ExcecaoRecebimentoDto[];
  nome: (id: string) => string;
  porId: ReadonlyMap<string, ExcecaoRecebimentoDto>;
  onAbrir: (id: string) => void;
}) {
  return (
    <ul aria-label={rotulo} className="divide-y">
      {itens.map((e) => {
        // No empate (mesma especificidade), vale a criada por último.
        const perde = e.empatesIds.some((id) => {
          const outra = porId.get(id);
          return outra !== undefined && outra.criadoEm > e.criadoEm;
        });
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onAbrir(e.id)}
              className="hover:bg-muted/60 flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 text-left"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{tituloExcecao(e, nome)}</span>
                <span className="text-muted-foreground text-[13px]">{recorteExcecao(e, nome)}</span>
                {e.situacao !== 'encerrada' && e.empatesIds.length > 0 && (
                  <span className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Etiqueta tom="atencao">{perde ? 'Não vale' : 'Vale'}</Etiqueta>
                    <span className="text-muted-foreground">
                      Empata com outra exceção: vale a criada por último.
                    </span>
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-[13px] tabular-nums">
                {periodoExcecao(e)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-t first:border-t-0">
      <h3 className="text-subtle-foreground px-4 pt-3 text-[13px] font-medium">{titulo}</h3>
      {children}
    </div>
  );
}

/**
 * Configurações › Distribuição: exceções temporárias da grade de recebimento (ex.: "toda a Lista
 * segue o SLA até 22/12"). Vigentes e futuras à vista; encerradas recolhidas, no histórico.
 */
export function ExcecoesRecebimento({
  excecoes,
  turnos,
  prioridades,
  frentes,
  hoje,
  podeEditar,
  onCriar,
  onEditar,
  onEncerrar,
  onExcluir,
}: Props) {
  // null = fechado; 'nova' = criando; senão, o id aberto.
  const [aberto, setAberto] = useState<string | null>(null);
  const [verEncerradas, setVerEncerradas] = useState(false);
  const idEncerradas = useId();
  const atual = excecoes.find((e) => e.id === aberto);
  const { vigentes, futuras, encerradas } = separarPorSituacao(excecoes);
  const paginaEncerradas = usePaginaLocal(encerradas, 10);
  const porId = new Map(excecoes.map((e) => [e.id, e]));
  const nomes = new Map<string, string>([
    ...turnos.map((t) => [t.id, t.nome] as const),
    ...prioridades.map((p) => [p.id, p.nome] as const),
    ...frentes.map((f) => [f.especialidadeId ?? f.modalidadeId ?? '', f.rotulo] as const),
  ]);
  const nome = (id: string) => nomes.get(id) ?? 'Cadastro removido';

  return (
    <Painel
      titulo="Exceções temporárias da grade"
      descricao="Mudam o que um turno recebe por um período (ex.: toda a Lista segue o SLA até 22/12). No período, valem no lugar da grade; depois, a grade volta sozinha. Entre exceções que se cruzam, vale a mais específica."
      conteudoNaBorda
      acao={
        podeEditar && (
          <Button
            type="button"
            onClick={() => setAberto('nova')}
            className={buttonClassName({ variant: 'secondary' })}
          >
            <Plus size={16} aria-hidden />
            Nova exceção
          </Button>
        )
      }
    >
      {vigentes.length === 0 && futuras.length === 0 && (
        <p className="text-muted-foreground p-4">Nenhuma exceção: vale a grade de recebimento.</p>
      )}
      {vigentes.length > 0 && (
        <Grupo titulo="Vigentes">
          <ListaExcecoes
            rotulo="Vigentes"
            itens={vigentes}
            nome={nome}
            porId={porId}
            onAbrir={setAberto}
          />
        </Grupo>
      )}
      {futuras.length > 0 && (
        <Grupo titulo="Futuras">
          <ListaExcecoes
            rotulo="Futuras"
            itens={futuras}
            nome={nome}
            porId={porId}
            onAbrir={setAberto}
          />
        </Grupo>
      )}
      {encerradas.length > 0 && (
        <Collapsible.Root open={verEncerradas} onOpenChange={setVerEncerradas} className="border-t">
          <Collapsible.Trigger
            aria-controls={idEncerradas}
            className="text-muted-foreground hover:bg-muted/60 focus-visible:outline-ring flex h-10 w-full items-center gap-2 px-4 text-left text-[13px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {verEncerradas ? (
              <CaretDown size={14} aria-hidden />
            ) : (
              <CaretRight size={14} aria-hidden />
            )}
            Encerradas ({encerradas.length})
          </Collapsible.Trigger>
          <Collapsible.Panel id={idEncerradas}>
            <ListaExcecoes
              rotulo="Encerradas"
              itens={paginaEncerradas.itensDaPagina}
              nome={nome}
              porId={porId}
              onAbrir={setAberto}
            />
            {paginaEncerradas.precisaPaginar && (
              <div className="border-t px-4 py-2">
                <Paginacao
                  pagina={paginaEncerradas.pagina}
                  porPagina={paginaEncerradas.porPagina}
                  total={paginaEncerradas.total}
                  onIrPara={paginaEncerradas.irPara}
                />
              </div>
            )}
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
      {aberto && (
        <PainelExcecao
          key={aberto}
          excecao={atual}
          hoje={hoje}
          podeEditar={podeEditar}
          turnos={turnos}
          prioridades={prioridades}
          frentes={frentes}
          nome={nome}
          onFechar={() => setAberto(null)}
          onSalvar={async (dados) => {
            if (atual) await onEditar(atual.id, dados);
            else await onCriar(dados);
            setAberto(null);
          }}
          onEncerrar={async () => {
            if (!atual) return;
            await onEncerrar(atual.id);
            setAberto(null);
          }}
          onExcluir={async () => {
            if (!atual) return;
            await onExcluir(atual.id);
            setAberto(null);
          }}
        />
      )}
    </Painel>
  );
}
