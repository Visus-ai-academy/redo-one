import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { regrasFrenteControllerSalvarEspecialidade } from '../../gen/clients/regrasFrenteControllerSalvarEspecialidade';
import { regrasFrenteControllerSalvarModalidade } from '../../gen/clients/regrasFrenteControllerSalvarModalidade';
import { opcoesControllerListasQueryOptions } from '../../gen/hooks/useOpcoesControllerListas';
import { regrasFrenteControllerObterEspecialidadeQueryOptions } from '../../gen/hooks/useRegrasFrenteControllerObterEspecialidade';
import { regrasFrenteControllerObterModalidadeQueryOptions } from '../../gen/hooks/useRegrasFrenteControllerObterModalidade';
import type { RegrasFrenteDto } from '../../gen/types/RegrasFrenteDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { CaixasField, OpcoesField } from '../escala/campos';
import { useAppForm } from '../form/form';
import { useAvisos } from '../toast/use-avisos';
import { limparErrosDasListas } from './erros-das-listas';
import { AbaCarregando, AbaComErro } from './estados';
import { AcoesDaLinha, ErroDaLista, ItemDaLista, ResumoEmGrupos, Secao } from './partes-form';
import {
  type CatalogoRegras,
  DIAS_DA_SEMANA,
  esquemaRegras,
  regrasParaApi,
  resumoRegras,
  SEGMENTO_VAZIO,
  type TipoFrente,
  valoresDasRegras,
} from './regras-frente-form';

type Props = {
  tipo: TipoFrente;
  /** Id da especialidade ou da modalidade. */
  id: string;
  /** `distribuicao-config.editar`. */
  podeEditar: boolean;
};

function opcoesDaConsulta(tipo: TipoFrente, id: string) {
  return tipo === 'especialidade'
    ? regrasFrenteControllerObterEspecialidadeQueryOptions({ path: { especialidadeId: id } })
    : (regrasFrenteControllerObterModalidadeQueryOptions({
        path: { modalidadeId: id },
      }) as unknown as ReturnType<typeof regrasFrenteControllerObterEspecialidadeQueryOptions>);
}

/**
 * Aba "Distribuição" do painel da especialidade ou da modalidade (Configurações › Classificação
 * dos exames): como o robô trata esta frente. Quem só vê lê o resumo.
 */
export function AbaDistribuicaoFrente({ tipo, id, podeEditar }: Props) {
  const opcoes = opcoesDaConsulta(tipo, id);
  const consulta = useQuery(opcoes);
  const catalogo = useQuery(opcoesControllerListasQueryOptions());

  if (consulta.isError || catalogo.isError) {
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void consulta.refetch();
          void catalogo.refetch();
        }}
      >
        Não foi possível carregar as regras da distribuição agora.
      </AbaComErro>
    );
  }
  if (!consulta.data || !catalogo.data) return <AbaCarregando />;
  const { regras, cadastrada } = consulta.data;

  return (
    <div className="flex flex-col gap-6 p-4">
      {!cadastrada && (
        <Alerta tom="info" role="note">
          Esta frente ainda não tem regra própria: valem a regra padrão da Lista e a distribuição
          comum do robô.
        </Alerta>
      )}
      {podeEditar ? (
        <FormRegras
          tipo={tipo}
          id={id}
          regras={regras}
          catalogo={catalogo.data}
          queryKey={opcoes.queryKey}
        />
      ) : (
        <ResumoEmGrupos grupos={resumoRegras(regras, catalogo.data, tipo)} />
      )}
    </div>
  );
}

const OPCOES_PRIORIDADES = [
  { valor: 'padrao', rotulo: 'As da regra padrão' },
  { valor: 'proprias', rotulo: 'Próprias' },
];
const OPCOES_PRAZO = [
  { valor: 'padrao', rotulo: 'O da regra padrão' },
  { valor: 'sla', rotulo: 'Segue o SLA' },
  { valor: 'minimo', rotulo: 'Prazo mínimo próprio' },
];
const OPCOES_DIVISAO = [
  { valor: 'igualitaria', rotulo: 'Igualitária' },
  { valor: 'proporcao', rotulo: 'Proporção por modalidade' },
];

