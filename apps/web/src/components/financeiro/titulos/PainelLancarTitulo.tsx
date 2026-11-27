import { useStore } from '@tanstack/react-form';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import type { AgendaRecorrenciaDto } from '../../../gen/types/AgendaRecorrenciaDto';
import type { CategoriaItemDto } from '../../../gen/types/CategoriaItemDto';
import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import type { EmpresaFinanceiroDto } from '../../../gen/types/EmpresaFinanceiroDto';
import type { OpcaoFavorecidoDto } from '../../../gen/types/OpcaoFavorecidoDto';
import type { PreviaRecorrenciaDto } from '../../../gen/types/PreviaRecorrenciaDto';
import type { RecorrenciaDetalheDto } from '../../../gen/types/RecorrenciaDetalheDto';
import type { RecorrenciaDto } from '../../../gen/types/RecorrenciaDto';
import type { TituloDetalheDto } from '../../../gen/types/TituloDetalheDto';
import type { TituloDto } from '../../../gen/types/TituloDto';
import { formatarDia, rotuloDaCategoria } from '../../../lib/financeiro';
import { plural } from '../../../lib/formato';
import { centavosDoTexto, textoDeCentavos } from '../../../lib/repasse';
import {
  diaDeHoje,
  numeroDoTitulo,
  ROTULO_AJUSTE,
  ROTULO_FREQUENCIA,
  ROTULO_ORIGEM,
  type TipoTitulo,
} from '../../../lib/titulos';
import { Alerta } from '../../alerta/Alerta';
import { mensagemDaApi } from '../../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../../busca/BuscaSelecao';
import { RodapePainel } from '../../catalogo/rodape-painel';
import { Chave } from '../../chave/Chave';
import { OpcoesField } from '../../escala/campos';
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
    emissaoEm: z.string(),
    vencimento: z.string(),
    valorCentavos: z
      .string()
      .refine(
        (v) => (centavosDoTexto(v) ?? 0) > 0,
        'Informe o valor, com vírgula nos centavos (ex.: 1.250,00).',
      ),
    contaPrevistaId: z.string(),
    observacoes: z.string().max(2000, 'Use até 2.000 caracteres.'),
    // Conta recorrente (a chave "Repetir").
    repetir: z.boolean(),
    frequencia: z.string(),
    diaVencimento: z.string(),
    primeiroVencimento: z.string(),
    ajusteDiaNaoUtil: z.string(),
    modoValor: z.string(),
    termino: z.string(),
    terminoEm: z.string(),
    terminoOcorrencias: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.favorecido) {
      ctx.addIssue({ code: 'custom', path: ['favorecido'], message: 'Escolha o favorecido.' });
    }
    const erro = (campo: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message });
    if (v.repetir) {
      if (!DIA.test(v.primeiroVencimento))
        erro('primeiroVencimento', 'Informe o primeiro vencimento.');
      const dia = Number(v.diaVencimento);
      if (v.frequencia !== 'semanal' && !(Number.isInteger(dia) && dia >= 1 && dia <= 31)) {
        erro('diaVencimento', 'O dia do vencimento vai de 1 a 31.');
      }
      if (v.termino === 'data' && !DIA.test(v.terminoEm))
        erro('terminoEm', 'Informe a data do término.');
      if (v.termino === 'ocorrencias' && !(Number(v.terminoOcorrencias) >= 1)) {
        erro('terminoOcorrencias', 'Informe quantos vencimentos (1 ou mais).');
      }
      return;
    }
    if (!DIA.test(v.emissaoEm)) erro('emissaoEm', 'Informe a data de emissão.');
    if (!DIA.test(v.vencimento)) erro('vencimento', 'Informe o vencimento.');
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
  /**
   * Conta recorrente: a chave "Repetir" ao lançar (com `editando`, o painel edita a recorrência).
   * `prever` diz os vencimentos que sairiam agora.
   */
  recorrencia?: {
    prever: (agenda: AgendaRecorrenciaDto, sinal: AbortSignal) => Promise<PreviaRecorrenciaDto>;
    onSalvar: (dados: RecorrenciaDto) => Promise<void>;
    /** Começa com a chave ligada (botão "Nova recorrência"). */
    ligada?: boolean;
    /** Editando uma recorrência (não um título). */
    editando?: RecorrenciaDetalheDto;
  };
};

const ROTULOS_FREQUENCIA = Object.entries(ROTULO_FREQUENCIA).map(([valor, rotulo]) => ({
  valor,
  rotulo,
}));

