import { Button } from '@base-ui/react/button';
import { Collapsible } from '@base-ui/react/collapsible';
import { CaretRight, DotsSixVertical, Plus } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { z } from 'zod';

import { tipificacaoClienteControllerPrevia } from '../../gen/clients/tipificacaoClienteControllerPrevia';
import { tipificacaoClienteControllerRemoverVersao } from '../../gen/clients/tipificacaoClienteControllerRemoverVersao';
import { tipificacaoClienteControllerSalvar } from '../../gen/clients/tipificacaoClienteControllerSalvar';
import { tipificacaoControllerMedicos } from '../../gen/clients/tipificacaoControllerMedicos';
import { tipificacaoClienteControllerObterQueryOptions } from '../../gen/hooks/useTipificacaoClienteControllerObter';
import { tipificacaoControllerListarQueryOptions } from '../../gen/hooks/useTipificacaoControllerListar';
import { tipificacaoControllerOpcoesQueryOptions } from '../../gen/hooks/useTipificacaoControllerOpcoes';
import type { ConfiguracaoTipificacaoDto } from '../../gen/types/ConfiguracaoTipificacaoDto';
import type { LinhaPreviaTipificacaoDto } from '../../gen/types/LinhaPreviaTipificacaoDto';
import type { OpcoesTipificacaoDto } from '../../gen/types/OpcoesTipificacaoDto';
import type { TipificacaoClienteDto } from '../../gen/types/TipificacaoClienteDto';
import type { TipificacaoDto } from '../../gen/types/TipificacaoDto';
import type { VersaoConfiguracaoTipificacaoDto } from '../../gen/types/VersaoConfiguracaoTipificacaoDto';
import { cn } from '../../lib/cn';
import { numero, plural } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { AbaComErro } from '../distribuicao/estados';
import { AcoesDaLinha } from '../distribuicao/partes-form';
import { useAppForm } from '../form/form';
import { RequiredLegend } from '../form/RequiredLegend';
import { useArrastarParaOrdenar } from '../ordenar/use-arrastar-para-ordenar';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';
import { mesAno } from './competencias';
import { HistoricoVigencias } from './historico-vigencias';
import { opcoesAPartirDe } from './precos';
import {
  type ConfiguracaoForm,
  corpoDaConfiguracao,
  fraseDaLinha,
  type LinhaForm,
  novaVersaoEm,
  ROTULO_MODO,
  ROTULO_TIPO,
  valoresDaConfiguracao,
} from './tipificacao';

export type EditorTipificacaoProps = {
  clienteId: string;
  /** `faturamento.tipificacao.editar`; sem ela, só leitura. */
  podeEditar: boolean;
  /** Avisa quando há algo digitado e não salvo (o painel pergunta antes de fechar). */
  onAlterado?: (alterado: boolean) => void;
  /** Só para os testes: o resto da tela usa o mês atual que a API devolve. */
  agora?: Date;
};

const esquema = z.object({
  aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual a configuração vale.'),
  regraId: z.string(),
  subregraDemaisId: z.string(),
  linhas: z.array(
    z
      .object({
        chave: z.string(),
        tipo: z.enum(['modalidade', 'especialidade', 'prioridade']),
        valores: z.array(z.string()).min(1, 'Escolha pelo menos um valor.'),
        modoMedico: z.enum(['todos', 'apenas', 'exceto']),
        medicos: z.array(z.object({ valor: z.string(), rotulo: z.string() })),
        equipes: z.array(z.string()),
        subregraId: z.string().min(1, 'Escolha a sub-regra.'),
      })
      .superRefine((l, ctx) => {
        if (l.modoMedico !== 'todos' && !l.medicos.length && !l.equipes.length)
          ctx.addIssue({
            code: 'custom',
            path: ['medicos'],
            message: 'Escolha os médicos ou as equipes do filtro.',
          });
      }),
  ),
});

