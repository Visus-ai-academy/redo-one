import { Trash } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { z } from 'zod';

import type { ExameDetalheDto } from '../../gen/types/ExameDetalheDto';
import type { ExameDto } from '../../gen/types/ExameDto';
import type { OpcoesCatalogoDto } from '../../gen/types/OpcoesCatalogoDto';
import type { RegraQuebraDto } from '../../gen/types/RegraQuebraDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel } from './rodape-painel';
import { useErroDoPainel } from './use-erro-do-painel';

export type PainelExameProps = {
  /** Sem exame, o painel cria um novo (as regras de quebra aparecem depois de criado). */
  exame?: ExameDetalheDto;
  opcoes: OpcoesCatalogoDto;
  buscarExames: (termo: string) => Promise<OpcaoBusca[]>;
  podeEditar: boolean;
  onSalvar: (dados: ExameDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onCriarRegra: (dados: RegraQuebraDto) => Promise<void>;
  onAtualizarRegra: (id: string, dados: RegraQuebraDto) => Promise<void>;
  onExcluirRegra: (id: string) => Promise<void>;
  onFechar: () => void;
};

const opcional = (texto: string) => texto.trim() || null;
const nenhum = (rotulo: string) => ({ valor: '', rotulo });
const comoOpcoes = (itens: { id: string; nome: string }[]) =>
  itens.map((i) => ({ valor: i.id, rotulo: i.nome }));
const nomeDe = (itens: { id: string; nome: string }[], id: string | null | undefined) =>
  itens.find((i) => i.id === id)?.nome ?? '—';

/** Exame do catálogo e as regras de quebra dele, no painel ao lado da lista. */
export function PainelExame({
  exame,
  opcoes,
  buscarExames,
  podeEditar,
  onSalvar,
  onExcluir,
  onCriarRegra,
  onAtualizarRegra,
  onExcluirRegra,
  onFechar,
}: PainelExameProps) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      nome: exame?.nome ?? '',
      codigo: exame?.codigo ?? '',
      descricao: exame?.descricao ?? '',
      modalidadeId: exame?.modalidadeId ?? '',
      especialidadeId: exame?.especialidadeId ?? '',
      subespecialidadeId: exame?.subespecialidadeId ?? '',
      categoriaId: exame?.categoriaId ?? '',
      prioridadeId: exame?.prioridadeId ?? '',
      permiteQuebra: exame?.permiteQuebra ?? false,
      exigeRevisaoManual: exame?.exigeRevisaoManual ?? false,
      ativo: exame?.ativo ?? true,
    },
    validators: {
      onSubmit: z.object({
        nome: z.string().trim().min(1, 'Informe o nome do exame.'),
        codigo: z.string(),
        descricao: z.string(),
        modalidadeId: z.string(),
        especialidadeId: z.string(),
        subespecialidadeId: z.string(),
        categoriaId: z.string(),
        prioridadeId: z.string(),
        permiteQuebra: z.boolean(),
        exigeRevisaoManual: z.boolean(),
        ativo: z.boolean(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          nome: value.nome.trim(),
          codigo: opcional(value.codigo),
          descricao: opcional(value.descricao),
          modalidadeId: value.modalidadeId || null,
          especialidadeId: value.especialidadeId || null,
          subespecialidadeId: value.subespecialidadeId || null,
          categoriaId: value.categoriaId || null,
          prioridadeId: value.prioridadeId || null,
          permiteQuebra: value.permiteQuebra,
          exigeRevisaoManual: value.exigeRevisaoManual,
          ativo: value.ativo,
        }),
      ),
  });

  return (
    <PainelLateral
      titulo={exame?.nome ?? 'Novo exame'}
      subtitulo={exame?.codigo ?? undefined}
      onFechar={onFechar}
    >
      {podeEditar ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-4 p-4"
        >
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <form.AppField name="nome">
            {(field) => (
              <field.TextField
                label="Nome"
                placeholder="Ex.: TC CRANIO"
                description="Como o estudo chega da MobileMed."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <div className="flex flex-wrap gap-4">
            <form.AppField name="codigo">
              {(field) => (
                <field.TextField
                  label="Código"
                  placeholder="Ex.: 40808041"
                  autoComplete="off"
                  className="flex-[1_1_140px]"
                />
              )}
            </form.AppField>
            <form.AppField name="modalidadeId">
              {(field) => (
                <field.SelectField
                  label="Modalidade"
                  placeholder="Sem modalidade"
                  opcoes={[nenhum('Sem modalidade'), ...comoOpcoes(opcoes.modalidades)]}
                  className="flex-[1_1_140px]"
                />
              )}
            </form.AppField>
          </div>
          <form.AppField name="descricao">
            {(field) => (
              <field.TextField
                label="Descrição"
                placeholder="Ex.: Tomografia de crânio sem contraste"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.Subscribe
            selector={(estado) =>
              [estado.values.especialidadeId, estado.values.subespecialidadeId] as const
            }
          >
            {([especialidadeId, subespecialidadeId]) => (
              <>
                <form.AppField name="especialidadeId">
                  {(field) => (
                    <field.SelectField
                      label="Especialidade"
                      placeholder="Sem especialidade"
                      opcoes={[nenhum('Sem especialidade'), ...comoOpcoes(opcoes.especialidades)]}
                    />
                  )}
                </form.AppField>
                <form.AppField name="subespecialidadeId">
                  {(field) => (
                    <field.SelectField
                      label="Subespecialidade"
                      placeholder="Sem subespecialidade"
                      description="Sem subespecialidade, o exame não vai para médico restrito a uma."
                      opcoes={[
                        nenhum('Sem subespecialidade'),
                        ...comoOpcoes(
                          opcoes.subespecialidades.filter(
                            (s) =>
                              !especialidadeId ||
                              s.especialidadeIds.includes(especialidadeId) ||
                              s.id === subespecialidadeId,
                          ),
                        ),
                      ]}
                    />
                  )}
                </form.AppField>
              </>
            )}
          </form.Subscribe>
          <div className="flex flex-wrap gap-4">
            <form.AppField name="categoriaId">
              {(field) => (
                <field.SelectField
                  label="Categoria"
                  placeholder="Sem categoria"
                  opcoes={[nenhum('Sem categoria'), ...comoOpcoes(opcoes.categoriasExame)]}
                  className="flex-[1_1_140px]"
                />
              )}
            </form.AppField>
            <form.AppField name="prioridadeId">
              {(field) => (
                <field.SelectField
                  label="Prioridade"
                  placeholder="Sem prioridade"
                  opcoes={[nenhum('Sem prioridade'), ...comoOpcoes(opcoes.prioridades)]}
                  className="flex-[1_1_140px]"
                />
              )}
            </form.AppField>
          </div>
          <form.AppField name="exigeRevisaoManual">
            {(field) => (
              <field.CheckboxField
                label="Exige revisão manual"
                description="O robô separa para a operação analisar em vez de distribuir (ex.: idade óssea)."
              />
            )}
          </form.AppField>
          <form.AppField name="permiteQuebra">
            {(field) => <field.CheckboxField label="Permite quebra" />}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => (
              <field.CheckboxField
                label="Ativo"
                description="Inativo some das buscas de exame; o histórico continua."
              />
            )}
          </form.AppField>
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar exame"
              editando={Boolean(exame)}
              excluir={
                exame && onExcluir
                  ? {
                      acao: 'Excluir exame',
                      titulo: `Excluir ${exame.nome}?`,
                      consequencia:
                        'O exame e as regras de quebra dele saem do catálogo. Se ele é destino de outra regra, a exclusão é recusada: desative em vez de excluir.',
                      onConfirmar: () =>
                        tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
                    }
                  : undefined
              }
              onCancelar={onFechar}
            />
          </form.AppForm>
        </form>
      ) : (
        exame && (
          <div className="flex flex-col gap-4 p-4">
            <CampoSomenteLeitura
              label="Modalidade"
              value={nomeDe(opcoes.modalidades, exame.modalidadeId)}
            />
            <CampoSomenteLeitura
              label="Especialidade"
              value={nomeDe(opcoes.especialidades, exame.especialidadeId)}
            />
            <CampoSomenteLeitura
              label="Subespecialidade"
              value={nomeDe(opcoes.subespecialidades, exame.subespecialidadeId)}
            />
            <CampoSomenteLeitura
              label="Categoria"
              value={nomeDe(opcoes.categoriasExame, exame.categoriaId)}
            />
            <CampoSomenteLeitura label="Situação" value={exame.ativo ? 'Ativo' : 'Inativo'} />
          </div>
        )
      )}
      {exame && (
        <RegrasQuebra
          regras={exame.regrasQuebra}
          categorias={opcoes.categoriasExame}
          buscarExames={buscarExames}
          podeEditar={podeEditar}
          onCriar={onCriarRegra}
          onAtualizar={onAtualizarRegra}
          onExcluir={onExcluirRegra}
        />
      )}
    </PainelLateral>
  );
}

function RegrasQuebra({
  regras,
  categorias,
  buscarExames,
  podeEditar,
  onCriar,
  onAtualizar,
  onExcluir,
}: {
  regras: ExameDetalheDto['regrasQuebra'];
  categorias: { id: string; nome: string }[];
  buscarExames: (termo: string) => Promise<OpcaoBusca[]>;
  podeEditar: boolean;
  onCriar: (dados: RegraQuebraDto) => Promise<void>;
  onAtualizar: (id: string, dados: RegraQuebraDto) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const pagina = usePaginaLocal(regras, 5);
  const tentar = async (acao: () => Promise<void>) => {
    setErro(undefined);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, 'Não foi possível salvar a regra agora. Tente de novo.'));
    }
  };
  const form = useAppForm({
    defaultValues: { destino: null as OpcaoBusca | null, categoriaId: '' },
    validators: {
      onSubmit: z.object({
        destino: z.custom<OpcaoBusca | null>(
          (v) => v !== null,
          'Escolha o exame em que este se quebra.',
        ),
        categoriaId: z.string(),
      }),
    },
    onSubmit: ({ value, formApi }) =>
      tentar(async () => {
        await onCriar({
          exameDestinoId: value.destino?.valor ?? '',
          categoriaId: value.categoriaId || null,
          ativo: true,
        });
        formApi.reset();
      }),
  });

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3 border-t p-4">
      <div className="flex flex-col gap-1">
        <h3 id={tituloId} className="text-base font-semibold">
          Regras de quebra
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Laudado, este exame vira uma linha de cada exame abaixo na cobrança (cada uma vale 1).
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {regras.length === 0 ? (
        <p className="text-muted-foreground">Este exame não se quebra.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((regra) => {
            const dados = {
              exameDestinoId: regra.exameDestino.id,
              categoriaId: regra.categoria?.id ?? null,
            };
            return (
              <li key={regra.id} className="flex items-center gap-3 px-3 py-2">
                {podeEditar && (
                  <CaixaDeSelecao
                    aria-label={`Regra para ${regra.exameDestino.nome} ativa`}
                    checked={regra.ativo}
                    onCheckedChange={(ativo) =>
                      void tentar(() => onAtualizar(regra.id, { ...dados, ativo }))
                    }
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={
                      regra.ativo ? 'truncate font-medium' : 'text-muted-foreground truncate'
                    }
                  >
                    {regra.exameDestino.nome}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 text-[13px]">
                    {regra.categoria ? `Categoria ${regra.categoria.nome}` : 'Categoria do exame'}
                    {!regra.ativo && <Etiqueta tom="inativo">Inativa</Etiqueta>}
                  </span>
                </span>
                {podeEditar && (
                  <button
                    type="button"
                    aria-label={`Remover regra para ${regra.exameDestino.nome}`}
                    onClick={() => void tentar(() => onExcluir(regra.id))}
                    className={buttonClassName({
                      variant: 'ghost',
                      className: 'text-muted-foreground size-9 flex-none px-0',
                    })}
                  >
                    <Trash size={16} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pagina.precisaPaginar && (
        <div className="-mx-4 -mb-4">
          <Paginacao
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
            onIrPara={pagina.irPara}
          />
        </div>
      )}
      {podeEditar && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <form.AppField name="destino">
            {(field) => (
              <field.BuscaField
                label="Exame em que se quebra"
                placeholder="Digite o nome do exame"
                chave="exames"
                buscar={buscarExames}
              />
            )}
          </form.AppField>
          <form.AppField name="categoriaId">
            {(field) => (
              <field.SelectField
                label="Categoria da linha quebrada"
                placeholder="A do exame"
                opcoes={[
                  { valor: '', rotulo: 'A do exame' },
                  ...categorias.map((c) => ({ valor: c.id, rotulo: c.nome })),
                ]}
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton
              pendingLabel="Adicionando…"
              variant="secondary"
              className="self-start"
            >
              Adicionar regra
            </form.SubmitButton>
          </form.AppForm>
        </form>
      )}
    </section>
  );
}