/** "Gera agora 3 títulos (05/12/2026, 05/01/2027 e 05/02/2027) e mantém sempre 3 meses à frente." */
function textoDaPrevia(p: PreviaRecorrenciaDto) {
  const meses = plural(p.horizonteMeses, { um: 'mês', varios: 'meses' });
  if (p.vencimentos.length === 0) {
    return `Nenhum título agora: o primeiro vencimento passa dos ${meses} à frente. Ele sai quando entrar no horizonte.`;
  }
  const datas = p.vencimentos.map(formatarDia);
  const lista = datas.length > 1 ? `${datas.slice(0, -1).join(', ')} e ${datas.at(-1)}` : datas[0];
  return `Gera agora ${plural(datas.length, { um: 'título', varios: 'títulos' })} (${lista}) e mantém sempre ${meses} à frente.`;
}

const valorDoFavorecido = (tipo: string, id: string) => `${tipo}:${id}`;

/** A agenda da recorrência como a API recebe. */
function agendaDe(v: Valores): Omit<AgendaRecorrenciaDto, 'contratadoId'> {
  return {
    frequencia: v.frequencia as AgendaRecorrenciaDto['frequencia'],
    diaVencimento: v.frequencia === 'semanal' || !v.diaVencimento ? null : Number(v.diaVencimento),
    primeiroVencimento: v.primeiroVencimento,
    ajusteDiaNaoUtil: (v.ajusteDiaNaoUtil || null) as AgendaRecorrenciaDto['ajusteDiaNaoUtil'],
    termino: v.termino as AgendaRecorrenciaDto['termino'],
    terminoEm: v.termino === 'data' ? v.terminoEm || null : null,
    terminoOcorrencias:
      v.termino === 'ocorrencias' && v.terminoOcorrencias ? Number(v.terminoOcorrencias) : null,
  };
}

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
  recorrencia,
}: PainelLancarTituloProps) {
  const rec = recorrencia?.editando;
  const travaAgenda = Boolean(rec && rec.ocorrencias.length > 0);
  const textos = TEXTOS_DO_TIPO[tipo];
  const [erro, setErro] = useState<string>();
  // A categoria padrão de cada fornecedor que a busca trouxe: sugerida ao escolhê-lo.
  const categoriaPadrao = useRef(new Map<string, string | null>());
  // Título de outra origem (faturamento...): valor e favorecido não se editam.
  const travado = Boolean(titulo && titulo.origem !== 'manual');

  const favorecidoAtual =
    titulo?.favorecido ?? (rec && { ...rec.favorecido, nome: rec.favorecidoNome });
  const iniciais: Valores = {
    contratadoId:
      titulo?.contratadoId ??
      rec?.contratadoId ??
      (empresas.length === 1 ? (empresas[0]?.id ?? '') : ''),
    favorecido: favorecidoAtual
      ? {
          valor: valorDoFavorecido(favorecidoAtual.tipo, favorecidoAtual.id),
          rotulo: favorecidoAtual.nome,
          detalhe: tipo === 'pagar' ? ROTULO_FAVORECIDO[favorecidoAtual.tipo] : null,
        }
      : null,
    categoriaId: titulo?.categoriaId ?? rec?.categoriaId ?? '',
    descricao: titulo?.descricao ?? rec?.descricao ?? '',
    documento: titulo?.documento ?? '',
    competencia: competenciaParaTela(titulo?.competencia ?? null),
    emissaoEm: titulo?.emissaoEm ?? diaDeHoje(),
    vencimento: titulo?.vencimento ?? '',
    valorCentavos: titulo
      ? textoDeCentavos(titulo.valorCentavos)
      : rec
        ? textoDeCentavos(rec.valorCentavos)
        : '',
    contaPrevistaId: titulo?.contaPrevistaId ?? rec?.contaPrevistaId ?? '',
    observacoes: titulo?.observacoes ?? rec?.observacoes ?? '',
    repetir: Boolean(rec || recorrencia?.ligada),
    frequencia: rec?.frequencia ?? 'mensal',
    diaVencimento: rec?.diaVencimento ? String(rec.diaVencimento) : '',
    primeiroVencimento: rec?.primeiroVencimento ?? '',
    ajusteDiaNaoUtil: rec?.ajusteDiaNaoUtil ?? '',
    modoValor: rec?.modoValor ?? 'fixo',
    termino: rec?.termino ?? 'sem',
    terminoEm: rec?.terminoEm ?? '',
    terminoOcorrencias: rec?.terminoOcorrencias ? String(rec.terminoOcorrencias) : '',
  };

  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      const [favTipo = '', favId = ''] = (value.favorecido?.valor ?? '').split(':');
      const favorecido = { tipo: favTipo as TituloDto['favorecido']['tipo'], id: favId };
      try {
        if (value.repetir && recorrencia) {
          await recorrencia.onSalvar({
            contratadoId: value.contratadoId,
            favorecido,
            categoriaId: value.categoriaId,
            descricao: value.descricao.trim(),
            valorCentavos: centavosDoTexto(value.valorCentavos) ?? 0,
            modoValor: value.modoValor as RecorrenciaDto['modoValor'],
            ...agendaDe(value),
            contaPrevistaId: value.contaPrevistaId || null,
            observacoes: value.observacoes.trim() || null,
          });
          return;
        }
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
  const repetir = useStore(form.store, (s) => s.values.repetir);
  const frequencia = useStore(form.store, (s) => s.values.frequencia);
  const termino = useStore(form.store, (s) => s.values.termino);
  const agenda = useStore(form.store, (s) => JSON.stringify(agendaDe(s.values)));
  const [previa, setPrevia] = useState<PreviaRecorrenciaDto>();

  // A prévia dos vencimentos segue o que se digita (com espera e cancelando a anterior).
  const prever = recorrencia?.prever;
  useEffect(() => {
    if (!repetir || !prever || !empresa || rec) return;
    const controle = new AbortController();
    const espera = setTimeout(() => {
      prever({ contratadoId: empresa, ...JSON.parse(agenda) }, controle.signal)
        .then(setPrevia)
        .catch(() => setPrevia(undefined));
    }, 300);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [repetir, prever, empresa, agenda, rec]);

  // O título ou a recorrência editada: o que já usam continua na lista mesmo se inativo.
  const atual = titulo ?? rec;
  const opcoesCategoria = [
    ...categorias.map((c) => ({ valor: c.id, rotulo: rotuloDaCategoria(c) })),
    // A categoria inativa que o título já usa continua na lista, para não sumir da tela.
    ...(atual && !categorias.some((c) => c.id === atual.categoriaId)
      ? [{ valor: atual.categoriaId, rotulo: atual.categoriaNome }]
      : []),
  ];
  const contasDaEmpresa = contas.filter((c) => c.contratadoId === empresa);
  const opcoesConta = [
    { valor: '', rotulo: 'Nenhuma' },
    ...contasDaEmpresa.map((c) => ({ valor: c.id, rotulo: c.apelido })),
    ...(atual?.contaPrevistaId && !contasDaEmpresa.some((c) => c.id === atual.contaPrevistaId)
      ? [{ valor: atual.contaPrevistaId, rotulo: atual.contaPrevistaNome ?? '—' }]
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
      titulo={
        rec
          ? 'Editar recorrência'
          : titulo
            ? `Editar ${numeroDoTitulo(tipo, titulo.numero)}`
            : textos.lancar
      }
      subtitulo={
        titulo
          ? `${titulo.favorecido.nome} · ${titulo.empresaNome}`
          : rec
            ? `${rec.favorecidoNome} · ${rec.empresaNome}`
            : undefined
      }
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
        {titulo || rec ? (
          <CampoSomenteLeitura
            label="Empresa"
            value={titulo?.empresaNome ?? rec?.empresaNome ?? ''}
          />
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
        {!repetir && (
          <div className="flex flex-wrap gap-4">
            <form.AppField name="emissaoEm">
              {() => <DateField label="Emissão" required className="flex-[1_1_150px]" />}
            </form.AppField>
            <form.AppField name="vencimento">
              {() => <DateField label="Vencimento" required className="flex-[1_1_150px]" />}
            </form.AppField>
          </div>
        )}
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
          {!repetir && (
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
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          {!repetir && (
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
          )}
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
        {recorrencia && !titulo && !rec && (
          <form.AppField name="repetir">
            {(field) => (
              <Chave
                rotulo="Repetir (conta recorrente)"
                descricao="Gera títulos independentes de tempos em tempos (aluguel, contador, mensalidade)."
                ligado={field.state.value}
                onMudar={(v) => field.handleChange(v)}
              />
            )}
          </form.AppField>
        )}
        {repetir && (
          <fieldset className="bg-muted/40 flex flex-col gap-4 rounded-lg border p-4">
            <legend className="px-1 font-semibold">Recorrência</legend>
            {travaAgenda && (
              <p className="text-muted-foreground text-[13px]">
                A frequência e o primeiro vencimento não mudam depois de gerar títulos. Para mudar,
                encerre esta e crie outra.
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              {travaAgenda && rec ? (
                <CampoSomenteLeitura
                  label="Frequência"
                  value={ROTULO_FREQUENCIA[rec.frequencia] ?? rec.frequencia}
                  className="flex-[1_1_150px]"
                />
              ) : (
                <form.AppField name="frequencia">
                  {(field) => (
                    <field.SelectField
                      label="Frequência"
                      required
                      placeholder="Escolha"
                      opcoes={ROTULOS_FREQUENCIA}
                      className="flex-[1_1_150px]"
                    />
                  )}
                </form.AppField>
              )}
              {frequencia !== 'semanal' && (
                <form.AppField name="diaVencimento">
                  {(field) => (
                    <field.NumberField
                      label="Dia do vencimento"
                      required
                      placeholder="5"
                      min={1}
                      max={31}
                      className="flex-[1_1_120px]"
                    />
                  )}
                </form.AppField>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {travaAgenda && rec ? (
                <CampoSomenteLeitura
                  label="Primeiro vencimento"
                  value={formatarDia(rec.primeiroVencimento)}
                  className="flex-[1_1_150px]"
                />
              ) : (
                <form.AppField
                  name="primeiroVencimento"
                  listeners={{
                    onChange: ({ value }) => {
                      // O dia do vencimento vem do primeiro, quando ainda está vazio.
                      if (DIA.test(value) && !form.getFieldValue('diaVencimento')) {
                        form.setFieldValue('diaVencimento', String(Number(value.slice(8, 10))));
                      }
                    },
                  }}
                >
                  {() => (
                    <DateField label="Primeiro vencimento" required className="flex-[1_1_150px]" />
                  )}
                </form.AppField>
              )}
              <form.AppField name="ajusteDiaNaoUtil">
                {(field) => (
                  <field.SelectField
                    label="Fim de semana ou feriado"
                    placeholder="Padrão da empresa"
                    opcoes={[
                      {
                        valor: '',
                        rotulo: `Padrão da empresa${
                          previa ? ` (${ROTULO_AJUSTE[previa.ajustePadrao]?.toLowerCase()})` : ''
                        }`,
                      },
                      ...Object.entries(ROTULO_AJUSTE).map(([valor, rotulo]) => ({
                        valor,
                        rotulo,
                      })),
                    ]}
                    className="flex-[1_1_200px]"
                  />
                )}
              </form.AppField>
            </div>
            <p className="text-muted-foreground -mt-2 text-[13px]">
              Dia que não existe no mês (31 em fevereiro) vira o último dia. Feriados ainda não
              entram: só sábado e domingo.
            </p>
            <form.AppField name="modoValor">
              {(field) => (
                <Chave
                  rotulo="Valor muda todo mês"
                  descricao="O título nasce com o valor previsto e o financeiro confere antes de pagar."
                  ligado={field.state.value === 'previsto'}
                  onMudar={(v) => field.handleChange(v ? 'previsto' : 'fixo')}
                />
              )}
            </form.AppField>
            <form.AppField name="termino">
              {() => (
                <OpcoesField
                  label="Término"
                  required
                  opcoes={[
                    { valor: 'sem', rotulo: 'Sem término' },
                    { valor: 'data', rotulo: 'Até uma data' },
                    { valor: 'ocorrencias', rotulo: 'Após N vencimentos' },
                  ]}
                />
              )}
            </form.AppField>
            {termino === 'data' && (
              <form.AppField name="terminoEm">
                {() => <DateField label="Até" required className="max-w-[220px]" />}
              </form.AppField>
            )}
            {termino === 'ocorrencias' && (
              <form.AppField name="terminoOcorrencias">
                {(field) => (
                  <field.NumberField
                    label="Quantos vencimentos"
                    required
                    placeholder="12"
                    min={1}
                    max={1000}
                    className="max-w-[220px]"
                  />
                )}
              </form.AppField>
            )}
            {!rec && previa && (
              <p aria-live="polite" className="text-[13px]">
                {textoDaPrevia(previa)}
              </p>
            )}
          </fieldset>
        )}
        <form.AppField name="observacoes">
          {(field) => <field.TextAreaField label="Observações" placeholder="Opcional" />}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar={repetir ? 'Criar recorrência' : textos.lancar}
            editando={Boolean(titulo || rec)}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
