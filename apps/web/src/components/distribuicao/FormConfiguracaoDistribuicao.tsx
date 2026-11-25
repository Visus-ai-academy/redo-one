import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import type { CelulaRecebimentoDto } from '../../gen/types/CelulaRecebimentoDto';
import type { ConfiguracaoDistribuicaoDto } from '../../gen/types/ConfiguracaoDistribuicaoDto';
import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { CaixasField } from '../escala/campos';
import { iguaisSemMaiusculas } from '../form/etiquetas';
import { useAppForm } from '../form/form';
import { Painel } from '../painel/Painel';
import {
  CRITERIOS_FILA,
  configuracaoParaApi,
  DIRECAO_PADRAO,
  emHoras,
  esquemaConfiguracao,
  ORDEM_CRITERIOS,
  resumoConfiguracao,
  valoresDaConfiguracao,
} from './configuracao-form';
import { limparErrosDasListas } from './erros-das-listas';
import { GradeRecebimento } from './GradeRecebimento';
import { AcoesDaLinha, ErroDaLista } from './partes-form';
import { celulasParaApi, errosDaGrade, type Grade, gradeDasCelulas } from './recebimento';

export type ReferenciasConfiguracao = {
  /** Turnos ativos da escala: as colunas da grade e a escolha dos turnos posteriores. */
  turnos: RotuloDto[];
  /** Prioridades da operação: as linhas da grade de recebimento. */
  prioridades: readonly PrioridadeOperacaoDto[];
};

type Props = ReferenciasConfiguracao & {
  configuracao: ConfiguracaoDistribuicaoDto;
  /** A grade geral de recebimento (célula ausente = segue o SLA). */
  celulas: readonly CelulaRecebimentoDto[];
  /** `distribuicao-config.editar`; sem ela, o resumo. */
  podeEditar: boolean;
  /** Um botão só salva a configuração e a grade. */
  onSalvar: (
    configuracao: ConfiguracaoDistribuicaoDto,
    celulas: CelulaRecebimentoDto[],
  ) => Promise<void>;
};

/** O painel da grade de recebimento: a grade, ou o aviso quando falta prioridade ou turno. */
function PainelGrade({
  prioridades,
  turnos,
  children,
}: {
  prioridades: readonly PrioridadeOperacaoDto[];
  turnos: readonly RotuloDto[];
  children: ReactNode;
}) {
  return (
    <Painel
      titulo="Grade de recebimento"
      descricao="O que cada turno da escala recebe de cada prioridade. Cada frente pode mudar células na aba Distribuição dela."
    >
      {prioridades.length === 0 || turnos.length === 0 ? (
        <p className="text-muted-foreground">
          {prioridades.length === 0
            ? 'Cadastre as prioridades da operação para montar a grade.'
            : 'Cadastre os turnos da escala para montar a grade.'}
        </p>
      ) : (
        children
      )}
    </Painel>
  );
}

/** "(24 h)" ao lado de um prazo em minutos; nada abaixo de 1 h ou sem número. */
function dicaDoPrazo(valor: string): string | undefined {
  const t = valor.trim();
  const horas = /^\d+$/.test(t) ? emHoras(Number(t)) : null;
  return horas ? `(${horas})` : undefined;
}

