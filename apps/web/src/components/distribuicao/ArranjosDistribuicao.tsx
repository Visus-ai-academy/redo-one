import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import type { OpcaoComCorDto } from '../../gen/types/OpcaoComCorDto';
import type { PrioridadeDoArranjoDto } from '../../gen/types/PrioridadeDoArranjoDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { RodapePainel } from '../catalogo/rodape-painel';
import { GERAL } from '../escala/alocacao-form';
import { BuscaMultiplaField } from '../form/BuscaMultiplaField';
import { TODAS } from '../form/caixas-todas';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { useAvisos } from '../toast/use-avisos';
import {
  atendeCliente,
  type DonoArranjo,
  esquemaArranjo,
  frenteDaChave,
  type NomesDoArranjo,
  OPCOES_MODO_CLIENTES,
  paraApi,
  resumoDoArranjo,
  type ValoresArranjo,
  valoresDoArranjo,
} from './arranjo-form';

export type ArranjosDistribuicaoProps = {
  dono: DonoArranjo;
  arranjos: ArranjoDto[];
  /** Nomes dos clientes e exames marcados (vêm com os arranjos). */
  nomes: NomesDoArranjo;
  /** Opções ativas do catálogo; as prioridades são as da operação (vêm com os arranjos). */
  catalogo: {
    especialidades: OpcaoComCorDto[];
    modalidades: OpcaoComCorDto[];
    subespecialidades: (RotuloDto & { especialidadeIds: string[] })[];
    prioridades: PrioridadeDoArranjoDto[];
  };
  podeEditar: boolean;
  buscarClientes: (termo: string) => Promise<OpcaoBusca[]>;
  buscarExames: (termo: string) => Promise<OpcaoBusca[]>;
  /** Salva a lista inteira (a API substitui a anterior). */
  onSalvar: (arranjos: ArranjoDto[]) => Promise<void>;
};

/** Num painel lateral, 5 por página. */
const POR_PAGINA = 5;
const FALHA_AO_SALVAR = 'Não foi possível salvar agora. Confira sua conexão e tente de novo.';

/**
 * O que um médico (ou uma equipe) lauda: a lista de arranjos em cartões e, ao abrir um, o
 * formulário no lugar da lista, dentro do mesmo painel. Cada arranjo é uma união: o exame vai para
 * quem tem qualquer arranjo que case com ele por inteiro.
 */
