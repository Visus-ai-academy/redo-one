import { useStore } from '@tanstack/react-form';
import { useEffect, useRef, useState } from 'react';

import type { AlocacaoDto } from '../../gen/types/AlocacaoDto';
import type { AlocacaoItemDto } from '../../gen/types/AlocacaoItemDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import type { SugestaoAlocacaoDto } from '../../gen/types/SugestaoAlocacaoDto';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { RodapePainel } from '../catalogo/rodape-painel';
import { FALHA_AO_SALVAR } from '../escala-config/comum';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import {
  esquemaAlocacao,
  GERAL,
  type InicialAlocacao,
  OPCOES_DIAS,
  OPCOES_SEMANAS,
  paraApi,
  TODOS_OS_DIAS,
  valoresIniciais,
} from './alocacao-form';
import { CaixasField, OpcoesField } from './campos';
import { opcoesDeFrentes } from './opcoes-frentes';

export type PainelAlocacaoProps = {
  /** Com alocação, o painel edita; sem, cria. */
  alocacao?: AlocacaoItemDto;
  /** Nome do médico da alocação editada. */
  medicoNome?: string;
  /** Valores iniciais (o "+" do dia; depois, os arranjos do médico). */
  inicial?: InicialAlocacao;
  hoje: string;
  /** Turnos e frentes que quem edita pode usar (o recorte, se houver). */
  turnos: TurnoItemDto[];
  frentes: FrenteItemDto[];
  /** Prioridades da operação (o recorte da alocação é por elas). */
  prioridades: { id: string; nome: string; cor: string | null }[];
  /** Inativas inclusive: o formulário oferece as ativas e as já marcadas na alocação. */
  subespecialidades: { id: string; nome: string; ativo: boolean; especialidadeIds: string[] }[];
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  /**
   * Em alocação nova: prioridades e subespecialidades sugeridas pelos arranjos do médico na
   * frente (null = nenhum arranjo dela). Sem a função, nada é sugerido.
   */
  buscarSugestao?: (medicoId: string, frenteId: string) => Promise<SugestaoAlocacaoDto | null>;
  onSalvar: (dados: AlocacaoDto) => Promise<void>;
  onFechar: () => void;
};

const AJUDA_RESTRICAO = 'Nada marcado: sem restrição.';

