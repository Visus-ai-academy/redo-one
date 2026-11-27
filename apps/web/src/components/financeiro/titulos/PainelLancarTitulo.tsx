import { useStore } from '@tanstack/react-form';
import { useRef, useState } from 'react';
import { z } from 'zod';

import type { CategoriaItemDto } from '../../../gen/types/CategoriaItemDto';
import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import type { EmpresaFinanceiroDto } from '../../../gen/types/EmpresaFinanceiroDto';
import type { OpcaoFavorecidoDto } from '../../../gen/types/OpcaoFavorecidoDto';
import type { TituloDetalheDto } from '../../../gen/types/TituloDetalheDto';
import type { TituloDto } from '../../../gen/types/TituloDto';
import { rotuloDaCategoria } from '../../../lib/financeiro';
import { centavosDoTexto, textoDeCentavos } from '../../../lib/repasse';
import { diaDeHoje, numeroDoTitulo, ROTULO_ORIGEM, type TipoTitulo } from '../../../lib/titulos';
import { Alerta } from '../../alerta/Alerta';
import { mensagemDaApi } from '../../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../../busca/BuscaSelecao';
import { RodapePainel } from '../../catalogo/rodape-painel';
import { CampoSomenteLeitura } from '../../form/CampoSomenteLeitura';
import { DateField } from '../../form/DateField';
import { mostrarErrosDoServidor } from '../../form/erros-do-servidor';
import { useAppForm } from '../../form/form';
import { useAlterado } from '../../painel/fechamento';
import { PainelLateral } from '../../painel/PainelLateral';
import { TEXTOS_DO_TIPO } from './api';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^(0[1-9]|1[0-2])\/\d{4}$/;
const ROTULO_FAVORECIDO: Record<string, string> = {
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  medico: 'Médico',
};

/** "11/2026" ↔ "2026-11". */
const competenciaDaTela = (texto: string) => {
  const [mes, ano] = texto.trim().split('/');
  return `${ano}-${mes}`;
};
const competenciaParaTela = (valor: string | null) =>
  valor ? `${valor.slice(5, 7)}/${valor.slice(0, 4)}` : '';

const schema = z
  .object({
    contratadoId: z.string().min(1, 'Escolha a empresa.'),
    favorecido: z
      .object({ valor: z.string(), rotulo: z.string(), detalhe: z.string().nullish() })
      .nullable(),
    categoriaId: z.string().min(1, 'Escolha a categoria.'),
    descricao: z.string().trim().min(1, 'Informe a descrição.').max(200, 'Use até 200 caracteres.'),
    documento: z.string().max(60, 'Use até 60 caracteres.'),
    competencia: z
      .string()
      .refine((v) => v.trim() === '' || COMPETENCIA.test(v.trim()), 'Use o mês e o ano: 11/2026.'),
    emissaoEm: z.string().regex(DIA, 'Informe a data de emissão.'),
    vencimento: z.string().regex(DIA, 'Informe o vencimento.'),
    valorCentavos: z
      .string()
      .refine(
        (v) => (centavosDoTexto(v) ?? 0) > 0,
        'Informe o valor, com vírgula nos centavos (ex.: 1.250,00).',
      ),
    contaPrevistaId: z.string(),
    observacoes: z.string().max(2000, 'Use até 2.000 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (!v.favorecido) {
      ctx.addIssue({ code: 'custom', path: ['favorecido'], message: 'Escolha o favorecido.' });
    }
    if (DIA.test(v.emissaoEm) && DIA.test(v.vencimento) && v.vencimento < v.emissaoEm) {
      ctx.addIssue({
        code: 'custom',
        path: ['vencimento'],
        message: 'O vencimento não pode ser antes da emissão.',
      });
    }
  });

type Valores = z.infer<typeof schema>;

export type PainelLancarTituloProps = {
  tipo: TipoTitulo;
  /** Sem título, lança um novo. */
  titulo?: TituloDetalheDto;
  empresas: EmpresaFinanceiroDto[];
  /** Categorias ativas do tipo do título (despesa ou receita). */
  categorias: CategoriaItemDto[];
  /** Contas bancárias ativas de todas as empresas: a lista segue a empresa escolhida. */
  contas: ContaBancariaItemDto[];
  /** Busca de quem pode ser o favorecido (repasse o `sinal` à API). */
  buscarFavorecidos: (termo: string, sinal?: AbortSignal) => Promise<OpcaoFavorecidoDto[]>;
  onSalvar: (dados: TituloDto) => Promise<void>;
  onFechar: () => void;
};

