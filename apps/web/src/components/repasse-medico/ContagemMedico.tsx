import { Button } from '@base-ui/react/button';
import { Plus, Trash } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo } from 'react';
import { z } from 'zod';

import { regrasMedicoControllerCancelarContagem } from '../../gen/clients/regrasMedicoControllerCancelarContagem';
import { regrasMedicoControllerNovaContagem } from '../../gen/clients/regrasMedicoControllerNovaContagem';
import { precosRepasseControllerOpcoesQueryOptions } from '../../gen/hooks/usePrecosRepasseControllerOpcoes';
import {
  regrasMedicoControllerContagemQueryKey,
  regrasMedicoControllerContagemQueryOptions,
} from '../../gen/hooks/useRegrasMedicoControllerContagem';
import type { ContagemMedicoDto } from '../../gen/types/ContagemMedicoDto';
import type { ModoContagemRepasseKey } from '../../gen/types/ModoContagemRepasse';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { AbaComErro } from '../distribuicao/estados';
import { mesAno } from '../faturamento/competencias';
import { HistoricoVigencias } from '../faturamento/historico-vigencias';
import { opcoesAPartirDe, TODOS_OS_CLIENTES } from '../faturamento/precos';
import { MarcaObrigatorio } from '../form/field-parts';
import { useAppForm } from '../form/form';
import { RequiredLegend } from '../form/RequiredLegend';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { Select } from '../select/Select';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';
import { AJUDA_MODO, descreverContagem, ROTULO_MODO } from './textos';

const TODAS_AS_ESPECIALIDADES = 'todas';

type Recorte = { cliente: string; especialidade: string };
type Valores = { modo: string; recortes: Recorte[]; aPartirDe: string };

const esquema = z
  .object({
    modo: z.string().min(1, 'Escolha como os laudos contam.'),
    recortes: z.array(z.object({ cliente: z.string(), especialidade: z.string() })),
    aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual vale.'),
  })
  .superRefine((v, ctx) => {
    if (v.modo !== 'recortes') return;
    if (!v.recortes.length)
      ctx.addIssue({ code: 'custom', path: ['recortes'], message: 'Inclua ao menos um recorte.' });
    else if (v.recortes.some((r) => !r.cliente || !r.especialidade))
      ctx.addIssue({
        code: 'custom',
        path: ['recortes'],
        message: 'Escolha o cliente e a especialidade de cada recorte (ou "Todos"/"Todas").',
      });
    else if (
      v.recortes.some(
        (r) => r.cliente === TODOS_OS_CLIENTES && r.especialidade === TODAS_AS_ESPECIALIDADES,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['recortes'],
        message:
          'Todos os clientes com todas as especialidades é o mesmo que "Todos os laudos": escolha essa opção.',
      });
    else if (
      new Set(v.recortes.map((r) => `${r.cliente}|${r.especialidade}`)).size !== v.recortes.length
    )
      ctx.addIssue({ code: 'custom', path: ['recortes'], message: 'Há recortes repetidos.' });
  });

/**
 * "Como os laudos contam" no repasse do médico: a versão em vigor, a nova versão (com "Vale a partir
 * de") e o histórico, onde a versão programada criada por engano se cancela.
 */
export function ContagemMedico({
  medicoId,
  podeEditar,
}: {
  medicoId: string;
  podeEditar: boolean;
}) {
  const consulta = useQuery(regrasMedicoControllerContagemQueryOptions({ path: { medicoId } }));
  const opcoes = useQuery(precosRepasseControllerOpcoesQueryOptions());
  if (consulta.isError || opcoes.isError)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void consulta.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar as regras agora.
      </AbaComErro>
    );
  if (!consulta.data || !opcoes.data) return <CamposCarregando quantidade={3} />;
  return (
    <Conteudo
      medicoId={medicoId}
      podeEditar={podeEditar}
      dados={consulta.data}
      clientes={opcoes.data.clientes}
      especialidades={opcoes.data.especialidades}
    />
  );
}