const listaClasse = 'flex flex-col divide-y rounded-md border';
const adicionarClasse = buttonClassName({ variant: 'secondary', className: 'self-start' });

function FormRegras({
  tipo,
  id,
  regras,
  catalogo,
  queryKey,
}: {
  tipo: TipoFrente;
  id: string;
  regras: RegrasFrenteDto;
  catalogo: CatalogoRegras;
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const ehEspecialidade = tipo === 'especialidade';

  const form = useAppForm({
    defaultValues: valoresDasRegras(regras),
    validators: { onSubmit: esquemaRegras(tipo) },
    // O erro de uma lista inteira (ex.: a soma) sai quando qualquer item dela muda.
    listeners: {
      onChange: ({ formApi }) => limparErrosDasListas(formApi, ['proporcoes', 'mistura']),
    },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const body = regrasParaApi(value, tipo);
        if (ehEspecialidade) {
          await regrasFrenteControllerSalvarEspecialidade({
            path: { especialidadeId: id },
            body,
          }).unwrap();
        } else {
          await regrasFrenteControllerSalvarModalidade({
            path: { modalidadeId: id },
            body,
          }).unwrap();
        }
        await queryClient.invalidateQueries({ queryKey });
        avisos.sucesso('Regras da distribuição salvas.');
      }),
  });

  // Segmentos: os da especialidade (na modalidade, qualquer um).
  const segmentosDaFrente = ehEspecialidade
    ? catalogo.subespecialidades.filter((s) => s.especialidadeIds.includes(id))
    : catalogo.subespecialidades;
  const opcoesSegmento = (atual: string) => [
    ...segmentosDaFrente.map((s) => ({ valor: s.id, rotulo: s.nome })),
    // O já escolhido que saiu da lista (inativo ou de outra especialidade) continua à vista.
    ...(atual && !segmentosDaFrente.some((s) => s.id === atual)
      ? [{ valor: atual, rotulo: '(fora da lista)' }]
      : []),
  ];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      {erro && <Alerta tom="erro">{erro}</Alerta>}

      <Secao
        titulo="Lista"
        ajuda="A Lista de produção (o turno de 24 h) só recebe da fila o que passa por esta regra."
      >
        <form.AppField name="listaPrioridades">
          {() => <OpcoesField label="Prioridades aceitas" opcoes={OPCOES_PRIORIDADES} />}
        </form.AppField>
        <form.Subscribe selector={(s) => s.values.listaPrioridades}>
          {(modo) =>
            modo === 'proprias' && (
              <form.AppField name="listaPrioridadeIds">
                {() => (
                  <CaixasField
                    label="Prioridades da Lista"
                    description="Nada marcado: todas."
                    opcoes={catalogo.prioridades.map((p) => ({ valor: p.id, rotulo: p.nome }))}
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.AppField name="listaPrazo">
          {() => (
            <OpcoesField
              label="Prazo para entrar na Lista"
              opcoes={OPCOES_PRAZO}
              description="Segue o SLA: entra qualquer exame, sem prazo mínimo."
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(s) => s.values.listaPrazo}>
          {(prazo) =>
            prazo === 'minimo' && (
              <form.AppField name="listaPrazoMinimoHoras">
                {(field) => (
                  <field.NumberField
                    label="Horas até o prazo, no mínimo"
                    placeholder="Ex.: 24"
                    description="Só entra na Lista o exame que ainda tem pelo menos estas horas até vencer."
                    min={0}
                    max={720}
                    required
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.AppField name="listaDepoisDosFixos">
          {(field) => (
            <field.CheckboxField
              label="Guardar para os turnos posteriores"
              description="Antes de os turnos posteriores (ex.: a Tarde) começarem, a Lista recebe só o que eles não vão dar conta."
            />
          )}
        </form.AppField>
      </Secao>

      <Secao titulo="Robô" className="border-t pt-6">
        <form.AppField name="distribuiPeloRobo">
          {(field) => (
            <field.CheckboxField
              label="Distribui pelo robô"
              description="Desmarcado: a frente é toda manual."
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(s) => s.values.distribuiPeloRobo}>
          {(peloRobo) =>
            peloRobo && (
              <form.AppField name="horariosSemRobo" mode="array">
                {(lista) => (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">Horários sem robô</span>
                      <p className="text-muted-foreground text-[13px]">
                        Nessas faixas o robô não distribui a frente. A faixa pode virar a meia-noite
                        (ex.: das 19:00 até as 07:00).
                      </p>
                    </div>
                    {lista.state.value.length > 0 && (
                      <ul className={listaClasse}>
                        {lista.state.value.map((_, i) => (
                          <ItemDaLista
                            // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id.
                            key={i}
                            titulo={`Horário ${i + 1}`}
                            acoes={
                              <AcoesDaLinha
                                nome={`horário ${i + 1}`}
                                indice={i}
                                total={lista.state.value.length}
                                onRemover={() => lista.removeValue(i)}
                              />
                            }
                          >
                            <form.AppField name={`horariosSemRobo[${i}].diasSemana`}>
                              {() => (
                                <CaixasField
                                  label="Dias"
                                  description="Nada marcado: todos os dias."
                                  opcoes={DIAS_DA_SEMANA}
                                />
                              )}
                            </form.AppField>
                            <div className="flex flex-wrap gap-4">
                              <form.AppField name={`horariosSemRobo[${i}].inicio`}>
                                {(field) => (
                                  <field.TextField
                                    label="Das"
                                    placeholder="19:00"
                                    autoComplete="off"
                                    required
                                    className="flex-[1_1_100px]"
                                  />
                                )}
                              </form.AppField>
                              <form.AppField name={`horariosSemRobo[${i}].fim`}>
                                {(field) => (
                                  <field.TextField
                                    label="Até"
                                    placeholder="07:00"
                                    autoComplete="off"
                                    required
                                    className="flex-[1_1_100px]"
                                  />
                                )}
                              </form.AppField>
                            </div>
                          </ItemDaLista>
                        ))}
                      </ul>
                    )}
                    <Button
                      type="button"
                      onClick={() => lista.pushValue({ diasSemana: [], inicio: '', fim: '' })}
                      className={adicionarClasse}
                    >
                      <Plus size={16} aria-hidden />
                      Adicionar horário
                    </Button>
                  </div>
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
      </Secao>

      <Secao titulo="Recolhimento" className="border-t pt-6">
        <form.AppField name="recolheAoFimDoTurno">
          {(field) => (
            <field.CheckboxField
              label="Recolhe ao fim do turno"
              description="O exame que o médico não abriu volta para a fila depois que o turno dele acaba."
            />
          )}
        </form.AppField>
      </Secao>

      <Secao
        titulo={ehEspecialidade ? 'Divisão e teto' : 'Teto'}
        ajuda={
          ehEspecialidade
            ? 'Como os exames da frente se repartem entre os médicos escalados em cada rodada.'
            : undefined
        }
        className="border-t pt-6"
      >
        {ehEspecialidade && (
          <>
            <form.AppField name="divisao">
              {() => <OpcoesField label="Divisão entre os médicos" opcoes={OPCOES_DIVISAO} />}
            </form.AppField>
            <form.Subscribe selector={(s) => s.values.divisao}>
              {(divisao) =>
                divisao === 'proporcao' && (
                  <form.AppField name="proporcoes" mode="array">
                    {(lista) => (
                      <div className="flex flex-col gap-3">
                        <p className="text-muted-foreground text-[13px]">
                          Quanto de cada modalidade cada médico recebe; os percentuais somam 100.
                        </p>
                        {lista.state.value.length > 0 && (
                          <ul className={listaClasse}>
                            {lista.state.value.map((_, i) => (
                              <ItemDaLista
                                // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id.
                                key={i}
                                titulo={`Modalidade ${i + 1}`}
                                acoes={
                                  <AcoesDaLinha
                                    nome={`modalidade ${i + 1}`}
                                    indice={i}
                                    total={lista.state.value.length}
                                    onRemover={() => lista.removeValue(i)}
                                  />
                                }
                              >
                                <div className="flex flex-wrap gap-4">
                                  <form.AppField name={`proporcoes[${i}].modalidadeId`}>
                                    {(field) => (
                                      <field.SelectField
                                        label={`Modalidade ${i + 1}`}
                                        placeholder="Escolha"
                                        required
                                        opcoes={catalogo.modalidades.map((m) => ({
                                          valor: m.id,
                                          rotulo: m.nome,
                                        }))}
                                        className="flex-[2_1_140px]"
                                      />
                                    )}
                                  </form.AppField>
                                  <form.AppField name={`proporcoes[${i}].percentual`}>
                                    {(field) => (
                                      <field.NumberField
                                        label={`Percentual da modalidade ${i + 1}`}
                                        placeholder="Ex.: 60"
                                        min={1}
                                        max={100}
                                        required
                                        className="flex-[1_1_100px]"
                                      />
                                    )}
                                  </form.AppField>
                                </div>
                              </ItemDaLista>
                            ))}
                          </ul>
                        )}
                        <ErroDaLista erros={lista.state.meta.errors} />
                        <Button
                          type="button"
                          onClick={() => lista.pushValue({ modalidadeId: '', percentual: '' })}
                          className={adicionarClasse}
                        >
                          <Plus size={16} aria-hidden />
                          Adicionar modalidade
                        </Button>
                      </div>
                    )}
                  </form.AppField>
                )
              }
            </form.Subscribe>
          </>
        )}
        <form.AppField name="tetoPorMedico">
          {(field) => (
            <field.NumberField
              label="Teto por médico a cada rodada"
              placeholder="Sem teto próprio"
              description="Além do teto da escala. Vazio: só o da escala."
              min={1}
              max={10000}
            />
          )}
        </form.AppField>
      </Secao>

      <Secao
        titulo="Segmentos"
        ajuda="Limites de um segmento dentro da frente, por médico a cada rodada."
        className="border-t pt-6"
      >
        <form.AppField name="segmentos" mode="array">
          {(lista) => (
            <div className="flex flex-col gap-3">
              {lista.state.value.length === 0 ? (
                <p className="text-muted-foreground">Nenhum segmento com regra própria.</p>
              ) : (
                <ul className={listaClasse}>
                  {lista.state.value.map((segmento, i) => (
                    <ItemDaLista
                      // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id.
                      key={i}
                      titulo={`Segmento ${i + 1}`}
                      acoes={
                        <AcoesDaLinha
                          nome={`segmento ${i + 1}`}
                          indice={i}
                          total={lista.state.value.length}
                          onRemover={() => lista.removeValue(i)}
                        />
                      }
                    >
                      <form.AppField name={`segmentos[${i}].subespecialidadeId`}>
                        {(field) => (
                          <field.SelectField
                            label="Segmento"
                            placeholder="Escolha o segmento"
                            required
                            opcoes={opcoesSegmento(segmento.subespecialidadeId)}
                          />
                        )}
                      </form.AppField>
                      <div className="flex flex-wrap gap-4">
                        <form.AppField name={`segmentos[${i}].teto`}>
                          {(field) => (
                            <field.NumberField
                              label="Teto por rodada"
                              placeholder="Sem teto"
                              min={1}
                              className="flex-[1_1_120px]"
                            />
                          )}
                        </form.AppField>
                        <form.AppField name={`segmentos[${i}].piso`}>
                          {(field) => (
                            <field.NumberField
                              label="Piso"
                              placeholder="Sem piso"
                              description="Recebe logo depois das urgências."
                              min={1}
                              className="flex-[1_1_120px]"
                            />
                          )}
                        </form.AppField>
                      </div>
                      <form.AppField name={`segmentos[${i}].reduzido`}>
                        {(field) => (
                          <field.CheckboxField
                            label="Teto menor para quem produz pouco"
                            description="Quem tem produtividade de escala baixa recebe um teto reduzido."
                          />
                        )}
                      </form.AppField>
                      {segmento.reduzido && (
                        <div className="flex flex-wrap gap-4">
                          <form.AppField name={`segmentos[${i}].produtividadeAte`}>
                            {(field) => (
                              <field.NumberField
                                label="Produtividade até"
                                placeholder="Ex.: 20"
                                min={1}
                                required
                                className="flex-[1_1_120px]"
                              />
                            )}
                          </form.AppField>
                          <form.AppField name={`segmentos[${i}].tetoReduzido`}>
                            {(field) => (
                              <field.NumberField
                                label="Teto reduzido"
                                placeholder="Ex.: 4"
                                min={0}
                                required
                                className="flex-[1_1_120px]"
                              />
                            )}
                          </form.AppField>
                        </div>
                      )}
                      <form.AppField name={`segmentos[${i}].pacoteAParte`}>
                        {(field) => (
                          <field.CheckboxField
                            label="Pacote à parte"
                            description="No pacote do paciente, os exames deste segmento não se juntam aos outros."
                          />
                        )}
                      </form.AppField>
                    </ItemDaLista>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                onClick={() => lista.pushValue({ ...SEGMENTO_VAZIO })}
                className={adicionarClasse}
              >
                <Plus size={16} aria-hidden />
                Adicionar segmento
              </Button>
            </div>
          )}
        </form.AppField>
      </Secao>

      <Secao
        titulo="Mistura entre segmentos"
        ajuda="Para o médico que lauda vários segmentos (ex.: o neurologista): ele recebe uma fatia de cada, na ordem abaixo, em vez de esgotar um antes do outro."
        className="border-t pt-6"
      >
        <form.AppField name="mistura" mode="array">
          {(lista) => (
            <div className="flex flex-col gap-3">
              {lista.state.value.length === 0 ? (
                <p className="text-muted-foreground">Sem mistura: a fila segue a ordem comum.</p>
              ) : (
                <ol className={listaClasse}>
                  {lista.state.value.map((fatia, i) => {
                    const subs = fatia.especialidadeId
                      ? catalogo.subespecialidades.filter((s) =>
                          s.especialidadeIds.includes(fatia.especialidadeId),
                        )
                      : catalogo.subespecialidades;
                    return (
                      <ItemDaLista
                        // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id.
                        key={i}
                        titulo={`Fatia ${i + 1}`}
                        acoes={
                          <AcoesDaLinha
                            nome={`fatia ${i + 1}`}
                            indice={i}
                            total={lista.state.value.length}
                            ordenavel
                            onMover={(de, para) => lista.moveValue(de, para)}
                            onRemover={() => lista.removeValue(i)}
                          />
                        }
                      >
                        <div className="flex flex-wrap gap-4">
                          <form.AppField name={`mistura[${i}].especialidadeId`}>
                            {(field) => (
                              <field.SelectField
                                label="Especialidade"
                                placeholder="Qualquer"
                                opcoes={[
                                  { valor: '', rotulo: 'Qualquer' },
                                  ...catalogo.especialidades.map((e) => ({
                                    valor: e.id,
                                    rotulo: e.nome,
                                  })),
                                ]}
                                className="flex-[1_1_140px]"
                              />
                            )}
                          </form.AppField>
                          <form.AppField name={`mistura[${i}].subespecialidadeId`}>
                            {(field) => (
                              <field.SelectField
                                label="Segmento"
                                placeholder="Geral (sem segmento)"
                                opcoes={[
                                  { valor: '', rotulo: 'Geral (sem segmento)' },
                                  ...subs.map((s) => ({ valor: s.id, rotulo: s.nome })),
                                ]}
                                className="flex-[1_1_140px]"
                              />
                            )}
                          </form.AppField>
                        </div>
                      </ItemDaLista>
                    );
                  })}
                </ol>
              )}
              <ErroDaLista erros={lista.state.meta.errors} />
              <Button
                type="button"
                onClick={() => lista.pushValue({ especialidadeId: '', subespecialidadeId: '' })}
                className={adicionarClasse}
              >
                <Plus size={16} aria-hidden />
                Adicionar fatia
              </Button>
            </div>
          )}
        </form.AppField>
      </Secao>

      <div className="flex justify-end border-t pt-4">
        <form.AppForm>
          <form.SubmitButton pendingLabel="Salvando…">Salvar regras</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
