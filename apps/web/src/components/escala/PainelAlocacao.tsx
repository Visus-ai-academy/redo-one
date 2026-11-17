import { useState } from 'react';

import type { AlocacaoDto } from '../../gen/types/AlocacaoDto';
import type { AlocacaoItemDto } from '../../gen/types/AlocacaoItemDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { RodapePainel } from '../catalogo/rodape-painel';
import { FALHA_AO_SALVAR } from '../escala-config/comum';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
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
  /** Inativas inclusive: o formulário oferece as ativas e as já marcadas na alocação. */
  prioridades: { id: string; nome: string; ativo: boolean }[];
  subespecialidades: { id: string; nome: string; ativo: boolean; especialidadeIds: string[] }[];
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
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
  const prioridadesOferecidas = prioridades.filter(oferecida(iniciais.prioridadeIds));
  const subespecialidadesOferecidas = subespecialidades.filter(
    oferecida(iniciais.subespecialidadeIds),
  );

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

  const opcoesFrentes = opcoesDeFrentes(frentes);

  return (
    <PainelLateral titulo={editando ? 'Editar alocação' : 'Alocar médico'} onFechar={onFechar}>
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
              {(field) => (
                <field.SelectField
                  label="Turno"
                  placeholder={frenteId ? 'Escolha o turno' : 'Escolha a frente primeiro'}
                  opcoes={turnos
                    .filter((t) => t.frentes.some((f) => f.id === frenteId))
                    .map((t) => ({
                      valor: t.id,
                      rotulo: t.nome,
                    }))}
                  required
                  description="Só os turnos que têm a frente escolhida."
                />
              )}
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
            const frente = frentes.find((f) => f.id === frenteId);
            const subs = subespecialidadesOferecidas.filter(
              (s) =>
                !frente?.especialidadeId || s.especialidadeIds.includes(frente.especialidadeId),
            );
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
                      opcoes={prioridadesOferecidas.map((p) => ({ valor: p.id, rotulo: p.nome }))}
                      description={AJUDA_RESTRICAO}
                    />
                  )}
                </form.AppField>
                <form.AppField name="subespecialidadeIds">
                  {() => (
                    <CaixasField
                      label="Subespecialidades"
                      opcoes={[
                        ...subs.map((s) => ({ valor: s.id, rotulo: s.nome })),
                        { valor: GERAL, rotulo: 'Geral (sem subespecialidade)' },
                      ]}
                      description={AJUDA_RESTRICAO}
                    />
                  )}
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