/** Tipificação do cliente na aba Faturamento: regra principal, linhas e "todos os demais". */
export function EditorTipificacao({ clienteId, podeEditar, onAlterado }: EditorTipificacaoProps) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const config = useQuery(tipificacaoClienteControllerObterQueryOptions({ path: { clienteId } }));
  const regras = useQuery(tipificacaoControllerListarQueryOptions());
  const opcoes = useQuery(tipificacaoControllerOpcoesQueryOptions());
  const falhou = config.isError || regras.isError || opcoes.isError;

  if (falhou)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void config.refetch();
          void regras.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar a tipificação do cliente agora.
      </AbaComErro>
    );
  if (!config.data || !regras.data || !opcoes.data) return <CamposCarregando quantidade={4} />;

  const { cliente, configuracao, doPrincipal, regraPadraoId, medicos, versoes, mesAtual } =
    config.data;
  const programada = versoes.find((v) => v.vigenciaDesde !== null && v.vigenciaDesde > mesAtual);
  const nomesMedicos = new Map(medicos.map((m) => [m.id, m.nome]));
  const nomeRegra = (id: string | null) => regras.data.regras.find((r) => r.id === id)?.nome;
  const padrao = nomeRegra(regraPadraoId) ?? 'a padrão';
  // O que vale quando a regra principal fica vazia.
  const herdada = cliente.unificadoEmId
    ? `Herda de ${cliente.principalNome}${doPrincipal?.regraId ? ` (${nomeRegra(doPrincipal.regraId)})` : ` (${padrao})`}`
    : `Padrão (${padrao})`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-[13px]">
        Diz se o laudo fatura. Vale a primeira linha que casar; o que nenhuma casar vai para "todos
        os demais" ou, sem ele, fica na regra principal sem sub-regra.
      </p>
      {cliente.unificadoEmId && (
        <Alerta tom="info" role="note">
          {configuracao
            ? `Esta unidade de ${cliente.principalNome} tem configuração própria: os laudos dela seguem a configuração abaixo, não a do principal.`
            : `Esta unidade de ${cliente.principalNome} não tem configuração própria: os laudos dela seguem a do principal. Para mudar só esta unidade, configure abaixo.`}
        </Alerta>
      )}
      {programada && (
        <Alerta tom="info" role="note">
          {`Há uma versão programada a partir de ${mesAno(programada.vigenciaDesde ?? '')} (veja o histórico). Escolha em "Vale a partir de" a competência que quer mudar: o formulário mostra a configuração que vale nela.`}
        </Alerta>
      )}
      {podeEditar ? (
        <FormTipificacao
          key={versoes.map((v) => `${v.id}:${v.vigenciaAte}`).join('|') || 'nova'}
          clienteId={clienteId}
          dados={config.data}
          nomesMedicos={nomesMedicos}
          tipificacao={regras.data}
          opcoes={opcoes.data}
          herdada={herdada}
          onAlterado={onAlterado}
        />
      ) : (
        <Leitura
          configuracao={configuracao}
          nomesMedicos={nomesMedicos}
          tipificacao={regras.data}
          opcoes={opcoes.data}
          herdada={herdada}
        />
      )}
      <HistoricoVigencias
        versoes={versoes}
        mesAtual={mesAtual}
        vazio="Nenhuma configuração própria até hoje."
        descrever={(v) => (
          <ResumoDaVersao
            versao={v}
            nomesMedicos={nomesMedicos}
            tipificacao={regras.data}
            opcoes={opcoes.data}
            herdada={herdada}
            semPropria={
              cliente.unificadoEmId
                ? `Sem configuração própria: segue a de ${cliente.principalNome}.`
                : `Sem configuração própria: vale a regra padrão (${padrao}).`
            }
          />
        )}
        onExcluir={
          podeEditar
            ? async (v) => {
                await tipificacaoClienteControllerRemoverVersao({
                  path: { clienteId, versaoId: v.id },
                }).unwrap();
                await queryClient.invalidateQueries({
                  queryKey: tipificacaoClienteControllerObterQueryOptions({ path: { clienteId } })
                    .queryKey,
                });
                avisos.sucesso(
                  `Versão de ${mesAno(v.vigenciaDesde ?? '')} excluída. Os laudos das competências abertas são reclassificados em seguida.`,
                );
              }
            : undefined
        }
      />
    </div>
  );
}

