import { Button } from '@base-ui/react/button';
import { NumberField } from '@base-ui/react/number-field';
import { Copy } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { z } from 'zod';

import type { DefinirEscalaFixaDto } from '../../gen/types/DefinirEscalaFixaDto';
import type { EscalaFixaDto } from '../../gen/types/EscalaFixaDto';
import { cn } from '../../lib/cn';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { RodapePainel } from '../catalogo/rodape-painel';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { FALHA_AO_SALVAR } from '../escala-config/comum';
import { controlClassName } from '../form/control-class';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import { Skeleton } from '../skeleton/Skeleton';
import { dataCurta, NOMES_DIAS, NOMES_DIAS_LONGOS } from './calendario';
import {
  alternarDiasUteis,
  celula,
  celulasDaGrade,
  DIAS_DA_GRADE,
  frentesComTurno,
  type Grade,
  gradeDasCelulas,
  marcar,
  mesmaProdutividadeNaLinha,
  mudarProdutividade,
  previa,
  turnosDaFrente,
} from './escala-fixa';

type TurnoDaEscalaFixa = {
  id: string;
  nome: string;
  cor: string | null;
  ordem: number;
  horarioInicio: string;
  horarioFim: string;
  frentes: { id: string }[];
};

export type PainelEscalaFixaProps = {
  medico: OpcaoBusca;
  hoje: string;
  /** Turnos e frentes que quem edita pode usar (o recorte, se houver). */
  turnos: TurnoDaEscalaFixa[];
  frentes: { id: string; rotulo: string }[];
  /** A grade atual de um médico numa frente. */
  buscarGrade: (medicoId: string, frenteId: string) => Promise<EscalaFixaDto>;
  /** Médicos para copiar a grade. */
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  onSalvar: (dados: DefinirEscalaFixaDto) => Promise<void>;
  onFechar: () => void;
};

const esquema = z.object({
  frenteId: z.string().min(1, 'Escolha a frente.'),
  aPartirDe: z.string().min(1, 'Informe a partir de quando vale.'),
});

/**
 * Monta a escala fixa de um médico numa frente: turnos × dias da semana, com a produtividade de
 * cada um. Salvar troca as alocações fixas simples dele na frente pelas da grade, a partir da data.
 */
