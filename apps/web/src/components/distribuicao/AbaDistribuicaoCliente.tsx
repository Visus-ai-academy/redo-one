import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { prioridadesClienteControllerSalvar } from '../../gen/clients/prioridadesClienteControllerSalvar';
import { opcoesControllerListasQueryOptions } from '../../gen/hooks/useOpcoesControllerListas';
import { prioridadesClienteControllerObterQueryOptions } from '../../gen/hooks/usePrioridadesClienteControllerObter';
import type { OpcaoComCorDto } from '../../gen/types/OpcaoComCorDto';
import type { PrioridadeClienteDto } from '../../gen/types/PrioridadeClienteDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';
import type { OpcaoSelect } from '../select/Select';
import { useAvisos } from '../toast/use-avisos';
import { AbaCarregando, AbaComErro } from './estados';
import { AcoesDaLinha, ItemDaLista, Secao } from './partes-form';

const NIVEIS = [
  { valor: '1', rotulo: 'Alta' },
  { valor: '2', rotulo: 'Média' },
];
const rotuloNivel = (nivel: number) => (nivel === 1 ? 'Alta' : 'Média');

/** "E:<id>" ou "M:<id>": a frente numa escolha só. */
const chaveDa = (p: PrioridadeClienteDto) =>
  p.especialidadeId ? `E:${p.especialidadeId}` : `M:${p.modalidadeId}`;

const esquema = z.object({
  itens: z
    .array(z.object({ frente: z.string(), nivel: z.enum(['1', '2']) }))
    .superRefine((itens, ctx) => {
      const vistas = new Set<string>();
      itens.forEach((item, i) => {
        if (!item.frente) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'frente'],
            message: 'Escolha a especialidade ou a modalidade.',
          });
        } else if (vistas.has(item.frente)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'frente'],
            message: 'Esta frente já está na lista.',
          });
        }
        vistas.add(item.frente);
      });
    }),
});

function nomeDaFrente(
  p: PrioridadeClienteDto,
  c: { especialidades: RotuloDto[]; modalidades: RotuloDto[] },
) {
  const lista = p.especialidadeId ? c.especialidades : c.modalidades;
  const id = p.especialidadeId ?? p.modalidadeId;
  return lista.find((x) => x.id === id)?.nome ?? '(fora do catálogo)';
}

/**
 * Aba "Distribuição" do painel do cliente: em que frentes os exames dele passam à frente dos de
 * outros clientes na fila do robô (Alta antes de Média; sem linha, a ordem comum).
 */