/** A versão no histórico: a regra principal, quantas linhas e o "todos os demais", com as frases. */
function ResumoDaVersao({
  versao,
  nomesMedicos,
  tipificacao,
  opcoes,
  herdada,
  semPropria,
}: Dados & { versao: VersaoConfiguracaoTipificacaoDto; semPropria: string }) {
  const c = versao.configuracao;
  const nomes = nomesDa(tipificacao, opcoes);
  if (!c.regraId && !c.subregraDemaisId && !c.linhas.length) return <span>{semPropria}</span>;
  const valores = valoresDaConfiguracao(c, nomesMedicos, () => crypto.randomUUID());
  const regra = tipificacao.regras.find((r) => r.id === c.regraId)?.nome ?? herdada;
  const demais = nomes.subregras.get(c.subregraDemaisId ?? '') ?? 'ficam na regra principal';
  return (
    <Collapsible.Root className="flex flex-col gap-1">
      <span>
        {`Regra principal ${regra}; ${plural(c.linhas.length, { um: 'linha', varios: 'linhas', nenhum: 'nenhuma linha' })}; todos os demais: ${demais}.`}
      </span>
      {c.linhas.length > 0 && (
        <>
          <Collapsible.Trigger className="text-primary focus-visible:outline-ring self-start rounded-sm text-[13px] underline underline-offset-2 focus-visible:outline-2">
            Ver as linhas
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5">
              {valores.linhas.map((l) => (
                <li key={l.chave}>{fraseDaLinha(l, nomes)}</li>
              ))}
            </ol>
          </Collapsible.Panel>
        </>
      )}
    </Collapsible.Root>
  );
}

type Dados = {
  tipificacao: TipificacaoDto;
  opcoes: OpcoesTipificacaoDto;
  nomesMedicos: ReadonlyMap<string, string>;
  herdada: string;
};

function nomesDa(tipificacao: TipificacaoDto, opcoes: OpcoesTipificacaoDto) {
  return {
    valores: new Map(
      [...opcoes.modalidades, ...opcoes.especialidades, ...opcoes.prioridades].map((o) => [
        o.id,
        o.nome,
      ]),
    ),
    subregras: new Map(tipificacao.subregras.map((s) => [s.id, s.nome])),
    equipes: new Map(opcoes.equipes.map((e) => [e.id, e.nome])),
  };
}