const valorDoFavorecido = (tipo: string, id: string) => `${tipo}:${id}`;

/** Lançar e editar o título a pagar ou a receber, no painel lateral. */
export function PainelLancarTitulo({
  tipo,
  titulo,
  empresas,
  categorias,
  contas,
  buscarFavorecidos,
  onSalvar,
  onFechar,
}: PainelLancarTituloProps) {
  const textos = TEXTOS_DO_TIPO[tipo];
  const [erro, setErro] = useState<string>();
  // A categoria padrão de cada fornecedor que a busca trouxe: sugerida ao escolhê-lo.
  const categoriaPadrao = useRef(new Map<string, string | null>());
  // Título de outra origem (faturamento...): valor e favorecido não se editam.
  const travado = Boolean(titulo && titulo.origem !== 'manual');

  const iniciais: Valores = {
    contratadoId: titulo?.contratadoId ?? (empresas.length === 1 ? (empresas[0]?.id ?? '') : ''),
    favorecido: titulo
      ? {
          valor: valorDoFavorecido(titulo.favorecido.tipo, titulo.favorecido.id),
          rotulo: titulo.favorecido.nome,
          detalhe: tipo === 'pagar' ? ROTULO_FAVORECIDO[titulo.favorecido.tipo] : null,
        }
      : null,
    categoriaId: titulo?.categoriaId ?? '',
    descricao: titulo?.descricao ?? '',
    documento: titulo?.documento ?? '',
    competencia: competenciaParaTela(titulo?.competencia ?? null),
    emissaoEm: titulo?.emissaoEm ?? diaDeHoje(),
    vencimento: titulo?.vencimento ?? '',
    valorCentavos: titulo ? textoDeCentavos(titulo.valorCentavos) : '',
    contaPrevistaId: titulo?.contaPrevistaId ?? '',
    observacoes: titulo?.observacoes ?? '',
  };

  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      const [favTipo = '', favId = ''] = (value.favorecido?.valor ?? '').split(':');
      try {
        await onSalvar({
          contratadoId: value.contratadoId,
          favorecido: { tipo: favTipo as TituloDto['favorecido']['tipo'], id: favId },
          categoriaId: value.categoriaId,
          descricao: value.descricao.trim(),
          documento: value.documento.trim() || null,
          competencia: value.competencia.trim() ? competenciaDaTela(value.competencia) : null,
          emissaoEm: value.emissaoEm,
          vencimento: value.vencimento,
          valorCentavos: centavosDoTexto(value.valorCentavos) ?? 0,
          contaPrevistaId: value.contaPrevistaId || null,
          observacoes: value.observacoes.trim() || null,
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
  const empresa = useStore(form.store, (s) => s.values.contratadoId);

  const opcoesCategoria = [
    ...categorias.map((c) => ({ valor: c.id, rotulo: rotuloDaCategoria(c) })),
    // A categoria inativa que o título já usa continua na lista, para não sumir da tela.
    ...(titulo && !categorias.some((c) => c.id === titulo.categoriaId)
      ? [{ valor: titulo.categoriaId, rotulo: titulo.categoriaNome }]
      : []),
  ];
  const contasDaEmpresa = contas.filter((c) => c.contratadoId === empresa);
  const opcoesConta = [
    { valor: '', rotulo: 'Nenhuma' },
    ...contasDaEmpresa.map((c) => ({ valor: c.id, rotulo: c.apelido })),
    ...(titulo?.contaPrevistaId && !contasDaEmpresa.some((c) => c.id === titulo.contaPrevistaId)
      ? [{ valor: titulo.contaPrevistaId, rotulo: titulo.contaPrevistaNome ?? '—' }]
      : []),
  ];

  const buscar = async (termo: string, sinal?: AbortSignal): Promise<OpcaoBusca[]> => {
    const opcoes = await buscarFavorecidos(termo, sinal);
    return opcoes.map((o) => {
      const valor = valorDoFavorecido(o.tipo, o.id);
      categoriaPadrao.current.set(valor, o.categoriaPadraoId);
      const tipoFav = tipo === 'pagar' ? ROTULO_FAVORECIDO[o.tipo] : null;
      return {
        valor,
        rotulo: o.nome,
        detalhe: [tipoFav, o.detalhe].filter(Boolean).join(' · ') || null,
      };
    });
  };

  return (
    <PainelLateral
      titulo={titulo ? `Editar ${numeroDoTitulo(tipo, titulo.numero)}` : textos.lancar}
      subtitulo={titulo ? `${titulo.favorecido.nome} · ${titulo.empresaNome}` : undefined}
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
        {travado && titulo && (
          <Alerta tom="info">
            {`Veio de ${ROTULO_ORIGEM[titulo.origem]?.toLowerCase() ?? 'outra origem'}. ${textos.favorecido} e valor não se editam aqui.`}
          </Alerta>
        )}
        {titulo ? (
          <CampoSomenteLeitura label="Empresa" value={titulo.empresaNome} />
        ) : (
          <form.AppField
            name="contratadoId"
            listeners={{ onChange: () => form.setFieldValue('contaPrevistaId', '') }}
          >
            {(field) => (
              <field.SelectField
                label="Empresa"
                required
                placeholder="Escolha a empresa"
                opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
              />
            )}
          </form.AppField>
        )}
        {travado && titulo ? (
          <CampoSomenteLeitura label={textos.favorecido} value={titulo.favorecido.nome} />
        ) : (
          <form.AppField
            name="favorecido"
            listeners={{
              onChange: ({ value }) => {
                const sugerida = value ? categoriaPadrao.current.get(value.valor) : null;
                if (sugerida && !form.getFieldValue('categoriaId')) {
                  form.setFieldValue('categoriaId', sugerida);
                }
              },
            }}
          >
            {(field) => (
              <field.BuscaField
                label={textos.favorecido}
                required
                chave={`favorecidos-${tipo}`}
                placeholder={
                  tipo === 'pagar' ? 'Busque o fornecedor ou o médico' : 'Busque o cliente'
                }
                buscar={buscar}
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="categoriaId">
          {(field) => (
            <field.SelectField
              label="Categoria"
              required
              placeholder="Escolha a categoria"
              description={
                tipo === 'pagar'
                  ? 'Vem a categoria padrão do fornecedor, quando ele tem.'
                  : undefined
              }
              opcoes={opcoesCategoria}
            />
          )}
        </form.AppField>
        <form.AppField name="descricao">
          {(field) => (
            <field.TextField
              label="Descrição"
              required
              placeholder={
                tipo === 'pagar' ? 'Ex.: Honorários de dezembro' : 'Ex.: Laudos de outubro'
              }
              autoComplete="off"
            />
          )}
        </form.AppField>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="emissaoEm">
            {() => <DateField label="Emissão" required className="flex-[1_1_150px]" />}
          </form.AppField>
          <form.AppField name="vencimento">
            {() => <DateField label="Vencimento" required className="flex-[1_1_150px]" />}
          </form.AppField>
        </div>
        <div className="flex flex-wrap gap-4">
          {travado && titulo ? (
            <CampoSomenteLeitura
              label="Valor (R$)"
              value={textoDeCentavos(titulo.valorCentavos)}
              className="flex-[1_1_150px]"
            />
          ) : (
            <form.AppField name="valorCentavos">
              {(field) => (
                <field.TextField
                  label="Valor (R$)"
                  required
                  placeholder="Ex.: 3.800,00"
                  inputMode="decimal"
                  spellCheck={false}
                  className="flex-[1_1_150px]"
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="competencia">
            {(field) => (
              <field.TextField
                label="Competência"
                placeholder="11/2026"
                inputMode="numeric"
                autoComplete="off"
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
        </div>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="documento">
            {(field) => (
              <field.TextField
                label="Documento"
                placeholder="Nº da NF ou do boleto"
                autoComplete="off"
                className="flex-[1_1_150px]"
              />
            )}
          </form.AppField>
          <form.AppField name="contaPrevistaId">
            {(field) => (
              <field.SelectField
                label="Conta prevista"
                placeholder={empresa ? 'Nenhuma' : 'Escolha a empresa antes'}
                disabled={!empresa}
                opcoes={opcoesConta}
                className="flex-[1_1_150px]"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="observacoes">
          {(field) => <field.TextAreaField label="Observações" placeholder="Opcional" />}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar={textos.lancar}
            editando={Boolean(titulo)}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
