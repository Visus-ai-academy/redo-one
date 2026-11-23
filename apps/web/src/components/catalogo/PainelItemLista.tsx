import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { type AbaExtra, AbasComHistorico } from '../historico-cadastro/AbasComHistorico';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';

/** Campos comuns às listas do catálogo; a prioridade tem `urgente` e a subespecialidade as especialidades. */
export type DadosItemLista = {
  nome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
  urgente?: boolean;
  especialidadeIds?: string[];
};

export type VarianteLista = 'simples' | 'prioridade' | 'subespecialidade';

export type RotulosLista = {
  /** Em minúsculas: `modalidade`, `categoria`. */
  singular: string;
  genero: 'f' | 'm';
  /** Rótulo do campo nome: `Código` na modalidade. */
  campoNome: string;
  exemploNome: string;
  exemploDescricao: string;
};

export type PainelItemListaProps = {
  rotulos: RotulosLista;
  variante: VarianteLista;
  /** Sem item, o painel cria um novo. */
  item?: DadosItemLista & { id: string };
  /** Opções da subespecialidade. */
  especialidades?: { id: string; nome: string; cor: string | null }[];
  podeEditar: boolean;
  onSalvar: (dados: DadosItemLista) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
  /** Seções abaixo do cadastro (ex.: variações da prioridade). */
  children?: ReactNode;
  /** Abas além do cadastro (ex.: Distribuição da especialidade); sem elas, o painel não tem abas. */
  abas?: AbaExtra[];
};

const HEX = /^#[0-9a-f]{6}$/i;

function schema(rotulos: RotulosLista, variante: VarianteLista) {
  return z.object({
    nome: z.string().trim().min(1, `Informe o ${rotulos.campoNome.toLowerCase()}.`),
    descricao: z.string(),
    cor: z
      .string()
      .refine(
        (cor) => cor.trim() === '' || HEX.test(cor.trim()),
        'Use o formato #RRGGBB, como #1F7A4D.',
      ),
    ordem: z.string().regex(/^\d{1,4}$/, 'Informe um número inteiro de 0 a 9999.'),
    ativo: z.boolean(),
    urgente: z.boolean(),
    especialidadeIds:
      variante === 'subespecialidade'
        ? z.array(z.string()).min(1, 'Escolha ao menos uma especialidade.')
        : z.array(z.string()),
  });
}

/** Criar, ver e editar um item de uma lista do catálogo, no painel lateral (com abas e histórico). */
export function PainelItemLista({
  rotulos,
  variante,
  item,
  especialidades = [],
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
  children,
  abas,
}: PainelItemListaProps) {
  const [erro, setErro] = useState<string>();
  const novo = rotulos.genero === 'f' ? 'Nova' : 'Novo';
  const titulo = item ? item.nome : `${novo} ${rotulos.singular}`;

  const iniciais = {
    nome: item?.nome ?? '',
    descricao: item?.descricao ?? '',
    cor: item?.cor ?? '',
    ordem: String(item?.ordem ?? 0),
    ativo: item?.ativo ?? true,
    urgente: item?.urgente ?? false,
    especialidadeIds: item?.especialidadeIds ?? [],
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema(rotulos, variante) },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          nome: value.nome.trim(),
          descricao: value.descricao.trim() || null,
          cor: value.cor.trim() || null,
          ordem: Number(value.ordem),
          ativo: value.ativo,
          ...(variante === 'prioridade' && { urgente: value.urgente }),
          ...(variante === 'subespecialidade' && { especialidadeIds: value.especialidadeIds }),
        });
      } catch (falha) {
        setErro(
          mensagemDaApi(
            falha,
            'Não foi possível salvar agora. Confira sua conexão e tente de novo.',
          ),
        );
      }
    },
  });

  const alterado = useAlterado(form, iniciais);
  const artigo = rotulos.genero === 'f' ? 'a' : 'o';
  const excluir =
    item && onExcluir
      ? {
          acao: `Excluir ${rotulos.singular}`,
          titulo: `Excluir ${item.nome}?`,
          consequencia: `${item.nome} sai do catálogo. Se algum cadastro usa est${artigo} ${rotulos.singular}, a exclusão é recusada: desative em vez de excluir.`,
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

  if (!podeEditar && item) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <AbasComHistorico extras={abas} aria-label={`Partes d${artigo} ${rotulos.singular}`}>
          <div className="flex flex-col gap-4 p-4">
            {erro && <Alerta tom="erro">{erro}</Alerta>}
            <CampoSomenteLeitura label={rotulos.campoNome} value={item.nome} />
            <CampoSomenteLeitura label="Descrição" value={item.descricao ?? '—'} />
            {variante === 'subespecialidade' && (
              <CampoSomenteLeitura
                label="Especialidades"
                value={especialidades
                  .filter((e) => item.especialidadeIds?.includes(e.id))
                  .map((e) => e.nome)
                  .join(', ')}
              />
            )}
            <CampoSomenteLeitura label="Situação" value={item.ativo ? 'Ativo' : 'Inativo'} />
            <RodapeSomenteLeitura excluir={excluir} />
          </div>
          {children}
        </AbasComHistorico>
      </PainelLateral>
    );
  }

  const campos = (
    <>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <form.AppField name="nome">
        {(field) => (
          <field.TextField
            label={rotulos.campoNome}
            placeholder={rotulos.exemploNome}
            autoComplete="off"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="descricao">
        {(field) => (
          <field.TextField
            label="Descrição"
            placeholder={rotulos.exemploDescricao}
            autoComplete="off"
          />
        )}
      </form.AppField>
      {variante === 'subespecialidade' && (
        <form.AppField name="especialidadeIds">
          {(field) => (
            <field.CheckboxListField
              label="Especialidades"
              required
              description="A subespecialidade é um recorte dentro delas (ex.: COLUNAS em NEURO e MSK)."
              opcoes={especialidades.map((e) => ({ valor: e.id, rotulo: e.nome, cor: e.cor }))}
            />
          )}
        </form.AppField>
      )}
      <div className="flex flex-wrap gap-4">
        <form.AppField name="cor">
          {(field) => (
            <field.TextField
              label="Cor"
              placeholder="#1F7A4D"
              autoComplete="off"
              description="Cor do selo nas telas."
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
        <form.AppField name="ordem">
          {(field) => (
            <field.NumberField
              label="Ordem"
              placeholder="0"
              min={0}
              max={9999}
              required
              description="Menor aparece primeiro."
              className="flex-[1_1_120px]"
            />
          )}
        </form.AppField>
      </div>
      {variante === 'prioridade' && (
        <form.AppField name="urgente">
          {(field) => (
            <field.CheckboxField label="Urgente" description="A distribuição trata como urgente." />
          )}
        </form.AppField>
      )}
      <form.AppField name="ativo">
        {(field) => (
          <field.CheckboxField
            label="Ativo"
            description={`Inativ${artigo} some das listas de escolha, mas continua nos cadastros que já usam.`}
          />
        )}
      </form.AppField>
    </>
  );

  return (
    <PainelLateral titulo={titulo} alterado={alterado} onFechar={onFechar}>
      <AbasComHistorico
        extras={item ? abas : undefined}
        aria-label={`Partes d${artigo} ${rotulos.singular}`}
      >
        <form
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-4 p-4"
        >
          {campos}
          <form.AppForm>
            <RodapePainel
              rotuloCriar={`Criar ${rotulos.singular}`}
              editando={Boolean(item)}
              excluir={excluir}
              onCancelar={onFechar}
            />
          </form.AppForm>
        </form>
        {children}
      </AbasComHistorico>
    </PainelLateral>
  );
}
