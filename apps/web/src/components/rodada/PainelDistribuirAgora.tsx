import { Button } from '@base-ui/react/button';
import { Play } from '@phosphor-icons/react';
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
  opcoesSubespecialidade,
  recortesDoFormulario,
  type ValoresDistribuir,
} from './distribuir-agora';

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
  const form = useAppForm({
    defaultValues: {
      turnoIds: fila.turnos.filter((t) => t.emAndamento && t.medicos > 0).map((t) => t.turnoId),
      frenteIds: fila.porFrente.flatMap((f) => (f.frenteId ? [f.frenteId] : [])),
      prioridadeIds: fila.prioridades.flatMap((p) =>
        p.prioridadeOperacaoId ? [p.prioridadeOperacaoId] : [],
      ),
      subespecialidadeIds: subespecialidades.map((o) => o.valor),
      clientes: [],
      tirar: [],
      incluir: [],
    } as ValoresDistribuir,
    validators: { onSubmit: esquemaDistribuir(temTurnos) },
    onSubmit: ({ value }) => tentar(() => onDistribuir(recortesDoFormulario(value, fila))),
  });
  const medicosEmTurno = [...new Map(fila.medicosEmTurno.map((m) => [m.medicoId, m])).values()];

  return (
    <PainelLateral
      titulo="Distribuir agora"
      subtitulo="O robô lê a fila com estes recortes e monta uma proposta."
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
          <p className="text-muted-foreground text-[13px]">
            Nada é atribuído antes da aprovação. O paciente não se divide: se um exame dele entra,
            os outros da mesma frente vão junto.
          </p>
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
                      <>
                        {t.nome}{' '}
                        <span className="text-subtle-foreground tabular-nums">
                          {horaDeBrasilia(t.inicio)} a {horaDeBrasilia(t.fim)}
                        </span>
                      </>
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
          {fila.porFrente.some((f) => f.frenteId) && (
            <form.AppField name="frenteIds">
              {(field) => (
                <field.CaixasComContagemField
                  label="Frentes"
                  colunas={2}
                  todos={{ rotulo: 'Todas as frentes', contagem: `${num(fila.total)} exames` }}
                  opcoes={fila.porFrente.flatMap((f) =>
                    f.frenteId
                      ? [{ valor: f.frenteId, rotulo: f.nome, contagem: num(f.exames) }]
                      : [],
                  )}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="prioridadeIds">
            {(field) => (
              <field.CaixasComContagemField
                label="Prioridades da operação"
                opcoes={fila.prioridades.flatMap((p) =>
                  p.prioridadeOperacaoId
                    ? [{ valor: p.prioridadeOperacaoId, rotulo: p.nome, contagem: num(p.exames) }]
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
                  colunas={2}
                  todos={{ rotulo: 'Todas as subespecialidades' }}
                  opcoes={subespecialidades.map((o) => ({
                    valor: o.valor,
                    rotulo: (
                      <span className="flex items-center gap-2">
                        <BolinhaCor cor={o.cor} />
                        {o.rotulo}
                      </span>
                    ),
                    contagem: num(o.exames),
                  }))}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="clientes">
            {(field) => (
              <field.EscolhidosField
                label="Clientes"
                chave="clientes-da-rodada"
                buscar={buscarClientes}
                placeholder="Buscar cliente"
                vazio="Todos os clientes"
                description="Escolha clientes só para distribuir parte da fila."
              />
            )}
          </form.AppField>
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
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] tabular-nums">
                    <strong className="font-semibold">Cerca de {num(e.exames)} exames</strong>{' '}
                    <span className="text-muted-foreground">
                      para {num(e.medicos)} {e.medicos === 1 ? 'médico' : 'médicos'}
                    </span>
                  </span>
                  {temTurnos && (
                    <span className="text-subtle-foreground text-xs">
                      <span aria-hidden className="text-destructive">
                        *
                      </span>{' '}
                      Campo obrigatório
                    </span>
                  )}
                </div>
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