/** Alocar um médico num turno e frente, ou editar a alocação, no painel ao lado da escala. */
export function PainelAlocacao({
  alocacao,
  medicoNome,
  inicial,
  hoje,
  turnos,
  frentes,
  prioridades,
  subespecialidades,
  buscarMedicos,
  buscarSugestao,
  onSalvar,
  onFechar,
}: PainelAlocacaoProps) {
  const [erro, setErro] = useState<string>();
  const editando = Boolean(alocacao);

  const iniciais = valoresIniciais({
    hoje,
    alocacao,
    medico: alocacao && medicoNome ? { valor: alocacao.medicoId, rotulo: medicoNome } : undefined,
    inicial: (() => {
      // O "+" já traz o turno: o horário começa no dele.
      const t = turnos.find((x) => x.id === inicial?.turnoId);
      return t ? { horarioInicio: t.horarioInicio, horarioFim: t.horarioFim, ...inicial } : inicial;
    })(),
  });
  // Uma inativa já marcada continua à mostra (com o nome), para manter ou desmarcar.
  const oferecida = (marcadas: string[]) => (item: { id: string; ativo: boolean }) =>
    item.ativo || marcadas.includes(item.id);
  const subespecialidadesOferecidas = subespecialidades.filter(
    oferecida(iniciais.subespecialidadeIds),
  );
  /** As subespecialidades da frente: só frente de especialidade tem. */
  const subsDaFrente = (frente: { especialidadeId?: string | null } | undefined) => {
    const especialidadeId = frente?.especialidadeId;
    return especialidadeId
      ? subespecialidadesOferecidas.filter((s) => s.especialidadeIds.includes(especialidadeId))
      : [];
  };

  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaAlocacao },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar(paraApi(value));
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });

  const alterado = useAlterado(form, iniciais);
  const opcoesFrentes = opcoesDeFrentes(frentes);
  const sugerido = useSugestaoDoMedico({
    form,
    ativo: !editando && Boolean(buscarSugestao),
    buscarSugestao,
    iniciais,
    filtrar: (sugestao, frenteId) => {
      const subs = subsDaFrente(frentes.find((f) => f.id === frenteId));
      return {
        prioridadeIds: sugestao.prioridadeIds.filter((id) => prioridades.some((p) => p.id === id)),
        subespecialidadeIds: [
          ...sugestao.subespecialidadeIds.filter((id) => subs.some((s) => s.id === id)),
          ...(sugestao.subespecialidadeGeral && subs.length > 0 ? [GERAL] : []),
        ],
      };
    },
  });
  const ajuda = (campo: CampoSugerido) =>
    sugerido.has(campo) && !form.getFieldMeta(campo)?.isTouched
      ? `${AJUDA_RESTRICAO} Veio dos arranjos do médico.`
      : AJUDA_RESTRICAO;

  return (
    <PainelLateral
      titulo={editando ? 'Editar alocação' : 'Alocar médico'}
      alterado={alterado}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {editando ? (
          <CampoSomenteLeitura
            label="Médico"
            value={medicoNome ?? ''}
            description="Para trocar o médico, remova esta alocação e crie outra."
          />
        ) : (
          <form.AppField name="medico">
            {(field) => (
              <field.BuscaField
                label="Médico"
                placeholder="Digite parte do nome"
                chave="medicos-ativos"
                buscar={buscarMedicos}
                required
                description="Só médicos ativos."
              />
            )}
          </form.AppField>
        )}
        <form.AppField
          name="frenteId"
          listeners={{
            onChange: ({ value }) => {
              const turno = turnos.find((t) => t.id === form.getFieldValue('turnoId'));
              if (turno && !turno.frentes.some((f) => f.id === value)) {
                form.setFieldValue('turnoId', '');
              }
              // Subespecialidade é da especialidade: as que não são da nova frente (e o "geral",
              // se ela não tem nenhuma) saem.
              const daFrente = subsDaFrente(frentes.find((f) => f.id === value));
              const marcadas = form.getFieldValue('subespecialidadeIds');
              const ficam = marcadas.filter((id) =>
                id === GERAL ? daFrente.length > 0 : daFrente.some((s) => s.id === id),
              );
              // Sem marcar o campo como mexido: a sugestão do médico ainda pode preenchê-lo.
              if (ficam.length !== marcadas.length)
                form.setFieldValue('subespecialidadeIds', ficam, {
                  dontUpdateMeta: true,
                  dontValidate: true,
                });
            },
          }}
        >
          {(field) => (
            <field.SelectField
              label="Frente"
              placeholder="Escolha a frente"
              opcoes={opcoesFrentes}
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(estado) => estado.values.frenteId}>
          {(frenteId) => (
            <form.AppField
              name="turnoId"
              listeners={{
                onChange: ({ value }) => {
                  const turno = turnos.find((t) => t.id === value);
                  if (!turno) return;
                  form.setFieldValue('horarioInicio', turno.horarioInicio);
                  form.setFieldValue('horarioFim', turno.horarioFim);
                  if (turno.tipo !== 'lista' && !editando) form.setFieldValue('gratificado', false);
                },
              }}
            >
              {(field) => {
                const opcoes = turnos
                  .filter((t) => t.frentes.some((f) => f.id === frenteId))
                  .map((t) => ({ valor: t.id, rotulo: t.nome }));
                return (
                  <field.SelectField
                    label="Turno"
                    placeholder={
                      !frenteId
                        ? 'Escolha a frente primeiro'
                        : opcoes.length === 0
                          ? 'Nenhum turno tem essa frente'
                          : 'Escolha o turno'
                    }
                    opcoes={opcoes}
                    // Sem opção, a lista abriria vazia.
                    disabled={opcoes.length === 0}
                    required
                    description="Só os turnos que têm a frente escolhida."
                  />
                );
              }}
            </form.AppField>
          )}
        </form.Subscribe>

        <form.Subscribe
          selector={(estado) => ({
            turnoId: estado.values.turnoId,
            gratificado: estado.values.gratificado,
            vigencia: estado.values.vigencia,
            frenteId: estado.values.frenteId,
          })}
        >
          {({ turnoId, gratificado, vigencia, frenteId }) => {
            const turno = turnos.find((t) => t.id === turnoId);
            const lista = turno?.tipo === 'lista';
            const comFim = gratificado || vigencia === 'periodo';
            const subs = subsDaFrente(frentes.find((f) => f.id === frenteId));
            return (
              <>
                {lista &&
                  (editando ? (
                    <CampoSomenteLeitura
                      label="Gratificado"
                      value={gratificado ? 'Sim' : 'Não'}
                      description="Não muda depois de criada: para trocar, crie outra alocação."
                    />
                  ) : (
                    <form.AppField name="gratificado">
                      {(field) => (
                        <field.CheckboxField
                          label="Gratificado"
                          description="Pontual: vale entre o início e o fim, com cota de registros, e não mexe na escala fixa do médico."
                        />
                      )}
                    </form.AppField>
                  ))}
                {!gratificado && (
                  <form.AppField
                    name="vigencia"
                    listeners={{
                      onChange: ({ value }) => {
                        if (value === 'periodo' && form.getFieldValue('diasSemana').length === 0) {
                          form.setFieldValue('diasSemana', TODOS_OS_DIAS);
                        }
                      },
                    }}
                  >
                    {() => (
                      <OpcoesField
                        label="Vigência"
                        opcoes={[
                          { valor: 'fixa', rotulo: 'Escala fixa' },
                          { valor: 'periodo', rotulo: 'Período único' },
                        ]}
                        description={
                          vigencia === 'periodo'
                            ? 'Vale só entre o início e o fim. No mesmo turno e frente da escala fixa do médico, substitui a fixa nesses dias.'
                            : 'Repete nos dias marcados, do início em diante. Para encerrar, remova a alocação.'
                        }
                      />
                    )}
                  </form.AppField>
                )}
                <div className="flex flex-wrap gap-4">
                  <form.AppField name="dataInicio">
                    {(field) => (
                      <field.TextField
                        type="date"
                        label={comFim ? 'Início' : 'A partir de'}
                        placeholder="AAAA-MM-DD"
                        required
                        className="flex-[1_1_150px]"
                      />
                    )}
                  </form.AppField>
                  {comFim && (
                    <form.AppField name="dataFim">
                      {(field) => (
                        <field.TextField
                          type="date"
                          label="Fim"
                          placeholder="AAAA-MM-DD"
                          required
                          className="flex-[1_1_150px]"
                        />
                      )}
                    </form.AppField>
                  )}
                </div>
                <form.AppField name="diasSemana">
                  {() => <CaixasField label="Dias da semana" opcoes={OPCOES_DIAS} required />}
                </form.AppField>
                {!gratificado && (
                  <form.AppField name="semanasDoMes">
                    {() => (
                      <CaixasField
                        label="Semanas do mês"
                        opcoes={OPCOES_SEMANAS}
                        description="Nada marcado: toda semana."
                      />
                    )}
                  </form.AppField>
                )}
                <div className="flex flex-wrap gap-4">
                  <form.AppField name="horarioInicio">
                    {(field) => (
                      <field.TextField
                        label="Horário início"
                        placeholder={turno?.horarioInicio ?? '07:00'}
                        autoComplete="off"
                        className="flex-[1_1_120px]"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="horarioFim">
                    {(field) => (
                      <field.TextField
                        label="Horário fim"
                        placeholder={turno?.horarioFim ?? '13:00'}
                        autoComplete="off"
                        className="flex-[1_1_120px]"
                      />
                    )}
                  </form.AppField>
                </div>
                <p className="text-muted-foreground -mt-2 text-[13px]">
                  Vazio: o horário do turno. Precisa caber no turno.
                </p>
                <form.AppField name="produtividade">
                  {(field) =>
                    gratificado ? (
                      <field.NumberField
                        label="Cota de registros no período"
                        placeholder="Ex.: 80"
                        min={1}
                        required
                        description="Ele recebe pelo menos isto no período, somando as rodadas."
                      />
                    ) : (
                      <field.NumberField
                        label="Produtividade (registros por turno)"
                        placeholder="Ex.: 40"
                        min={0}
                        description="Vazio: não informada (diferente de zero)."
                      />
                    )
                  }
                </form.AppField>
                <form.AppField name="prioridadeIds">
                  {() => (
                    <CaixasField
                      label="Prioridades"
                      opcoes={prioridades.map((p) => ({ valor: p.id, rotulo: p.nome, cor: p.cor }))}
                      description={ajuda('prioridadeIds')}
                    />
                  )}
                </form.AppField>
                <form.AppField name="subespecialidadeIds">
                  {(field) =>
                    // Só com frente de especialidade que tem subespecialidades (ou algo já marcado).
                    (subs.length > 0 || field.state.value.length > 0) && (
                      <CaixasField
                        label="Segmentos"
                        opcoes={[
                          ...subs.map((s) => ({ valor: s.id, rotulo: s.nome })),
                          { valor: GERAL, rotulo: 'Geral (sem segmento)' },
                        ]}
                        description={ajuda('subespecialidadeIds')}
                      />
                    )
                  }
                </form.AppField>
              </>
            );
          }}
        </form.Subscribe>
        <form.AppField name="observacoes">
          {(field) => (
            <field.TextAreaField
              label="Observações"
              placeholder="Ex.: combinado com a coordenação"
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel rotuloCriar="Alocar médico" editando={editando} onCancelar={onFechar} />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}

type CampoSugerido = 'prioridadeIds' | 'subespecialidadeIds';
const CAMPOS_SUGERIDOS: CampoSugerido[] = ['prioridadeIds', 'subespecialidadeIds'];

type FormAlocacao = {
  store: Parameters<typeof useStore>[0];
  getFieldMeta: (campo: CampoSugerido) => { isTouched?: boolean } | undefined;
  setFieldValue: (
    campo: CampoSugerido,
    valor: string[],
    opcoes: { dontUpdateMeta: boolean; dontValidate: boolean },
  ) => void;
};

/**
 * Com médico e frente escolhidos, busca a sugestão dos arranjos e preenche prioridades e
 * subespecialidades que a pessoa ainda não mexeu (sem a sugestão, voltam ao valor inicial). As
 * outras opções continuam livres. Devolve os campos que estão com a sugestão.
 */
function useSugestaoDoMedico({
  form,
  ativo,
  buscarSugestao,
  iniciais,
  filtrar,
}: {
  form: FormAlocacao;
  ativo: boolean;
  buscarSugestao?: PainelAlocacaoProps['buscarSugestao'];
  iniciais: { prioridadeIds: string[]; subespecialidadeIds: string[] };
  filtrar: (sugestao: SugestaoAlocacaoDto, frenteId: string) => Record<CampoSugerido, string[]>;
}) {
  const medicoId = useStore(
    form.store,
    (estado) => (estado as { values: { medico: OpcaoBusca | null } }).values.medico?.valor ?? '',
  );
  const frenteId = useStore(
    form.store,
    (estado) => (estado as { values: { frenteId: string } }).values.frenteId,
  );
  const [sugerido, setSugerido] = useState<ReadonlySet<CampoSugerido>>(new Set());
  // As funções mudam a cada render; o efeito só roda quando médico ou frente mudam.
  const atual = useRef({ buscarSugestao, iniciais, filtrar });
  atual.current = { buscarSugestao, iniciais, filtrar };

  useEffect(() => {
    const { buscarSugestao: buscar, iniciais: inicio, filtrar: recortar } = atual.current;
    if (!ativo || !buscar || !medicoId || !frenteId) return;
    let valendo = true;
    Promise.resolve()
      .then(() => buscar(medicoId, frenteId))
      .catch(() => null)
      .then((sugestao) => {
        if (!valendo) return;
        const valores = sugestao ? recortar(sugestao, frenteId) : null;
        const preenchidos = new Set<CampoSugerido>();
        for (const campo of CAMPOS_SUGERIDOS) {
          if (form.getFieldMeta(campo)?.isTouched) continue;
          form.setFieldValue(campo, valores?.[campo] ?? inicio[campo], {
            dontUpdateMeta: true,
            dontValidate: true,
          });
          if (valores?.[campo].length) preenchidos.add(campo);
        }
        setSugerido(preenchidos);
      });
    return () => {
      valendo = false;
    };
  }, [ativo, medicoId, frenteId, form]);

  return sugerido;
}