function Leitura({
  configuracao,
  nomesMedicos,
  tipificacao,
  opcoes,
  herdada,
}: Dados & { configuracao: ConfiguracaoTipificacaoDto | null }) {
  const valores = valoresDaConfiguracao(configuracao, nomesMedicos);
  const nomes = nomesDa(tipificacao, opcoes);
  const regra = tipificacao.regras.find((r) => r.id === valores.regraId)?.nome ?? herdada;
  const demais = nomes.subregras.get(valores.subregraDemaisId);
  return (
    <dl className="flex flex-col gap-3">
      <div>
        <dt className="font-medium">Regra principal</dt>
        <dd className="text-muted-foreground">{regra}</dd>
      </div>
      <div>
        <dt className="font-medium">Linhas</dt>
        <dd>
          {valores.linhas.length ? (
            <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5">
              {valores.linhas.map((l) => (
                <li key={l.chave}>{fraseDaLinha(l, nomes)}</li>
              ))}
            </ol>
          ) : (
            <span className="text-muted-foreground">Nenhuma linha.</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Todos os demais</dt>
        <dd className="text-muted-foreground">{demais ?? 'Ficam na regra principal'}</dd>
      </div>
    </dl>
  );
}

const linhaNova = (): LinhaForm => ({
  chave: crypto.randomUUID(),
  tipo: 'especialidade',
  valores: [],
  modoMedico: 'todos',
  medicos: [],
  equipes: [],
  subregraId: '',
});

function FormTipificacao({
  clienteId,
  dados,
  nomesMedicos,
  tipificacao,
  opcoes,
  herdada,
  onAlterado,
}: Dados & {
  clienteId: string;
  dados: TipificacaoClienteDto;
  onAlterado?: (alterado: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const [anuncio, setAnuncio] = useState('');
  // Linhas abertas para editar; as outras mostram só a frase. Linha com erro abre sozinha.
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const [previa, setPrevia] = useState<{ chave: string; linhas: LinhaPreviaTipificacaoDto[] }>();
  // O formulário parte da versão vigente na competência do "Vale a partir de" (a que a nova
  // versão substitui a partir dali). Trocar a competência para a de outra versão recarrega o
  // formulário com ela. As chaves das linhas nascem uma vez por versão carregada.
  const baseEm = (aPartirDe: string) => novaVersaoEm(dados.versoes, aPartirDe, dados.mesAtual).base;
  const valoresDaBase = (aPartirDe: string) => ({
    ...valoresDaConfiguracao(baseEm(aPartirDe)?.configuracao ?? null, nomesMedicos),
    aPartirDe,
  });
  const [iniciais, setIniciais] = useState(() => valoresDaBase(dados.aPartirDeSugerido));
  const [baseId, setBaseId] = useState(() => baseEm(dados.aPartirDeSugerido)?.id ?? null);
  const corpo = (v: ConfiguracaoForm & { aPartirDe: string }) => ({
    ...corpoDaConfiguracao(v),
    aPartirDe: v.aPartirDe,
  });
  const form = useAppForm({
    defaultValues: iniciais as ConfiguracaoForm & { aPartirDe: string },
    validators: { onSubmit: esquema },
    // Primeiro a prévia da configuração digitada; com ela à vista, salvar.
    onSubmit: ({ value }) => {
      const body = corpo(value);
      const chave = JSON.stringify(body);
      if (previa?.chave !== chave)
        return tentar(async () => {
          const linhas = await tipificacaoClienteControllerPrevia({
            path: { clienteId },
            body,
          }).unwrap();
          // Chegou depois de a pessoa mudar um campo: é a prévia de outra configuração.
          if (JSON.stringify(corpo(form.state.values)) !== chave) return;
          setPrevia({ chave, linhas });
        }, 'Não foi possível calcular a prévia agora. Confira sua conexão e tente de novo.');
      return tentar(async () => {
        await tipificacaoClienteControllerSalvar({ path: { clienteId }, body }).unwrap();
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: tipificacaoClienteControllerObterQueryOptions({ path: { clienteId } })
              .queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: tipificacaoControllerListarQueryOptions().queryKey,
          }),
        ]);
        const vazia = !body.regraId && !body.subregraDemaisId && !body.linhas.length;
        avisos.sucesso(
          `${vazia ? 'Configuração própria removida' : 'Tipificação salva'} a partir de ${mesAno(body.aPartirDe)}. Os laudos das competências abertas são reclassificados em seguida.`,
        );
      });
    },
  });
  const valores = useStore(form.store, (s) => s.values);
  const erros = useStore(form.store, (s) =>
    Object.entries(s.fieldMeta)
      .filter(([, meta]) => (meta?.errors?.length ?? 0) > 0)
      .map(([nome]) => nome)
      .join('|'),
  );
  const comErro = (i: number) => erros.split('|').some((n) => n.startsWith(`linhas[${i}]`));
  const alterado = JSON.stringify(valores) !== JSON.stringify(iniciais);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);
  useEffect(() => () => onAlterado?.(false), [onAlterado]);

  const nomes = nomesDa(tipificacao, opcoes);
  const ativas = <T extends { ativo: boolean; id: string }>(lista: T[], atual: string) =>
    lista.filter((x) => x.ativo || x.id === atual);
  const opcoesSub = (atual: string) =>
    ativas(tipificacao.subregras, atual).map((s) => ({
      valor: s.id,
      rotulo: `${s.nome}${s.fatura ? '' : ' (não fatura)'}`,
      cor: tipificacao.regras.find((r) => r.id === s.regraId)?.cor ?? null,
    }));
  const opcoesDoTipo = (tipo: LinhaForm['tipo']) =>
    (tipo === 'modalidade'
      ? opcoes.modalidades
      : tipo === 'especialidade'
        ? opcoes.especialidades
        : opcoes.prioridades
    ).map((o) => ({ valor: o.id, rotulo: o.nome, cor: o.cor }));

  const chaveAtual = JSON.stringify(corpo(valores));
  const competencias = opcoesAPartirDe(dados.aPartirDeMinimo, dados.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));
  const temAlgo = Boolean(valores.regraId || valores.subregraDemaisId || valores.linhas.length);
  const base = baseEm(valores.aPartirDe);
  const baseTemAlgo = Boolean(
    base &&
      (base.configuracao.regraId ||
        base.configuracao.subregraDemaisId ||
        base.configuracao.linhas.length),
  );
  const periodo = valores.aPartirDe
    ? novaVersaoEm(dados.versoes, valores.aPartirDe, dados.mesAtual).texto
    : null;
  const previaAtual = previa?.chave === chaveAtual ? previa.linhas : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField
        name="aPartirDe"
        listeners={{
          // Outra versão nessa competência: o formulário passa a mostrar a configuração dela.
          onChange: ({ value }) => {
            const nova = baseEm(value)?.id ?? null;
            if (nova === baseId) return;
            const valoresNovos = valoresDaBase(value);
            setBaseId(nova);
            setIniciais(valoresNovos);
            form.reset(valoresNovos);
          },
        }}
      >
        {(field) => (
          <field.SelectField
            label="Vale a partir de"
            required
            placeholder="Escolha a competência"
            opcoes={competencias}
            description="Escolha primeiro: abaixo vem a configuração que vale nessa competência, para mudar a partir dela. Só competências abertas ou futuras; as anteriores não mudam."
          />
        )}
      </form.AppField>
      {periodo && (
        <p aria-live="polite" className="bg-muted rounded-md px-3 py-2 text-[13px]">
          {periodo}
        </p>
      )}

      <form.AppField name="regraId">
        {(field) => (
          <field.SelectField
            label="Regra principal"
            placeholder={herdada}
            description="Do laudo que nenhuma linha casou e que fica sem sub-regra."
            opcoes={[
              { valor: '', rotulo: herdada },
              ...ativas(tipificacao.regras, valores.regraId).map((r) => ({
                valor: r.id,
                rotulo: r.nome,
                cor: r.cor,
              })),
            ]}
          />
        )}
      </form.AppField>

      <form.AppField name="linhas" mode="array">
        {(lista) => (
          <ListaDeLinhas
            linhas={lista.state.value}
            onMover={(de, para) => {
              lista.moveValue(de, para);
              setAnuncio(`Linha ${de + 1} movida para a posição ${para + 1}.`);
            }}
            onRemover={(i) => {
              lista.removeValue(i);
              setAnuncio(`Linha ${i + 1} removida.`);
            }}
            frase={(l) => fraseDaLinha(l, nomes)}
            abertas={abertas}
            onAbrir={(chave, aberta) =>
              setAbertas((a) => {
                const nova = new Set(a);
                if (aberta) nova.add(chave);
                else nova.delete(chave);
                return nova;
              })
            }
            comErro={comErro}
            renderizar={(l, i) => (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-3 *:min-w-0">
                  <form.AppField
                    name={`linhas[${i}].tipo`}
                    listeners={{
                      // Trocou o tipo: os valores de antes eram de outra lista.
                      onChange: () => form.setFieldValue(`linhas[${i}].valores`, []),
                    }}
                  >
                    {(field) => (
                      <field.SelectField
                        label="Se"
                        placeholder="Escolha"
                        required
                        opcoes={Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => ({
                          valor,
                          rotulo,
                        }))}
                        className="flex-[1_1_140px]"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name={`linhas[${i}].valores`}>
                    {(field) => (
                      <field.SelecaoMultiplaField
                        label="For"
                        placeholder="Escolha"
                        required
                        opcoes={opcoesDoTipo(l.tipo)}
                        className="flex-[2_1_200px]"
                      />
                    )}
                  </form.AppField>
                </div>
                <form.AppField name={`linhas[${i}].modoMedico`}>
                  {(field) => (
                    <field.SelectField
                      label="E o médico"
                      placeholder="Escolha"
                      required
                      opcoes={Object.entries(ROTULO_MODO).map(([valor, rotulo]) => ({
                        valor,
                        rotulo,
                      }))}
                    />
                  )}
                </form.AppField>
                {l.modoMedico !== 'todos' && (
                  <div className="flex flex-col gap-3 border-l-2 pl-3">
                    <form.AppField name={`linhas[${i}].medicos`}>
                      {(field) => (
                        <field.EscolhidosField
                          label="Médicos"
                          chave="tipificacao-medicos"
                          placeholder="Buscar médico pelo nome"
                          vazio="Nenhum médico escolhido."
                          buscar={async (termo) =>
                            (
                              await tipificacaoControllerMedicos({
                                query: { busca: termo },
                              }).unwrap()
                            ).map((m) => ({ valor: m.id, rotulo: m.nome }))
                          }
                        />
                      )}
                    </form.AppField>
                    <form.AppField name={`linhas[${i}].equipes`}>
                      {(field) => (
                        <field.SelecaoMultiplaField
                          label="Equipes"
                          placeholder="Nenhuma equipe"
                          description="Vale para os membros da equipe."
                          opcoes={opcoes.equipes.map((e) => ({
                            valor: e.id,
                            rotulo: e.nome,
                            cor: e.cor,
                          }))}
                        />
                      )}
                    </form.AppField>
                  </div>
                )}
                <form.AppField name={`linhas[${i}].subregraId`}>
                  {(field) => (
                    <field.SelectField
                      label="Então"
                      placeholder="Escolha a sub-regra"
                      required
                      opcoes={opcoesSub(l.subregraId)}
                    />
                  )}
                </form.AppField>
              </div>
            )}
          />
        )}
      </form.AppField>
      <form.AppField name="linhas" mode="array">
        {(lista) => (
          <Button
            type="button"
            className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
            onClick={() => {
              const nova = linhaNova();
              lista.pushValue(nova);
              setAbertas((a) => new Set(a).add(nova.chave));
              setAnuncio(`Linha ${lista.state.value.length} adicionada.`);
            }}
          >
            <Plus size={16} aria-hidden />
            Adicionar linha
          </Button>
        )}
      </form.AppField>
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      <form.AppField name="subregraDemaisId">
        {(field) => (
          <field.SelectField
            label="Todos os demais"
            placeholder="Ficam na regra principal"
            description="Fica sempre no fim: o laudo que nenhuma linha casou. Vazio, fica na regra principal sem sub-regra."
            opcoes={[
              { valor: '', rotulo: 'Ficam na regra principal' },
              ...opcoesSub(valores.subregraDemaisId),
            ]}
          />
        )}
      </form.AppField>

      {baseTemAlgo && (
        <Button
          type="button"
          disabled={!temAlgo}
          onClick={() => {
            form.setFieldValue('regraId', '');
            form.setFieldValue('subregraDemaisId', '');
            form.setFieldValue('linhas', []);
          }}
          className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
        >
          Remover configuração própria
        </Button>
      )}

      {previaAtual && (
        <TabelaPrevia
          linhas={previaAtual}
          tipificacao={tipificacao}
          aPartirDe={valores.aPartirDe}
        />
      )}
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <form.AppForm>
        <RequiredLegend />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            disabled={!alterado}
            onClick={() => {
              form.reset();
              setPrevia(undefined);
            }}
            className={buttonClassName({ variant: 'ghost' })}
          >
            Descartar alterações
          </Button>
          {previaAtual ? (
            <form.SubmitButton pendingLabel="Salvando…">Salvar tipificação</form.SubmitButton>
          ) : (
            <form.SubmitButton pendingLabel="Calculando…">Ver prévia</form.SubmitButton>
          )}
        </div>
      </form.AppForm>
    </form>
  );
}