export function AbaDistribuicaoCliente({
  clienteId,
  podeEditar,
}: {
  clienteId: string;
  /** `clientes.distribuicao.editar`. */
  podeEditar: boolean;
}) {
  const opcoes = prioridadesClienteControllerObterQueryOptions({ path: { clienteId } });
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
        Não foi possível carregar a prioridade do cliente agora.
      </AbaComErro>
    );
  }
  if (!consulta.data || !catalogo.data) return <AbaCarregando />;
  const { prioridades } = consulta.data;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Secao
        titulo="Prioridade na fila"
        ajuda="Nestas frentes, os exames do cliente passam à frente dos de outros clientes na fila do robô: Alta antes de Média. A urgência e o exame perto de vencer continuam primeiro."
      >
        {podeEditar ? (
          <FormPrioridades
            clienteId={clienteId}
            prioridades={prioridades}
            catalogo={catalogo.data}
            queryKey={opcoes.queryKey}
          />
        ) : prioridades.length === 0 ? (
          <p className="text-muted-foreground">
            Sem prioridade: o cliente segue a ordem comum da fila.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {[...prioridades]
              .sort((a, b) => a.nivel - b.nivel)
              .map((p) => (
                <li key={chaveDa(p)} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{nomeDaFrente(p, catalogo.data)}</span>
                    <span className="text-muted-foreground text-[13px]">
                      {p.especialidadeId ? 'Especialidade' : 'Modalidade'}
                    </span>
                  </span>
                  <Etiqueta tom={p.nivel === 1 ? 'atencao' : 'info'}>
                    {rotuloNivel(p.nivel)}
                  </Etiqueta>
                </li>
              ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

function FormPrioridades({
  clienteId,
  prioridades,
  catalogo,
  queryKey,
}: {
  clienteId: string;
  prioridades: PrioridadeClienteDto[];
  catalogo: { especialidades: OpcaoComCorDto[]; modalidades: OpcaoComCorDto[] };
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const opcoesFrente: OpcaoSelect[] = [
    ...catalogo.especialidades.map((e) => ({
      valor: `E:${e.id}`,
      rotulo: e.nome,
      cor: e.cor,
      grupo: 'Especialidades',
    })),
    ...catalogo.modalidades.map((m) => ({
      valor: `M:${m.id}`,
      rotulo: m.nome,
      cor: m.cor,
      grupo: 'Modalidades',
    })),
  ];
  // Frente que saiu do catálogo ativo continua à vista para poder ser tirada.
  for (const p of prioridades) {
    if (!opcoesFrente.some((o) => o.valor === chaveDa(p))) {
      opcoesFrente.push({ valor: chaveDa(p), rotulo: '(fora do catálogo)', grupo: 'Inativas' });
    }
  }

  const form = useAppForm({
    defaultValues: {
      itens: prioridades.map((p) => ({ frente: chaveDa(p), nivel: String(p.nivel) as '1' | '2' })),
    },
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      tentar(async () => {
        await prioridadesClienteControllerSalvar({
          path: { clienteId },
          body: {
            prioridades: value.itens.map((item) => {
              const id = item.frente.slice(2);
              const especialidade = item.frente.startsWith('E:');
              return {
                especialidadeId: especialidade ? id : null,
                modalidadeId: especialidade ? null : id,
                nivel: Number(item.nivel),
              };
            }),
          },
        }).unwrap();
        await queryClient.invalidateQueries({ queryKey });
        avisos.sucesso('Prioridades do cliente salvas.');
      }),
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3"
    >
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <form.AppField name="itens" mode="array">
        {(lista) => (
          <>
            {lista.state.value.length === 0 ? (
              <p className="text-muted-foreground">
                Sem prioridade: o cliente segue a ordem comum da fila.
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border">
                {lista.state.value.map((_, i) => (
                  <ItemDaLista
                    // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id.
                    key={i}
                    titulo={`Frente ${i + 1}`}
                    acoes={
                      <AcoesDaLinha
                        nome={`frente ${i + 1}`}
                        indice={i}
                        total={lista.state.value.length}
                        onRemover={() => lista.removeValue(i)}
                      />
                    }
                  >
                    <div className="flex flex-wrap gap-4">
                      <form.AppField name={`itens[${i}].frente`}>
                        {(field) => (
                          <field.SelectField
                            label={`Frente ${i + 1}`}
                            placeholder="Escolha"
                            required
                            opcoes={opcoesFrente}
                            className="flex-[2_1_160px]"
                          />
                        )}
                      </form.AppField>
                      <form.AppField name={`itens[${i}].nivel`}>
                        {(field) => (
                          <field.SelectField
                            label={`Nível da frente ${i + 1}`}
                            placeholder="Escolha"
                            required
                            opcoes={NIVEIS}
                            className="flex-[1_1_120px]"
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
              onClick={() => lista.pushValue({ frente: '', nivel: '1' })}
              className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
            >
              <Plus size={16} aria-hidden />
              Adicionar frente
            </Button>
          </>
        )}
      </form.AppField>
      <div className="flex flex-col items-end gap-2 border-t pt-4">
        <form.AppForm>
          <form.RequiredLegend />
          <form.SubmitButton pendingLabel="Salvando…">Salvar prioridades</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