/** O que vale para todas as frentes do robô (Configurações › Distribuição). */
export function FormConfiguracaoDistribuicao({
  configuracao,
  celulas,
  turnos,
  prioridades,
  podeEditar,
  onSalvar,
}: Props) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: valoresDaConfiguracao(configuracao, celulas),
    validators: { onSubmit: esquemaConfiguracao },
    // O erro de uma lista inteira (ex.: a soma) sai quando qualquer item dela muda.
    listeners: {
      onChange: ({ formApi }) => limparErrosDasListas(formApi, ['ordemFila', 'recebimento']),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar(
          configuracaoParaApi(value),
          celulasParaApi(value.recebimento, {
            omitirSla: true,
            prioridadeIds: prioridades.map((p) => p.id),
          }),
        ),
      ),
  });

  if (!podeEditar) {
    return (
      <div className="flex flex-col gap-6">
        <PainelGrade prioridades={prioridades} turnos={turnos}>
          <GradeRecebimento
            prioridades={prioridades}
            turnos={turnos}
            valor={gradeDasCelulas(celulas)}
            somenteLeitura
          />
        </PainelGrade>
        {resumoConfiguracao(configuracao, { turnos }).map((g) => (
          <Painel key={g.titulo} titulo={g.titulo}>
            <dl className="flex flex-col gap-2">
              {g.linhas.map((l) => (
                <div key={l.rotulo} className="flex flex-col gap-0.5">
                  <dt className="text-subtle-foreground text-[13px]">{l.rotulo}</dt>
                  <dd>{l.valor}</dd>
                </div>
              ))}
            </dl>
          </Painel>
        ))}
      </div>
    );
  }

  // Turno já escolhido que ficou inativo continua à vista para poder ser tirado.
  const comInativos = (escolhidos: readonly string[]) => [
    ...turnos.map((t) => ({ valor: t.id, rotulo: t.nome })),
    ...escolhidos
      .filter((id, i) => !turnos.some((t) => t.id === id) && escolhidos.indexOf(id) === i)
      .map((id) => ({ valor: id, rotulo: '(turno inativo)' })),
  ];
  const opcoesTurno = comInativos(configuracao.turnosPosteriores?.turnoIds ?? []);
  const turnosDoPrazo = comInativos(configuracao.recolhimentoPorTurno.map((p) => p.turnoId));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <Painel
        titulo="Robô"
        descricao="Se dá para pedir rodada, quanto tempo a proposta espera a aprovação, de quanto em quanto tempo a fila do momento é lida e se a proposta confere a conta do médico na unidade."
      >
        <div className="flex flex-col gap-4">
          <form.AppField name="roboAtivo">
            {(field) => (
              <field.CheckboxField
                label="Robô ligado"
                description="Desligado, ninguém inicia rodada e os exames ficam para a distribuição à mão."
              />
            )}
          </form.AppField>
          <form.AppField name="expiracaoPropostaMin">
            {(field) => (
              <field.NumberField
                label="Validade da proposta (minutos)"
                placeholder="Ex.: 45"
                description="A proposta não aprovada nesse tempo expira: a fila já mudou."
                min={1}
                max={1440}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="temTeto">
            {(field) => (
              <field.CheckboxField
                label="Limitar os exames por rodada"
                description="O que passar do teto fica para a próxima rodada."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(s) => s.values.temTeto}>
            {(temTeto) =>
              temTeto && (
                <form.AppField name="tetoPorRodada">
                  {(field) => (
                    <field.NumberField
                      label="Teto de exames por rodada"
                      placeholder="Ex.: 1500"
                      min={1}
                      max={100000}
                      required
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
          <form.AppField name="lerFila">
            {(field) => (
              <field.CheckboxField
                label="Ler a fila do momento sozinho"
                description="A tela Operação › Distribuição mostra a última leitura da fila da MobileMed. Não distribui nada: a rodada sempre lê a fila de novo."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(s) => s.values.lerFila}>
            {(lerFila) =>
              lerFila && (
                <form.AppField name="retratoFilaMin">
                  {(field) => (
                    <field.NumberField
                      label="Ler a cada (minutos)"
                      placeholder="Ex.: 5"
                      min={1}
                      max={1440}
                      required
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
          <form.AppField name="conferirUnidade">
            {(field) => (
              <field.CheckboxField
                label="Conferir na proposta a conta do médico na unidade"
                description="A proposta não oferece o exame a quem não está liberado na unidade dele na MobileMed. A lista de médicos de cada unidade fica guardada na API; a execução sempre confere na hora."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(s) => s.values.conferirUnidade}>
            {(conferirUnidade) =>
              conferirUnidade && (
                <form.AppField name="contasUnidadeValidadeMin">
                  {(field) => (
                    <field.NumberField
                      label="Validade da lista de cada unidade (minutos)"
                      placeholder="Ex.: 240"
                      description="Depois disso a lista é lida de novo na MobileMed. 0 = lê a cada rodada."
                      min={0}
                      max={10080}
                      required
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
        </div>
      </Painel>

      <PainelGrade prioridades={prioridades} turnos={turnos}>
        <form.AppField name="recebimento">
          {(field) => (
            <div className="flex flex-col gap-2">
              <GradeRecebimento
                prioridades={prioridades}
                turnos={turnos}
                valor={field.state.value as Grade}
                onChange={field.handleChange}
                erros={field.state.meta.errors.length ? errosDaGrade(field.state.value) : {}}
              />
              <ErroDaLista erros={field.state.meta.errors} />
            </div>
          )}
        </form.AppField>
      </PainelGrade>

      <Painel titulo="Fila" descricao="Em que ordem o robô olha os exames pendentes a cada rodada.">
        <div className="flex flex-col gap-4">
          <form.AppField name="ordemFila" mode="array">
            {(lista) => {
              const usados = lista.state.value.map((i) => i.criterio);
              const faltam = ORDEM_CRITERIOS.filter((c) => !usados.includes(c));
              return (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">Ordem da fila</span>
                    <p className="text-muted-foreground text-[13px]">
                      O primeiro critério decide; os seguintes só desempatam.
                    </p>
                  </div>
                  <ol className="flex flex-col divide-y rounded-md border">
                    {lista.state.value.map((item, i) => (
                      <li key={item.criterio} className="flex flex-wrap items-end gap-3 p-3">
                        <form.AppField name={`ordemFila[${i}].direcao`}>
                          {(field) => (
                            <field.SelectField
                              label={`${i + 1}. ${CRITERIOS_FILA[item.criterio].rotulo}`}
                              placeholder="Escolha"
                              opcoes={Object.entries(CRITERIOS_FILA[item.criterio].direcoes).map(
                                ([valor, rotulo]) => ({
                                  valor,
                                  rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1),
                                }),
                              )}
                              className="flex-[1_1_200px]"
                            />
                          )}
                        </form.AppField>
                        <AcoesDaLinha
                          nome={CRITERIOS_FILA[item.criterio].rotulo.toLowerCase()}
                          indice={i}
                          total={lista.state.value.length}
                          ordenavel
                          onMover={(de, para) => lista.moveValue(de, para)}
                          onRemover={() => lista.removeValue(i)}
                        />
                      </li>
                    ))}
                  </ol>
                  <ErroDaLista erros={lista.state.meta.errors} />
                  {faltam.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {faltam.map((c) => (
                        <Button
                          key={c}
                          type="button"
                          onClick={() =>
                            lista.pushValue({ criterio: c, direcao: DIRECAO_PADRAO[c] })
                          }
                          className={buttonClassName({ variant: 'secondary' })}
                        >
                          <Plus size={16} aria-hidden />
                          {`Critério ${CRITERIOS_FILA[c].rotulo.toLowerCase()}`}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          </form.AppField>
          <form.AppField name="prazoCriticoMin">
            {(field) => (
              <field.NumberField
                label="Prazo crítico (minutos)"
                placeholder="Ex.: 60"
                description="Faltando menos que isso para vencer, o exame passa à frente dos clientes com prioridade."
                min={0}
                max={1440}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="agruparPorPaciente">
            {(field) => (
              <field.CheckboxField
                label="Exames do mesmo paciente vão juntos para um médico"
                description="Na mesma especialidade: o pacote não se parte entre médicos."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(s) => s.values.agruparPorPaciente}>
            {(agrupar) =>
              agrupar && (
                <form.AppField name="janelaPacienteHoras">
                  {(field) => (
                    <field.NumberField
                      label="Distância máxima entre os exames do pacote (horas)"
                      placeholder="Ex.: 0"
                      description="0: sem limite de tempo."
                      min={0}
                      max={720}
                      required
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
        </div>
      </Painel>

      <Painel titulo="Capacidade" descricao="Quanto o médico pode receber além do teto dele.">
        <div className="flex flex-col gap-4">
          <form.AppField name="toleranciaAcimaTeto">
            {(field) => (
              <field.NumberField
                label="Folga acima do teto (exames)"
                placeholder="Ex.: 0"
                description="Quantos exames a mais o médico pode receber para não quebrar um pacote."
                min={0}
                max={100}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="margemUrgenciaPct">
            {(field) => (
              <field.NumberField
                label="Margem acima do teto só para urgência (%)"
                placeholder="Ex.: 10"
                min={0}
                max={100}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="folgaProporcaoPct">
            {(field) => (
              <field.NumberField
                label="Folga da proporção para exame atrasado ou vencendo antes da próxima rodada (pontos %)"
                placeholder="Ex.: 20"
                description="Na frente dividida por modalidade, quanto o médico pode passar da proporção para não deixar o exame vencer. 100: ignora a proporção nesses casos."
                min={0}
                max={100}
                required
              />
            )}
          </form.AppField>
        </div>
      </Painel>

      <Painel titulo="Rodada" descricao="Quando o robô roda e quem entra em cada rodada.">
        <div className="flex flex-col gap-4">
          <form.AppField name="cicloMinutos">
            {(field) => (
              <field.NumberField
                label="Intervalo entre rodadas (minutos)"
                placeholder="Ex.: 30"
                min={1}
                max={1440}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="antecedenciaPeriodoMin">
            {(field) => (
              <field.NumberField
                label="Antecedência do turno (minutos)"
                placeholder="Ex.: 180"
                description="Um turno que ainda não começou já recebe exames esse tempo antes do início."
                min={0}
                max={1440}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="temTurnosPosteriores">
            {(field) => (
              <field.CheckboxField
                label="Há turnos que só recebem numa rodada mais tarde"
                description="Ex.: a Tarde, que enche de uma vez numa rodada da manhã."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(s) => s.values.temTurnosPosteriores}>
            {(tem) =>
              tem && (
                <>
                  <form.AppField name="turnoIds">
                    {() => <CaixasField label="Turnos posteriores" required opcoes={opcoesTurno} />}
                  </form.AppField>
                  <form.AppField name="cheiaEm">
                    {(field) => (
                      <field.TextField
                        label="Horário da rodada que enche esses turnos"
                        placeholder="10:50"
                        description="Dali em diante, a Lista não guarda mais nada para eles."
                        autoComplete="off"
                        required
                      />
                    )}
                  </form.AppField>
                </>
              )
            }
          </form.Subscribe>
          <div className="flex flex-col gap-3">
            <span className="font-medium">Recolher exames não abertos</span>
            <form.AppField name="recolhe">
              {(field) => (
                <field.CheckboxField
                  label="Devolver à fila o exame que o médico não abriu depois que o turno acabou"
                  description="Só nas frentes que recolhem."
                />
              )}
            </form.AppField>
          </div>
          <form.Subscribe selector={(s) => s.values.recolhe}>
            {(recolhe) =>
              recolhe && (
                <>
                  <form.AppField name="recolhimentoAposTurnoMin">
                    {(field) => (
                      <field.NumberField
                        label="Prazo para recolher, depois do fim do turno (minutos)"
                        placeholder="Ex.: 60"
                        description={dicaDoPrazo(field.state.value)}
                        min={0}
                        max={1440}
                        required
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="recolhimentoPorTurno" mode="array">
                    {(lista) => {
                      const escolhidos = lista.state.value.map((p) => p.turnoId);
                      const livres = turnos.filter((t) => !escolhidos.includes(t.id));
                      return (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">Prazo diferente por turno</span>
                            <p className="text-muted-foreground text-[13px]">
                              Os turnos sem prazo próprio usam o prazo padrão.
                            </p>
                          </div>
                          {lista.state.value.length > 0 && (
                            <ul className="flex flex-col divide-y rounded-md border">
                              {lista.state.value.map((_, i) => (
                                <li
                                  // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id.
                                  key={i}
                                  className="flex flex-wrap items-start gap-3 p-3"
                                >
                                  <form.AppField name={`recolhimentoPorTurno[${i}].turnoId`}>
                                    {(field) => (
                                      <field.SelectField
                                        label={`Turno ${i + 1}`}
                                        placeholder="Escolha o turno"
                                        required
                                        opcoes={turnosDoPrazo.map((o) => ({
                                          ...o,
                                          desabilitada:
                                            o.valor !== field.state.value &&
                                            escolhidos.includes(o.valor),
                                        }))}
                                        className="flex-[2_1_180px]"
                                      />
                                    )}
                                  </form.AppField>
                                  <form.AppField name={`recolhimentoPorTurno[${i}].minutos`}>
                                    {(field) => (
                                      <field.NumberField
                                        label={`Prazo do turno ${i + 1} (minutos)`}
                                        placeholder="Ex.: 1440"
                                        description={dicaDoPrazo(field.state.value)}
                                        min={0}
                                        max={10080}
                                        required
                                        className="flex-[1_1_140px]"
                                      />
                                    )}
                                  </form.AppField>
                                  <span className="self-start pt-7">
                                    <AcoesDaLinha
                                      nome={`prazo do turno ${i + 1}`}
                                      indice={i}
                                      total={lista.state.value.length}
                                      onRemover={() => lista.removeValue(i)}
                                    />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Button
                            type="button"
                            disabled={livres.length === 0}
                            onClick={() => lista.pushValue({ turnoId: '', minutos: '' })}
                            className={buttonClassName({
                              variant: 'secondary',
                              className: 'self-start',
                            })}
                          >
                            <Plus size={16} aria-hidden />
                            Turno
                          </Button>
                        </div>
                      );
                    }}
                  </form.AppField>
                </>
              )
            }
          </form.Subscribe>
          <form.AppField name="diasJaEntregue">
            {(field) => (
              <field.NumberField
                label="Não devolver ao mesmo médico por (dias)"
                placeholder="Ex.: 7"
                description="O exame que já foi entregue a um médico e voltou para a fila não vai de novo para ele nesse período."
                min={0}
                max={90}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="escalaRestringeEspecialidade">
            {(field) => (
              <field.CheckboxField
                label="O médico só recebe da frente em que está escalado"
                description="Desmarcado: a frente da escala não limita o que ele recebe no período."
              />
            )}
          </form.AppField>
        </div>
      </Painel>

      <Painel
        titulo="Equilíbrio"
        descricao="Exames que o robô divide por igual entre os médicos que podem laudá-los."
      >
        <form.AppField name="marcadores">
          {(field) => (
            <field.EtiquetasField
              label="Marcadores no nome do exame"
              placeholder="Ex.: ONCO"
              description="Exame com um destes no nome é dividido por igual. Maiúsculas não importam. Sem nenhum, nenhum exame é dividido."
              iguais={iguaisSemMaiusculas}
            />
          )}
        </form.AppField>
      </Painel>

      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <div className="flex flex-col items-end gap-2">
        <form.AppForm>
          <form.RequiredLegend />
          <form.SubmitButton pendingLabel="Salvando…">Salvar configuração</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
