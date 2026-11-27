import { useStore } from '@tanstack/react-form';
import { useState } from 'react';
import { z } from 'zod';

import type { CategoriaDto } from '../../gen/types/CategoriaDto';
import type { CategoriaItemDto } from '../../gen/types/CategoriaItemDto';
import type { TipoCategoriaFinanceiraKey as TipoCategoriaFinanceira } from '../../gen/types/TipoCategoriaFinanceira';
import { plural } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { mostrarErrosDoServidor } from '../form/erros-do-servidor';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';

const ROTULO_TIPO_CATEGORIA: Record<TipoCategoriaFinanceira, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
};

const schema = z.object({
  tipo: z.enum(['receita', 'despesa']),
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome da categoria.')
    .max(120, 'Use até 120 caracteres.'),
  paiId: z.string(),
  codigoContabil: z.string().max(40, 'Use até 40 caracteres.'),
  ativa: z.boolean(),
});

type PainelCategoriaProps = {
  /** A aba aberta: o tipo da categoria nova. */
  tipo: TipoCategoriaFinanceira;
  /** Sem categoria, o painel cria uma nova. */
  categoria?: CategoriaItemDto;
  /** As categorias ativas (das opções); o grupo sai das do nível de cima do mesmo tipo. */
  grupos: CategoriaItemDto[];
  podeEditar: boolean;
  onSalvar: (dados: CategoriaDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const SEM_GRUPO = 'Nenhum (nível de cima)';

/** Categoria de receita ou despesa: criar, ver e editar, no painel ao lado da lista. */
export function PainelCategoria({
  tipo,
  categoria,
  grupos,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelCategoriaProps) {
  const [erro, setErro] = useState<string>();
  const ehGrupo = (categoria?.totalFilhas ?? 0) > 0;
  const iniciais = {
    tipo: categoria?.tipo ?? tipo,
    nome: categoria?.nome ?? '',
    paiId: categoria?.paiId ?? '',
    codigoContabil: categoria?.codigoContabil ?? '',
    ativa: categoria?.ativa ?? true,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          tipo: value.tipo,
          nome: value.nome.trim(),
          paiId: value.paiId || null,
          codigoContabil: value.codigoContabil.trim() || null,
          ativa: value.ativa,
        });
      } catch (falha) {
        if (!mostrarErrosDoServidor(form, falha)) {
          setErro(
            mensagemDaApi(
              falha,
              'Não foi possível salvar agora. Confira sua conexão e tente de novo.',
            ),
          );
        }
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const tipoEscolhido = useStore(form.store, (s) => s.values.tipo);
  const opcoesDeGrupo = grupos.filter(
    (g) => g.tipo === tipoEscolhido && !g.paiId && g.id !== categoria?.id,
  );

  const excluir =
    categoria && onExcluir
      ? {
          acao: 'Excluir categoria',
          titulo: `Excluir ${categoria.nome}?`,
          consequencia:
            'A categoria sai do plano. Se tem categorias dentro, é a categoria padrão de um fornecedor ou tem títulos, a exclusão é recusada: desative em vez de excluir.',
          onConfirmar: async () => {
            setErro(undefined);
            try {
              await onExcluir();
            } catch (falha) {
              setErro(mensagemDaApi(falha, 'Não foi possível excluir agora. Tente de novo.'));
            }
          },
        }
      : undefined;

  if (!podeEditar && categoria) {
    return (
      <PainelLateral titulo={categoria.nome} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <CampoSomenteLeitura label="Tipo" value={ROTULO_TIPO_CATEGORIA[categoria.tipo]} />
          <CampoSomenteLeitura label="Grupo" value={categoria.grupoNome ?? SEM_GRUPO} />
          <CampoSomenteLeitura label="Código contábil" value={categoria.codigoContabil ?? '—'} />
          <CampoSomenteLeitura label="Situação" value={categoria.ativa ? 'Ativa' : 'Inativa'} />
          <RodapeSomenteLeitura excluir={excluir} />
        </div>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral
      titulo={categoria?.nome ?? 'Nova categoria'}
      subtitulo={categoria?.grupoNome ?? undefined}
      onFechar={onFechar}
      alterado={alterado}
    >
      <form
        method="post"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField
          name="tipo"
          listeners={{
            // O grupo é do mesmo tipo: trocar o tipo tira o grupo escolhido.
            onChange: () => form.setFieldValue('paiId', ''),
          }}
        >
          {(field) => (
            <field.SelectField
              label="Tipo"
              required
              placeholder="Escolha o tipo"
              disabled={ehGrupo}
              opcoes={[
                { valor: 'receita', rotulo: 'Receita' },
                { valor: 'despesa', rotulo: 'Despesa' },
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="nome">
          {(field) => (
            <field.TextField
              label="Nome"
              required
              placeholder="Ex.: Software e TI"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="paiId">
          {(field) => (
            <field.SelectField
              label="Grupo"
              placeholder={SEM_GRUPO}
              disabled={ehGrupo}
              description={
                ehGrupo
                  ? `Tem ${plural(categoria?.totalFilhas ?? 0, { um: 'categoria', varios: 'categorias' })} dentro: é um grupo, fica no nível de cima e não muda de tipo.`
                  : 'Dois níveis: o grupo é uma categoria do nível de cima, do mesmo tipo.'
              }
              opcoes={[
                { valor: '', rotulo: SEM_GRUPO },
                ...opcoesDeGrupo.map((g) => ({ valor: g.id, rotulo: g.nome })),
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="codigoContabil">
          {(field) => (
            <field.TextField
              label="Código contábil"
              placeholder="Ex.: 3.2.03"
              autoComplete="off"
              spellCheck={false}
              description="Para a exportação à contabilidade."
            />
          )}
        </form.AppField>
        <form.AppField name="ativa">
          {(field) => (
            <field.CheckboxField
              label="Ativa"
              description="Inativa some das listas de escolha, mas continua nos lançamentos que já a usam."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar categoria"
            editando={Boolean(categoria)}
            excluir={excluir}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