export function ArranjosDistribuicao(props: ArranjosDistribuicaoProps) {
  const { dono, arranjos, nomes, catalogo, podeEditar } = props;
  const [aberto, setAberto] = useState<number | 'novo' | null>(null);
  const tituloId = useId();
  const pagina = usePaginaLocal(arranjos, POR_PAGINA);
  const quem = dono === 'medico' ? 'o médico' : 'a equipe';

  if (podeEditar && aberto !== null) {
    return (
      <FormArranjo
        {...props}
        indice={aberto === 'novo' ? undefined : aberto}
        onFechar={() => setAberto(null)}
      />
    );
  }

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={tituloId} className="text-base font-semibold">
            Arranjos
          </h3>
          <p className="text-muted-foreground text-[13px]">
            O que {quem} lauda pelo robô, frente por frente. Basta um arranjo casar com o exame.
          </p>
        </div>
        {podeEditar && (
          <Button
            type="button"
            onClick={() => setAberto('novo')}
            className={buttonClassName({ variant: 'secondary' })}
          >
            <Plus size={16} aria-hidden />
            Novo arranjo
          </Button>
        )}
      </div>
      {arranjos.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum arranjo: o robô não entrega exames {dono === 'medico' ? 'a ele' : 'por ela'}.
          {podeEditar && ' Crie um arranjo para dizer o que lauda.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((arranjo, i) => {
            const indice = (pagina.pagina - 1) * pagina.porPagina + i;
            const resumo = resumoDoArranjo(arranjo, catalogo, nomes);
            const conteudo = (
              <>
                <span className="font-medium">{resumo.titulo}</span>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                  {resumo.linhas.map((linha) => (
                    <div key={linha.rotulo} className="contents">
                      <dt className="text-muted-foreground">{linha.rotulo}</dt>
                      <dd className="min-w-0 break-words">{linha.valor}</dd>
                    </div>
                  ))}
                </dl>
              </>
            );
            return (
              <li key={indice}>
                {podeEditar ? (
                  <Button
                    type="button"
                    onClick={() => setAberto(indice)}
                    className="hover:bg-muted focus-visible:outline-ring flex w-full flex-col gap-1 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    {conteudo}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-1 px-3 py-2">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pagina.precisaPaginar && (
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      )}
    </section>
  );
}

function FormArranjo({
  dono,
  arranjos,
  nomes,
  catalogo,
  buscarClientes,
  buscarExames,
  onSalvar,
  indice,
  onFechar,
}: ArranjosDistribuicaoProps & { indice?: number; onFechar: () => void }) {
  const avisos = useAvisos();
  const [erro, setErro] = useState<string>();
  const editando = indice !== undefined;
  const tituloId = useId();

  const salvar = async (lista: ArranjoDto[], aviso: string) => {
    setErro(undefined);
    try {
      await onSalvar(lista);
      avisos.sucesso(aviso);
      onFechar();
    } catch (falha) {
      setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
    }
  };

  const iniciais = valoresDoArranjo(editando ? arranjos[indice] : undefined, nomes);
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaArranjo },
    onSubmit: ({ value }) => {
      const dto = paraApi(value, dono);
      return editando
        ? salvar(
            arranjos.map((a, i) => (i === indice ? dto : a)),
            'Arranjo salvo.',
          )
        : salvar([...arranjos, dto], 'Arranjo criado.');
    },
  });
  useInformarAlterado(useAlterado(form, iniciais));

  /** Segmentos da frente de especialidade (a de modalidade não tem segmento). */
  const subsDa = (frente: string) => {
    const f = frenteDaChave(frente);
    return f?.tipo === 'especialidade'
      ? catalogo.subespecialidades.filter((s) => s.especialidadeIds.includes(f.id))
      : [];
  };

  const opcoesFrente = [
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
  // Frente que saiu do catálogo ativo continua à vista no arranjo que a usa.
  const frenteAtual = editando ? valoresDoArranjo(arranjos[indice], nomes).frente : '';
  if (frenteAtual && !opcoesFrente.some((o) => o.valor === frenteAtual)) {
    opcoesFrente.push({
      valor: frenteAtual,
      rotulo: '(fora do catálogo)',
      cor: null,
      grupo: 'Inativas',
    });
  }

  /** Exclusiva só entre os clientes que o arranjo atende. */
  const buscarExclusivas = async (termo: string) => {
    const v = form.state.values as ValoresArranjo;
    const candidatos =
      v.modoClientes === 'apenas'
        ? v.clientes.filter((c) => semAcento(c.rotulo).includes(semAcento(termo)))
        : await buscarClientes(termo);
    return candidatos.filter((c) => atendeCliente(v, c.valor));
  };

  /** Modo (todos, só estes, todos exceto) e a lista, para clientes ou exames. */
  const vinculo = ({
    eixo,
    campoModo,
    campoLista,
    placeholder,
    buscar,
  }: {
    eixo: string;
    campoModo: 'modoClientes' | 'modoExames';
    campoLista: 'clientes' | 'exames';
    placeholder: string;
    buscar: (termo: string) => Promise<OpcaoBusca[]>;
  }) => (
    <div className="flex flex-col gap-3">
      <form.AppField name={campoModo}>
        {(field) => <field.OpcoesField label={eixo} opcoes={OPCOES_MODO_CLIENTES} />}
      </form.AppField>
      <form.Subscribe selector={(estado) => estado.values[campoModo]}>
        {(modo) =>
          modo !== 'todos' && (
            <form.AppField name={campoLista}>
              {() => (
                <BuscaMultiplaField
                  label={modo === 'apenas' ? `Só estes ${eixo.toLowerCase()}` : `${eixo} de fora`}
                  placeholder={placeholder}
                  chave={campoLista}
                  buscar={buscar}
                  required={modo === 'apenas'}
                />
              )}
            </form.AppField>
          )
        }
      </form.Subscribe>
    </div>
  );

  return (
    <section aria-labelledby={tituloId}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <h3 id={tituloId} className="text-base font-semibold">
          {editando ? 'Editar arranjo' : 'Novo arranjo'}
        </h3>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField
          name="frente"
          listeners={{
            onChange: ({ value }) => {
              // O recorte é da frente: o da outra dimensão volta a "Todas", e o segmento fica só
              // se é dela (sem segmentos na nova frente, o campo some e fica "Todos").
              const f = frenteDaChave(value);
              const paraTodas = (campo: 'especialidadeIds' | 'modalidadeIds') => {
                if (form.getFieldValue(campo).join() !== TODAS) form.setFieldValue(campo, [TODAS]);
              };
              if (f?.tipo !== 'modalidade') paraTodas('especialidadeIds');
              if (f?.tipo !== 'especialidade') paraTodas('modalidadeIds');
              const daNova = subsDa(value);
              const marcadas = form.getFieldValue('subespecialidadeIds');
              const ficam = daNova.length
                ? marcadas.filter(
                    (id) => id === TODAS || id === GERAL || daNova.some((s) => s.id === id),
                  )
                : [TODAS];
              if (ficam.join() !== marcadas.join())
                form.setFieldValue('subespecialidadeIds', ficam);
            },
          }}
        >
          {(field) => (
            <field.SelectField
              label="Frente"
              placeholder="Escolha a especialidade ou a modalidade"
              opcoes={opcoesFrente}
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(estado) => estado.values.frente}>
          {(frente) => {
            const tipo = frenteDaChave(frente)?.tipo;
            if (tipo === 'modalidade') {
              return (
                <form.AppField name="especialidadeIds">
                  {(field) => (
                    <field.SelecaoMultiplaField
                      label="Especialidades"
                      placeholder="Escolha as especialidades"
                      todas="Todas"
                      required
                      opcoes={catalogo.especialidades.map((e) => ({
                        valor: e.id,
                        rotulo: e.nome,
                        cor: e.cor,
                      }))}
                    />
                  )}
                </form.AppField>
              );
            }
            if (tipo !== 'especialidade') return null;
            const subs = subsDa(frente);
            return (
              <>
                <form.AppField name="modalidadeIds">
                  {(field) => (
                    <field.SelecaoMultiplaField
                      label="Modalidades"
                      placeholder="Escolha as modalidades"
                      todas="Todas"
                      required
                      opcoes={catalogo.modalidades.map((m) => ({
                        valor: m.id,
                        rotulo: m.nome,
                        cor: m.cor,
                      }))}
                    />
                  )}
                </form.AppField>
                <form.AppField name="subespecialidadeIds">
                  {(field) =>
                    (subs.length > 0 || field.state.value.some((v) => v !== TODAS)) && (
                      <field.SelecaoMultiplaField
                        label="Segmentos"
                        placeholder="Escolha os segmentos"
                        todas="Todos"
                        required
                        opcoes={[
                          ...subs.map((s) => ({ valor: s.id, rotulo: s.nome })),
                          { valor: GERAL, rotulo: 'Geral (sem segmento)' },
                        ]}
                      />
                    )
                  }
                </form.AppField>
              </>
            );
          }}
        </form.Subscribe>
        <form.AppField name="prioridadeIds">
          {(field) => (
            <field.CaixasField
              label="Prioridades"
              opcoes={catalogo.prioridades.map((p) => ({
                valor: p.id,
                rotulo: p.nome,
                cor: p.cor,
              }))}
              todas="Todas"
              required
            />
          )}
        </form.AppField>
        {vinculo({
          eixo: 'Clientes',
          campoModo: 'modoClientes',
          campoLista: 'clientes',
          placeholder: 'Digite o nome do cliente',
          buscar: buscarClientes,
        })}
        {vinculo({
          eixo: 'Exames',
          campoModo: 'modoExames',
          campoLista: 'exames',
          placeholder: 'Digite o nome do exame',
          buscar: buscarExames,
        })}
        {dono === 'medico' && (
          <form.Subscribe
            selector={(estado) =>
              `${estado.values.modoClientes}:${estado.values.clientes.map((c) => c.valor).join(',')}`
            }
          >
            {(recorte) => (
              <form.AppField name="clientesExclusivos">
                {() => (
                  <BuscaMultiplaField
                    label="Clínicas exclusivas"
                    placeholder="Nenhuma. Digite o nome do cliente"
                    // A busca muda com os clientes do arranjo: a chave também.
                    chave={`exclusivas:${recorte}`}
                    buscar={buscarExclusivas}
                    description="Nestas clínicas, o que este arranjo cobre vai só para quem as tem como exclusivas; os outros médicos não recebem. Precisam estar entre os clientes do arranjo."
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
        )}
        <form.AppForm>
          {/* A frente é sempre obrigatória: a legenda fica sempre. */}
          <RodapePainel
            legenda
            rotuloCriar="Criar arranjo"
            editando={editando}
            excluir={
              editando
                ? {
                    acao: 'Excluir arranjo',
                    titulo: 'Excluir este arranjo?',
                    consequencia: `O robô deixa de entregar ${dono === 'medico' ? 'ao médico' : 'à equipe'} o que só este arranjo cobre. Os outros arranjos continuam.`,
                    onConfirmar: () =>
                      salvar(
                        arranjos.filter((_, i) => i !== indice),
                        'Arranjo excluído.',
                      ),
                  }
                : undefined
            }
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </section>
  );
}

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
