import { Button } from '@base-ui/react/button';
import { Play } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { RecolhimentoPrevistoDto } from '../../gen/types/RecolhimentoPrevistoDto';
import type { RecortesRodadaDto } from '../../gen/types/RecortesRodadaDto';
import { horaDeBrasilia } from '../../lib/acesso';
import { num, recolhimentoPrevistoEmTexto } from '../../lib/rodada';
import { Alerta } from '../alerta/Alerta';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import {
  esquemaDistribuir,
  estimativa,
  examesNasFrentes,
  frentesDoTipo,
  opcoesSubespecialidade,
  recortesDoFormulario,
  type ValoresDistribuir,
} from './distribuir-agora';

const OPCOES_CLIENTES = [
  { valor: 'todos', rotulo: 'Todos os clientes' },
  { valor: 'alguns', rotulo: 'Só alguns clientes' },
];

/**
 * "Distribuir agora": os recortes da rodada num painel lateral (a fila continua à vista). Vêm
 * marcados os turnos em andamento, todas as frentes, prioridades e subespecialidades. Nada é atribuído antes da
 * aprovação: o robô lê a fila e monta a proposta.
 */
export function PainelDistribuirAgora({
  fila,
  recolhimento,
  onFechar,
  onDistribuir,
  buscarClientes,
  buscarMedicos,
}: {
  fila: FilaDoMomentoDto;
  /** Quantos a rodada recolheria agora; undefined = ainda contando. */
  recolhimento?: RecolhimentoPrevistoDto;
  onFechar: () => void;
  onDistribuir: (recortes: RecortesRodadaDto) => Promise<void>;
  buscarClientes: (termo: string) => Promise<OpcaoBusca[]>;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
}) {
  const { erro, tentar } = useErroDoPainel();
  const temTurnos = fila.turnos.length > 0;
  const comMedicos = new Set(fila.medicosEmTurno.map((m) => m.turnoId));
  const subespecialidades = opcoesSubespecialidade(fila);
  const frentesEspecialidade = frentesDoTipo(fila, 'especialidade');
  const frentesModalidade = frentesDoTipo(fila, 'modalidade');
  const form = useAppForm({
    defaultValues: {
      turnoIds: fila.turnos.filter((t) => t.emAndamento && t.medicos > 0).map((t) => t.turnoId),
      frentesEspecialidade: frentesEspecialidade.map((f) => f.frenteId),
      frentesModalidade: frentesModalidade.map((f) => f.frenteId),
      prioridadeIds: fila.prioridades.flatMap((p) =>
        p.prioridadeOperacaoId ? [p.prioridadeOperacaoId] : [],
      ),
      subespecialidadeIds: subespecialidades.map((o) => o.valor),
      clientesDaRodada: 'todos',
      clientes: [],
      tirar: [],
      incluir: [],
    } as ValoresDistribuir,
    validators: {
      onSubmit: esquemaDistribuir({
        temTurnos,
        temFrentes: frentesEspecialidade.length + frentesModalidade.length > 0,
        temPrioridades: fila.prioridades.some((p) => p.prioridadeOperacaoId),
        temSubespecialidades: subespecialidades.length > 0,
      }),
    },
    onSubmit: ({ value }) => tentar(() => onDistribuir(recortesDoFormulario(value, fila))),
  });
  const soAlgunsClientes = useStore(
    form.store,
    (estado) => estado.values.clientesDaRodada === 'alguns',
  );
  const medicosEmTurno = [...new Map(fila.medicosEmTurno.map((m) => [m.medicoId, m])).values()];

  return (
    <PainelLateral
      titulo="Distribuir agora"
      subtitulo={`O robô lê a fila de novo com estes recortes e monta uma proposta. As contagens abaixo são da leitura das ${horaDeBrasilia(fila.lidaEm)}.`}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex min-h-[calc(100dvh-73px)] flex-col"
      >
        <div className="flex flex-1 flex-col gap-6 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-[13px]">
              Nada é atribuído antes da aprovação. O paciente não se divide: se um exame dele entra,
              os outros da mesma frente vão junto.
            </p>
            <p className="text-subtle-foreground text-xs">
              <span aria-hidden className="text-destructive">
                *
              </span>{' '}
              Campo obrigatório
            </p>
          </div>
          {temTurnos ? (
            <form.AppField name="turnoIds">
              {(field) => (
                <field.CaixasComContagemField
                  label="Turnos"
                  required
                  description="Vêm marcados os turnos em andamento."
                  opcoes={fila.turnos.map((t) => ({
                    valor: t.turnoId,
                    rotulo: (
                      <ComCor cor={t.cor}>
                        {t.nome}{' '}
                        <span className="text-subtle-foreground tabular-nums">
                          {horaDeBrasilia(t.inicio)} a {horaDeBrasilia(t.fim)}
                        </span>
                      </ComCor>
                    ),
                    desabilitada: !comMedicos.has(t.turnoId) && t.medicos === 0,
                    contagem:
                      t.medicos === 0
                        ? 'ninguém no robô'
                        : t.emAndamento
                          ? `${t.medicos} ${t.medicos === 1 ? 'médico' : 'médicos'}`
                          : `começa às ${horaDeBrasilia(t.inicio)}`,
                  }))}
                />
              )}
            </form.AppField>
          ) : (
            <Alerta tom="info" role="note">
              Nenhum turno da escala hoje com médico habilitado no robô. Inclua médicos fora de
              turno abaixo ou confira a escala.
            </Alerta>
          )}
          {frentesEspecialidade.length > 0 && (
            <form.AppField name="frentesEspecialidade">
              {(field) => (
                <field.CaixasComContagemField
                  label="Frentes de especialidade"
                  required
                  todos={{
                    rotulo: 'Todas as especialidades',
                    contagem: num(
                      examesNasFrentes(
                        fila,
                        frentesEspecialidade.map((f) => f.frenteId),
                      ),
                    ),
                  }}
                  opcoes={frentesEspecialidade.map((f) => ({
                    valor: f.frenteId,
                    rotulo: <ComCor cor={f.cor}>{f.nome}</ComCor>,
                    contagem: num(f.exames),
                  }))}
                />
              )}
            </form.AppField>
          )}
          {frentesModalidade.length > 0 && (
            <form.AppField name="frentesModalidade">
              {(field) => (
                <field.CaixasComContagemField
                  label="Frentes de modalidade"
                  required={frentesEspecialidade.length === 0}
                  colunas={2}
                  todos={{
                    rotulo: 'Todas as modalidades',
                    contagem: num(
                      examesNasFrentes(
                        fila,
                        frentesModalidade.map((f) => f.frenteId),
                      ),
                    ),
                  }}
                  opcoes={frentesModalidade.map((f) => ({
                    valor: f.frenteId,
                    rotulo: <ComCor cor={f.cor}>{f.nome}</ComCor>,
                    contagem: num(f.exames),
                  }))}
                  description={
                    frentesEspecialidade.length > 0
                      ? 'O exame conta na frente da especialidade e na da modalidade; marcar uma delas já o leva.'
                      : undefined
                  }
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="prioridadeIds">
            {(field) => (
              <field.CaixasComContagemField
                label="Prioridades da operação"
                required
                opcoes={fila.prioridades.flatMap((p) =>
                  p.prioridadeOperacaoId
                    ? [
                        {
                          valor: p.prioridadeOperacaoId,
                          rotulo: <ComCor cor={p.cor}>{p.nome}</ComCor>,
                          contagem: num(p.exames),
                        },
                      ]
                    : [],
                )}
              />
            )}
          </form.AppField>
          {subespecialidades.length > 0 && (
            <form.AppField name="subespecialidadeIds">
              {(field) => (
                <field.CaixasComContagemField
                  label="Subespecialidades"
                  required
                  colunas={2}
                  todos={{ rotulo: 'Todas as subespecialidades' }}
                  opcoes={subespecialidades.map((o) => ({
                    valor: o.valor,
                    rotulo: <ComCor cor={o.cor}>{o.rotulo}</ComCor>,
                    contagem: num(o.exames),
                  }))}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="clientesDaRodada">
            {(field) => (
              <field.SelectField
                label="Clientes"
                placeholder="Escolha"
                required
                opcoes={OPCOES_CLIENTES}
                description="Escolha clientes só para distribuir parte da fila."
              />
            )}
          </form.AppField>
          {soAlgunsClientes && (
            <form.AppField name="clientes">
              {(field) => (
                <field.EscolhidosField
                  label="Só estes clientes"
                  required
                  chave="clientes-da-rodada"
                  buscar={buscarClientes}
                  placeholder="Buscar cliente"
                  vazio="Nenhum cliente escolhido"
                />
              )}
            </form.AppField>
          )}
          <div className="flex flex-col gap-4">
            <span className="font-medium">Médicos</span>
            <form.AppField name="tirar">
              {(field) => (
                <field.SelecaoMultiplaField
                  label="Tirar desta rodada"
                  placeholder="Ninguém"
                  opcoes={medicosEmTurno.map((m) => ({ valor: m.medicoId, rotulo: m.nome }))}
                  description="Entram os habilitados em turno nos turnos marcados, menos estes."
                />
              )}
            </form.AppField>
            <form.AppField name="incluir">
              {(field) => (
                <field.EscolhidosField
                  label="Incluir fora de turno"
                  chave="medicos-da-rodada"
                  buscar={buscarMedicos}
                  placeholder="Ex.: Camila Fontes Rezende"
                  description="Quem for incluído recebe mesmo fora do turno, só no que lauda e até o teto do dia."
                />
              )}
            </form.AppField>
          </div>
          {erro && <Alerta tom="erro">{erro}</Alerta>}
        </div>
        <div className="bg-card sticky bottom-0 flex flex-col gap-3 border-t px-4 py-3">
          <p className="text-muted-foreground text-[13px] tabular-nums">
            {recolhimentoPrevistoEmTexto(recolhimento) ?? 'Contando os exames a recolher…'}
          </p>
          <form.Subscribe selector={(s) => s.values}>
            {(v) => {
              const e = estimativa(v, fila);
              return (
                <p className="text-[13px] tabular-nums" aria-live="polite">
                  <strong className="font-semibold">Cerca de {num(e.exames)} exames</strong>{' '}
                  <span className="text-muted-foreground">
                    para {num(e.medicos)} {e.medicos === 1 ? 'médico' : 'médicos'}
                  </span>
                </p>
              );
            }}
          </form.Subscribe>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={onFechar}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Cancelar
            </Button>
            <form.AppForm>
              <form.SubmitButton pendingLabel="Pedindo…">
                <Play size={16} aria-hidden />
                Distribuir agora
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </div>
      </form>
    </PainelLateral>
  );
}

/** Rótulo de caixa com a bolinha da cor cadastrada antes (frente, prioridade, turno, segmento). */
function ComCor({ cor, children }: { cor: string | null; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <BolinhaCor cor={cor} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