function ListaDeLinhas({
  linhas,
  onMover,
  onRemover,
  frase,
  abertas,
  onAbrir,
  comErro,
  renderizar,
}: {
  linhas: LinhaForm[];
  onMover: (de: number, para: number) => void;
  onRemover: (i: number) => void;
  frase: (l: LinhaForm) => string;
  abertas: ReadonlySet<string>;
  onAbrir: (chave: string, aberta: boolean) => void;
  comErro: (i: number) => boolean;
  renderizar: (l: LinhaForm, i: number) => ReactNode;
}) {
  const { item, alca } = useArrastarParaOrdenar(onMover);
  if (!linhas.length)
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center">
        Nenhuma linha: todos os laudos vão para "todos os demais" ou ficam na regra principal.
      </p>
    );
  return (
    <ol aria-label="Linhas da tipificação" className="flex flex-col divide-y rounded-md border">
      {linhas.map((l, i) => {
        const aberta = abertas.has(l.chave) || comErro(i);
        return (
          <li
            key={l.chave}
            {...item(i)}
            className="data-[alvo]:bg-accent data-[arrastando]:opacity-50"
          >
            <Collapsible.Root
              open={aberta}
              onOpenChange={(abrir) => onAbrir(l.chave, abrir)}
              className="flex flex-col gap-3 p-3"
            >
              <div className="flex items-start gap-1">
                <span
                  {...alca(i)}
                  title="Arraste para mudar a ordem"
                  aria-hidden
                  className="text-muted-foreground -ml-1 flex h-9 w-6 flex-none cursor-grab items-center justify-center rounded active:cursor-grabbing"
                >
                  <DotsSixVertical size={18} />
                </span>
                <Collapsible.Trigger className="focus-visible:outline-ring flex min-h-9 min-w-0 flex-1 items-start gap-2 rounded-md py-2 text-left focus-visible:outline-2">
                  <CaretRight
                    size={14}
                    aria-hidden
                    className={cn(
                      'text-muted-foreground mt-0.5 flex-none transition-transform duration-150 motion-reduce:transition-none',
                      aberta && 'rotate-90',
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-medium">{`Linha ${i + 1}`}</span>
                    <span data-frase className="text-muted-foreground text-[13px]">
                      {frase(l)}
                    </span>
                  </span>
                </Collapsible.Trigger>
                <AcoesDaLinha
                  nome={`linha ${i + 1}`}
                  indice={i}
                  total={linhas.length}
                  ordenavel
                  onMover={onMover}
                  onRemover={() => onRemover(i)}
                />
              </div>
              <Collapsible.Panel>{renderizar(l, i)}</Collapsible.Panel>
            </Collapsible.Root>
          </li>
        );
      })}
    </ol>
  );
}

function TabelaPrevia({
  linhas,
  tipificacao,
  aPartirDe,
}: {
  linhas: LinhaPreviaTipificacaoDto[];
  tipificacao: TipificacaoDto;
  aPartirDe: string;
}) {
  const nome = (l: LinhaPreviaTipificacaoDto) =>
    tipificacao.subregras.find((s) => s.id === l.subregraId)?.nome ??
    `${tipificacao.regras.find((r) => r.id === l.regraId)?.nome ?? '?'} sem sub-regra`;
  const deixamDeFaturar = linhas
    .filter((l) => !l.fatura)
    .reduce((s, l) => s + l.depois.laudos - l.antes.laudos, 0);
  if (!linhas.length)
    return (
      <Alerta tom="info" role="note">
        Prévia: nenhum laudo deste cliente nas competências abertas.
      </Alerta>
    );
  const competencias = [...new Set(linhas.map((l) => l.competencia))];
  const contagem = (c: { laudos: number; volume: number }) => (
    <>
      {numero(c.laudos)}
      <span className="text-muted-foreground block text-[12px]">vol. {numero(c.volume, 2)}</span>
    </>
  );
  return (
    <section aria-label="Prévia" className="flex flex-col gap-2">
      <h4 className="font-medium">Prévia nas competências abertas</h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[13px] tabular-nums">
          <thead className="text-subtle-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 font-medium">
                Resultado
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Laudos hoje
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Com a mudança
              </th>
            </tr>
          </thead>
          {competencias.map((competencia) => (
            <tbody key={competencia} className="divide-y border-b last:border-b-0">
              <tr className="bg-muted/50">
                <th scope="rowgroup" colSpan={3} className="px-3 py-1.5 font-medium">
                  Competência {mesAno(competencia)}
                  {competencia < aPartirDe && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · antes da nova versão, não muda
                    </span>
                  )}
                </th>
              </tr>
              {linhas
                .filter((l) => l.competencia === competencia)
                .map((l) => (
                  <tr key={`${l.regraId}-${l.subregraId}-${l.fatura}`}>
                    <th scope="row" className="px-3 py-2 font-normal">
                      {nome(l)}
                      {!l.fatura && (
                        <span className="text-destructive block text-[12px]">Não fatura</span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-right">{contagem(l.antes)}</td>
                    <td className="px-3 py-2 text-right">{contagem(l.depois)}</td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-muted-foreground text-[13px]">
        {deixamDeFaturar > 0
          ? `${plural(deixamDeFaturar, { um: 'laudo deixa', varios: 'laudos deixam' })} de faturar.`
          : deixamDeFaturar < 0
            ? `${plural(-deixamDeFaturar, { um: 'laudo volta', varios: 'laudos voltam' })} a faturar.`
            : 'Nenhum laudo muda entre faturar e não faturar.'}
      </p>
    </section>
  );
}