function Conteudo({
  medicoId,
  podeEditar,
  dados,
  clientes,
  especialidades,
}: {
  medicoId: string;
  podeEditar: boolean;
  dados: ContagemMedicoDto;
  clientes: { id: string; nome: string }[];
  especialidades: { id: string; nome: string }[];
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const idRecortes = useId();
  const emVigor = dados.versoes.find(
    (v) =>
      (v.vigenciaDesde === null || v.vigenciaDesde <= dados.mesAtual) &&
      (v.vigenciaAte === null || v.vigenciaAte >= dados.mesAtual),
  );
  const iniciais = useMemo<Valores>(
    () => ({
      modo: '',
      recortes: [],
      aPartirDe: dados.aPartirDeSugerido,
    }),
    [dados.aPartirDeSugerido],
  );
  const recarregar = () =>
    queryClient.invalidateQueries({
      queryKey: regrasMedicoControllerContagemQueryKey({ path: { medicoId } }),
    });
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value, formApi }) =>
      tentar(async () => {
        const v = value as Valores;
        await regrasMedicoControllerNovaContagem({
          path: { medicoId },
          body: {
            aPartirDe: v.aPartirDe,
            modo: v.modo as ModoContagemRepasseKey,
            recortes:
              v.modo === 'recortes'
                ? v.recortes.map((r) => ({
                    todosClientes: r.cliente === TODOS_OS_CLIENTES,
                    clienteId: r.cliente === TODOS_OS_CLIENTES ? null : r.cliente,
                    todasEspecialidades: r.especialidade === TODAS_AS_ESPECIALIDADES,
                    especialidadeId:
                      r.especialidade === TODAS_AS_ESPECIALIDADES ? null : r.especialidade,
                  }))
                : [],
          },
        }).unwrap();
        await recarregar();
        formApi.reset(iniciais);
        avisos.sucesso(`Regra salva a partir de ${mesAno(v.aPartirDe)}.`);
      }),
  });
  const alterado = useAlterado(form, iniciais);
  useInformarAlterado(alterado);
  const modo = useStore(form.store, (s) => s.values.modo);
  const competencias = opcoesAPartirDe(dados.aPartirDeMinimo, dados.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));
  const opcoesCliente = [
    { valor: TODOS_OS_CLIENTES, rotulo: 'Todos os clientes' },
    ...clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
  ];
  const opcoesEspecialidade = [
    { valor: TODAS_AS_ESPECIALIDADES, rotulo: 'Todas as especialidades' },
    ...especialidades.map((e) => ({ valor: e.id, rotulo: e.nome })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h4 className="text-subtle-foreground text-[13px] font-medium">
          Como os laudos contam hoje
        </h4>
        <p className="font-medium">
          {emVigor ? descreverContagem(emVigor) : ROTULO_MODO.todos_os_laudos}
        </p>
        <p className="text-muted-foreground text-[13px]">
          {emVigor ? AJUDA_MODO[emVigor.modo] : 'Sem regra própria: todo laudo do médico conta.'}
        </p>
      </section>

      {podeEditar && (
        <form
          noValidate
          aria-label="Nova versão da regra"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex max-w-[640px] flex-col gap-4 border-t pt-4"
        >
          <h4 className="text-base font-semibold">Nova versão</h4>
          <form.AppField name="modo">
            {(f) => (
              <f.OpcoesField
                label="Como os laudos contam"
                required
                opcoes={(Object.keys(ROTULO_MODO) as ModoContagemRepasseKey[]).map((m) => ({
                  valor: m,
                  rotulo: ROTULO_MODO[m],
                  ajuda: AJUDA_MODO[m],
                }))}
              />
            )}
          </form.AppField>
          {modo === 'recortes' && (
            <form.Field name="recortes">
              {(field) => {
                const recortes = field.state.value;
                const mudar = (i: number, parte: Partial<Recorte>) =>
                  field.handleChange(recortes.map((r, j) => (j === i ? { ...r, ...parte } : r)));
                const erros = field.state.meta.errors
                  .map((e) =>
                    typeof e === 'string'
                      ? e
                      : (e as unknown as { message?: string } | undefined)?.message,
                  )
                  .filter(Boolean);
                return (
                  <fieldset className="flex flex-col gap-2" aria-describedby={idRecortes}>
                    <legend className="mb-1 font-medium">
                      Recortes
                      <MarcaObrigatorio />
                    </legend>
                    <p id={idRecortes} className="text-muted-foreground text-[13px]">
                      Cada recorte é um cliente (ou todos) com uma especialidade (ou todas). Conta o
                      laudo que casa algum recorte.
                    </p>
                    {recortes.map((r, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a linha não tem id antes de salvar.
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <Select
                          aria-label={`Cliente do recorte ${i + 1}`}
                          placeholder="Cliente"
                          value={r.cliente}
                          onValueChange={(cliente) => mudar(i, { cliente })}
                          opcoes={opcoesCliente}
                          className="min-w-[180px] flex-1"
                        />
                        <span aria-hidden className="text-muted-foreground">
                          ×
                        </span>
                        <Select
                          aria-label={`Especialidade do recorte ${i + 1}`}
                          placeholder="Especialidade"
                          value={r.especialidade}
                          onValueChange={(especialidade) => mudar(i, { especialidade })}
                          opcoes={opcoesEspecialidade}
                          className="min-w-[180px] flex-1"
                        />
                        <Button
                          type="button"
                          aria-label={`Tirar o recorte ${i + 1}`}
                          onClick={() => field.handleChange(recortes.filter((_, j) => j !== i))}
                          className={buttonClassName({ variant: 'ghost', className: 'w-9 px-0' })}
                        >
                          <Trash size={16} aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      onClick={() =>
                        field.handleChange([...recortes, { cliente: '', especialidade: '' }])
                      }
                      className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
                    >
                      <Plus size={16} aria-hidden />
                      Incluir recorte
                    </Button>
                    {erros.length > 0 && (
                      <p className="text-destructive text-[13px]" role="alert">
                        {erros[0]}
                      </p>
                    )}
                  </fieldset>
                );
              }}
            </form.Field>
          )}
          <form.AppField name="aPartirDe">
            {(f) => (
              <f.SelectField
                label="Vale a partir de"
                required
                placeholder="Escolha a competência"
                opcoes={competencias}
                description="Só competências abertas ou futuras; a versão atual vale até a anterior."
              />
            )}
          </form.AppField>
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <RequiredLegend />
          <div className="flex justify-end">
            <form.AppForm>
              <form.SubmitButton>Salvar nova versão</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      <HistoricoVigencias
        versoes={dados.versoes}
        mesAtual={dados.mesAtual}
        vazio="Nenhuma versão: todos os laudos contam."
        descrever={(v) => descreverContagem(v)}
        onExcluir={
          podeEditar
            ? async (v) => {
                await regrasMedicoControllerCancelarContagem({
                  path: { medicoId, id: v.id },
                }).unwrap();
                await recarregar();
                avisos.sucesso('Versão programada cancelada.');
              }
            : undefined
        }
      />
    </div>
  );
}