export function PainelEscalaFixa({
  medico,
  hoje,
  turnos,
  frentes,
  buscarGrade,
  buscarMedicos,
  onSalvar,
  onFechar,
}: PainelEscalaFixaProps) {
  const [frenteId, setFrenteId] = useState('');
  // Edição da grade, presa à frente em que foi feita (trocar a frente volta à grade salva dela).
  const [edicao, setEdicao] = useState<{ frenteId: string; grade: Grade } | null>(null);
  const [erro, setErro] = useState<string>();
  const [copiando, setCopiando] = useState(false);
  const [copiadoDe, setCopiadoDe] = useState<string>();
  const copiarId = useId();

  const atual = useQuery({
    queryKey: ['escala-fixa', medico.valor, frenteId],
    queryFn: () => buscarGrade(medico.valor, frenteId),
    enabled: Boolean(frenteId),
    // A grade é editada aqui: não recarregar por baixo de quem edita.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const grade: Grade | undefined =
    edicao?.frenteId === frenteId
      ? edicao.grade
      : atual.data
        ? gradeDasCelulas(atual.data.celulas)
        : undefined;
  const gradeRef = useRef(grade);
  gradeRef.current = grade;

  const mudar = (fn: (g: Grade) => Grade) => {
    if (grade) setEdicao({ frenteId, grade: fn(grade) });
  };

  const form = useAppForm({
    defaultValues: { frenteId: '', aPartirDe: hoje },
    validators: { onSubmit: esquema },
    onSubmit: async ({ value }) => {
      const atualGrade = gradeRef.current;
      if (!atualGrade) return;
      setErro(undefined);
      try {
        await onSalvar({
          frenteId: value.frenteId,
          aPartirDe: value.aPartirDe,
          celulas: celulasDaGrade(atualGrade),
        });
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });

  const opcoesFrentes = frentesComTurno(frentes, turnos).map((f) => ({
    valor: f.id,
    rotulo: f.rotulo,
  }));
  const linhas = frenteId ? turnosDaFrente(turnos, frenteId) : [];

  const copiar = async (outro: OpcaoBusca | null) => {
    if (!outro || !frenteId) return;
    setErro(undefined);
    try {
      const dele = await buscarGrade(outro.valor, frenteId);
      setEdicao({ frenteId, grade: gradeDasCelulas(dele.celulas) });
      setCopiadoDe(outro.rotulo);
      setCopiando(false);
    } catch (falha) {
      setErro(
        mensagemDaApi(
          falha,
          `Não foi possível carregar a escala de ${outro.rotulo}. Tente de novo.`,
        ),
      );
    }
  };

  return (
    <PainelLateral
      titulo="Montar escala"
      subtitulo={medico.rotulo}
      largura="larga"
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
        <div className="flex flex-wrap gap-4">
          <form.AppField
            name="frenteId"
            listeners={{
              onChange: ({ value }) => {
                setFrenteId(value);
                setEdicao(null);
                setCopiadoDe(undefined);
                setCopiando(false);
              },
            }}
          >
            {(field) => (
              <field.SelectField
                label="Frente"
                placeholder="Escolha a frente"
                opcoes={opcoesFrentes}
                required
                className="flex-[1_1_180px]"
              />
            )}
          </form.AppField>
          <form.AppField name="aPartirDe">
            {(field) => (
              <field.TextField
                type="date"
                label="A partir de"
                placeholder="AAAA-MM-DD"
                required
                className="flex-[1_1_150px]"
              />
            )}
          </form.AppField>
        </div>

        {!frenteId ? (
          <p className="text-muted-foreground bg-muted rounded-md p-3 text-[13px]">
            Escolha a frente para ver a grade.
          </p>
        ) : !grade ? (
          atual.isError ? (
            <div className="flex flex-col items-start gap-3">
              <Alerta tom="erro">Não foi possível carregar a escala desta frente.</Alerta>
              <Button
                type="button"
                onClick={() => void atual.refetch()}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Tentar de novo
              </Button>
            </div>
          ) : (
            <div aria-busy className="flex flex-col gap-3">
              <span className="sr-only">Carregando a escala da frente…</span>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )
        ) : (
          <>
            {(atual.data?.foraDaGrade ?? 0) > 0 && (
              <Alerta tom="info" role="note">
                {atual.data?.foraDaGrade === 1
                  ? '1 alocação com regras especiais'
                  : `${atual.data?.foraDaGrade} alocações com regras especiais`}{' '}
                (semanas do mês, horário diferente, recortes, período único, gratificado ou
                cobertura) não {atual.data?.foraDaGrade === 1 ? 'aparece' : 'aparecem'} aqui e
                {atual.data?.foraDaGrade === 1 ? ' continua' : ' continuam'} valendo; edite-as pelo
                plantão.
              </Alerta>
            )}

            <div className="flex flex-col gap-2">
              {copiando ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={copiarId} className="font-medium">
                    Copiar de
                  </label>
                  <div className="flex gap-2">
                    <BuscaSelecao
                      id={copiarId}
                      chave="medicos-escala"
                      buscar={buscarMedicos}
                      valor={null}
                      onMudar={(opcao) => void copiar(opcao)}
                      placeholder="Buscar médico pelo nome"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() => setCopiando(false)}
                      className={buttonClassName({ variant: 'ghost' })}
                    >
                      Cancelar
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-[13px]">
                    Troca a grade abaixo pela do médico escolhido nesta frente. Nada é salvo até
                    você salvar.
                  </p>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setCopiando(true)}
                  className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
                >
                  <Copy size={16} aria-hidden />
                  Copiar de outro médico
                </Button>
              )}
              {copiadoDe && (
                <p className="text-muted-foreground text-[13px]" aria-live="polite">
                  Copiado de {copiadoDe}. Confira e salve para valer.
                </p>
              )}
            </div>

            {linhas.length === 0 ? (
              <p className="text-muted-foreground bg-muted rounded-md p-3 text-[13px]">
                Nenhum turno tem esta frente. Ligue a frente a um turno em Configurações › Escala
                médica.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b">
                      <th
                        scope="col"
                        className="text-subtle-foreground px-3 py-2 text-[13px] font-medium"
                      >
                        Turno
                      </th>
                      {DIAS_DA_GRADE.map((dia) => (
                        <th
                          key={dia}
                          scope="col"
                          className="text-subtle-foreground px-0.5 py-2 text-center text-[13px] font-medium"
                        >
                          <abbr title={NOMES_DIAS_LONGOS[dia]} className="no-underline">
                            {NOMES_DIAS[dia]}
                          </abbr>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {linhas.map((t) => (
                      <LinhaTurno key={t.id} turno={t} grade={grade} onMudar={mudar} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Previa grade={grade} turnos={turnos} aPartirDe={form.state.values.aPartirDe} />
          </>
        )}

        <form.AppForm>
          <RodapePainel rotuloCriar="Salvar escala" editando={false} onCancelar={onFechar} />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}

function LinhaTurno({
  turno: t,
  grade,
  onMudar,
}: {
  turno: TurnoDaEscalaFixa;
  grade: Grade;
  onMudar: (fn: (g: Grade) => Grade) => void;
}) {
  const marcadas = DIAS_DA_GRADE.filter((d) => celula(grade, t.id, d).marcada).length;
  const atalho = buttonClassName({
    variant: 'ghost',
    className: 'h-7 px-1.5 text-[13px] whitespace-nowrap',
  });
  return (
    <tr>
      <th scope="row" className="px-3 py-2 align-top font-normal">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span
            aria-hidden
            className="border-border size-2.5 flex-none rounded-full border"
            style={t.cor ? { backgroundColor: t.cor, borderColor: t.cor } : undefined}
          />
          <span className="font-medium">{t.nome}</span>
        </span>
        <span className="text-muted-foreground block pl-[18px] text-[12px] tabular-nums">
          {t.horarioInicio}–{t.horarioFim}
        </span>
        <span className="flex pl-3">
          <Button
            type="button"
            aria-label={`Marcar ou desmarcar Seg–Sex em ${t.nome}`}
            onClick={() => onMudar((g) => alternarDiasUteis(g, t.id))}
            className={atalho}
          >
            Seg–Sex
          </Button>
          <Button
            type="button"
            aria-label={`Mesma produtividade na linha ${t.nome}`}
            disabled={marcadas < 2}
            focusableWhenDisabled
            onClick={() => onMudar((g) => mesmaProdutividadeNaLinha(g, t.id))}
            className={atalho}
          >
            Mesma produtividade
          </Button>
        </span>
      </th>
      {DIAS_DA_GRADE.map((dia) => {
        const c = celula(grade, t.id, dia);
        const nome = `${t.nome}, ${NOMES_DIAS_LONGOS[dia]?.toLowerCase()}`;
        return (
          <td key={dia} className="px-0.5 py-2 align-top">
            <span className="flex h-8 items-center gap-1">
              <CaixaDeSelecao
                aria-label={nome}
                checked={c.marcada}
                onCheckedChange={(marcada) => onMudar((g) => marcar(g, t.id, dia, marcada))}
              />
              <NumberField.Root
                value={c.produtividade}
                onValueChange={(valor) =>
                  onMudar((g) => mudarProdutividade(g, t.id, dia, valor ?? null))
                }
                min={0}
                step={1}
                disabled={!c.marcada}
                format={{ useGrouping: false, maximumFractionDigits: 0 }}
                locale="pt-BR"
                className="w-10"
              >
                <NumberField.Input
                  aria-label={`Produtividade de ${nome}`}
                  placeholder="–"
                  className={controlClassName('app', 'h-8 px-1 text-center tabular-nums')}
                />
              </NumberField.Root>
            </span>
          </td>
        );
      })}
    </tr>
  );
}

function Previa({
  grade,
  turnos,
  aPartirDe,
}: {
  grade: Grade;
  turnos: TurnoDaEscalaFixa[];
  aPartirDe: string;
}) {
  const itens = previa(celulasDaGrade(grade), turnos);
  const titulo = `Vai virar ${itens.length} ${itens.length === 1 ? 'alocação' : 'alocações'}`;
  const tituloId = useId();
  return (
    <section aria-labelledby={tituloId} className="bg-muted flex flex-col gap-2 rounded-md p-3">
      <h3 id={tituloId} className="font-medium">
        {titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          A grade fica vazia: as alocações da grade nesta frente deixam de valer
          {aPartirDe ? ` a partir de ${dataCurta(aPartirDe)}` : ''}.
        </p>
      ) : (
        <ul className={cn('flex flex-col gap-1 text-[13px] tabular-nums')}>
          {itens.map((i) => (
            <li key={i.chave}>{i.texto}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
