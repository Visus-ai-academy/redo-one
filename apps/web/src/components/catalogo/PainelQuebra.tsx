import { Button } from '@base-ui/react/button';
import { Fieldset } from '@base-ui/react/fieldset';
import { Trash } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { z } from 'zod';

import type { PecaDto } from '../../gen/types/PecaDto';
import type { QuebraDetalheDto } from '../../gen/types/QuebraDetalheDto';
import type { QuebraDto } from '../../gen/types/QuebraDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';
import { useErroDoPainel } from './use-erro-do-painel';

export type PainelQuebraProps = {
  /** Sem quebra, o painel cria uma nova (os exames entram depois de criada). */
  quebra?: QuebraDetalheDto;
  categorias: { id: string; nome: string }[];
  buscarExames: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  /** Salvar a quebra: editar (aberta) ou criar (nova). */
  podeEditar: boolean;
  /** Peças: adicionar (POST), ativar (PUT) e remover (DELETE). */
  podeCriar: boolean;
  podeEditarPecas: boolean;
  podeExcluir: boolean;
  onSalvar: (dados: QuebraDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onAdicionarPeca: (dados: PecaDto) => Promise<void>;
  onAtualizarPeca: (id: string, dados: PecaDto) => Promise<void>;
  onRemoverPeca: (id: string) => Promise<void>;
  onFechar: () => void;
};

/**
 * Quebra de um estudo: o nome como chega da MobileMed (em geral um combinado, que nem é exame do
 * cadastro) e os exames em que ele vira na cobrança, cada um valendo 1.
 */
export function PainelQuebra({
  quebra,
  categorias,
  buscarExames,
  podeEditar,
  podeCriar,
  podeEditarPecas,
  podeExcluir,
  onSalvar,
  onExcluir,
  onAdicionarPeca,
  onAtualizarPeca,
  onRemoverPeca,
  onFechar,
}: PainelQuebraProps) {
  const { erro, tentar } = useErroDoPainel();
  const iniciais = { estudoOrigem: quebra?.estudoOrigem ?? '' };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: {
      onSubmit: z.object({
        estudoOrigem: z.string().trim().min(1, 'Informe o estudo como chega da MobileMed.'),
      }),
    },
    onSubmit: ({ value }) => tentar(() => onSalvar({ estudoOrigem: value.estudoOrigem.trim() })),
  });
  const alterado = useAlterado(form, iniciais);

  const excluir =
    quebra && onExcluir
      ? {
          acao: 'Excluir quebra',
          titulo: `Excluir a quebra de ${quebra.estudoOrigem}?`,
          consequencia:
            'A partir da próxima importação, o laudo desse estudo deixa de se quebrar e vale como um exame só.',
          onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
        }
      : undefined;

  return (
    <PainelLateral
      titulo={quebra ? quebra.estudoOrigem : 'Nova quebra'}
      onFechar={onFechar}
      alterado={alterado}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="estudoOrigem">
            {(field) => (
              <field.TextField
                label="Estudo como chega da MobileMed"
                placeholder="Ex.: TC TORAX E ABDOME"
                description="Grafias que diferem só em acento, maiúsculas ou pontuação são o mesmo estudo."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
        </Fieldset.Root>
        {quebra?.exame && (
          <p className="text-muted-foreground text-[13px]">
            Também é o exame {quebra.exame.nome} do cadastro.
          </p>
        )}
        {podeEditar ? (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar quebra"
              editando={Boolean(quebra)}
              excluir={excluir}
              onCancelar={onFechar}
            />
          </form.AppForm>
        ) : (
          <RodapeSomenteLeitura excluir={excluir} />
        )}
      </form>
      {quebra && (
        <PecasQuebra
          pecas={quebra.pecas}
          categorias={categorias}
          buscarExames={buscarExames}
          podeCriar={podeCriar}
          podeEditar={podeEditarPecas}
          podeExcluir={podeExcluir}
          onCriar={onAdicionarPeca}
          onAtualizar={onAtualizarPeca}
          onExcluir={onRemoverPeca}
        />
      )}
    </PainelLateral>
  );
}

function PecasQuebra({
  pecas,
  categorias,
  buscarExames,
  podeCriar,
  podeEditar,
  podeExcluir,
  onCriar,
  onAtualizar,
  onExcluir,
}: {
  pecas: QuebraDetalheDto['pecas'];
  categorias: { id: string; nome: string }[];
  buscarExames: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  onCriar: (dados: PecaDto) => Promise<void>;
  onAtualizar: (id: string, dados: PecaDto) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const pagina = usePaginaLocal(pecas, 5);
  const tentar = async (acao: () => Promise<void>) => {
    setErro(undefined);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, 'Não foi possível salvar agora. Tente de novo.'));
    }
  };
  const form = useAppForm({
    defaultValues: { destino: null as OpcaoBusca | null, categoriaId: '' },
    validators: {
      onSubmit: z.object({
        destino: z.custom<OpcaoBusca | null>(
          (v) => v !== null,
          'Escolha o exame em que o estudo se quebra.',
        ),
        categoriaId: z.string(),
      }),
    },
    onSubmit: ({ value, formApi }) =>
      tentar(async () => {
        await onCriar({
          exameId: value.destino?.valor ?? '',
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
          Exames em que se quebra
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Laudado, o estudo vira uma linha de cada exame abaixo na cobrança (cada uma vale 1).
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {pecas.length === 0 ? (
        <p className="text-muted-foreground">Nenhum exame ainda: o estudo não se quebra.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((peca) => {
            const dados = { exameId: peca.exame.id, categoriaId: peca.categoria?.id ?? null };
            return (
              <li key={peca.id} className="flex items-center gap-3 px-3 py-2">
                {podeEditar && (
                  <CaixaDeSelecao
                    aria-label={`${peca.exame.nome} ativo na quebra`}
                    checked={peca.ativo}
                    onCheckedChange={(ativo) =>
                      void tentar(() => onAtualizar(peca.id, { ...dados, ativo }))
                    }
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={
                      peca.ativo ? 'truncate font-medium' : 'text-muted-foreground truncate'
                    }
                  >
                    {peca.exame.nome}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 text-[13px]">
                    {peca.categoria
                      ? `Categoria ${peca.categoria.nome} se o exame não tiver`
                      : 'Categoria do exame'}
                    {!peca.ativo && <Etiqueta tom="inativo">Inativo</Etiqueta>}
                  </span>
                </span>
                {podeExcluir && (
                  <Button
                    type="button"
                    aria-label={`Remover ${peca.exame.nome} da quebra`}
                    onClick={() => void tentar(() => onExcluir(peca.id))}
                    className={buttonClassName({
                      variant: 'ghost',
                      className: 'text-muted-foreground size-9 flex-none px-0',
                    })}
                  >
                    <Trash size={16} aria-hidden />
                  </Button>
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
      {podeCriar && (
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
                label="Exame"
                placeholder="Digite o nome do exame"
                chave="exames"
                buscar={buscarExames}
              />
            )}
          </form.AppField>
          <form.AppField name="categoriaId">
            {(field) => (
              <field.SelectField
                label="Categoria, se o exame não tiver"
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
              Adicionar exame
            </form.SubmitButton>
          </form.AppForm>
        </form>
      )}
    </section>
  );
}
