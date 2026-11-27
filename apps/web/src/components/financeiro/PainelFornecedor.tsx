import { useStore } from '@tanstack/react-form';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';
import type { CategoriaItemDto } from '../../gen/types/CategoriaItemDto';
import type { FornecedorDetalheDto } from '../../gen/types/FornecedorDetalheDto';
import type { FornecedorDto } from '../../gen/types/FornecedorDto';
import { juntarDigito, separarDigito } from '../../lib/conta-digito';
import { formatarCep, formatarCnpj, formatarCpf, soDigitos } from '../../lib/documentos';
import { contaPorExtenso, rotuloDaCategoria } from '../../lib/financeiro';
import { aplicarMascara, type Mascara } from '../../lib/mascaras';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { UFS } from '../faturamento/dados-faturamento';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { mostrarErrosDoServidor } from '../form/erros-do-servidor';
import { useAppForm } from '../form/form';
import { AbasComHistorico } from '../historico-cadastro/AbasComHistorico';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';

const TIPOS_PIX = [
  { valor: 'CNPJ', rotulo: 'CNPJ' },
  { valor: 'CPF', rotulo: 'CPF' },
  { valor: 'EMAIL', rotulo: 'E-mail' },
  { valor: 'TELEFONE', rotulo: 'Telefone' },
  { valor: 'ALEATORIA', rotulo: 'Chave aleatória' },
];
/** Chave Pix de CPF, CNPJ ou telefone ganha a máscara do tipo. */
const MASCARA_PIX: Record<string, Mascara | undefined> = {
  CPF: 'cpf',
  CNPJ: 'cnpj',
  TELEFONE: 'telefone',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tamanho = (n: number, mensagem: string) =>
  z.string().refine((v) => v.trim() === '' || soDigitos(v).length === n, mensagem);

const schema = z
  .object({
    tipoPessoa: z.enum(['PJ', 'PF']),
    razaoSocial: z.string().trim().min(1, 'Informe a razão social ou o nome.').max(200),
    nomeFantasia: z.string().max(200),
    cnpj: tamanho(14, 'O CNPJ tem 14 dígitos.'),
    cpf: tamanho(11, 'O CPF tem 11 dígitos.'),
    email: z
      .string()
      .refine(
        (v) => v.trim() === '' || EMAIL.test(v.trim()),
        'Confira o e-mail: falta @ ou domínio.',
      ),
    telefone: z
      .string()
      .refine(
        (v) => v.trim() === '' || [10, 11].includes(soDigitos(v).length),
        'O telefone tem DDD e 8 ou 9 dígitos.',
      ),
    cep: tamanho(8, 'O CEP tem 8 dígitos.'),
    logradouro: z.string(),
    numero: z.string(),
    complemento: z.string(),
    bairro: z.string(),
    cidade: z.string(),
    uf: z.string(),
    tipoChavePix: z.string(),
    chavePix: z.string(),
    bancoCodigo: z
      .string()
      .refine(
        (v) => v.trim() === '' || /^\d{3}$/.test(v.trim()),
        'O código do banco tem 3 dígitos (ex.: 341).',
      ),
    agencia: z.string().max(10),
    conta: z.string().max(17, 'Use até 17 caracteres.'),
    digito: z.string().max(2, 'Use até 2 caracteres.'),
    categoriaPadraoId: z.string(),
    ativo: z.boolean(),
    observacoes: z.string().max(2000, 'Use até 2.000 caracteres.'),
  })
  .superRefine((v, ctx) => {
    const erro = (campo: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message });
    if (v.tipoPessoa === 'PJ' && !v.cnpj.trim()) erro('cnpj', 'Informe o CNPJ.');
    if (v.tipoPessoa === 'PF' && !v.cpf.trim()) erro('cpf', 'Informe o CPF.');
    const endereco = [v.cep, v.logradouro, v.numero, v.complemento, v.bairro, v.cidade, v.uf];
    if (endereco.some((c) => c.trim())) {
      if (!v.cep.trim()) erro('cep', 'Informe o CEP.');
      if (!v.logradouro.trim()) erro('logradouro', 'Informe o logradouro.');
      if (!v.cidade.trim()) erro('cidade', 'Informe a cidade.');
      if (!v.uf) erro('uf', 'Escolha a UF.');
    }
    if (v.chavePix.trim() && !v.tipoChavePix) erro('tipoChavePix', 'Escolha o tipo da chave Pix.');
    if (v.tipoChavePix && !v.chavePix.trim())
      erro('chavePix', 'Informe a chave Pix junto com o tipo dela.');
  });

type PainelFornecedorProps = {
  /** Sem fornecedor, o painel cria um novo. */
  fornecedor?: FornecedorDetalheDto;
  /** Categorias de despesa ativas (a categoria padrão). */
  categorias: CategoriaItemDto[];
  podeEditar: boolean;
  onSalvar: (dados: FornecedorDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
  /** Aba Histórico (só de quem já existe). */
  historico?: ReactNode;
  /** Aba Títulos (só de quem já existe). */
  titulos?: ReactNode;
};

const opcional = (texto: string) => texto.trim() || null;
const documentoDe = (f: FornecedorDetalheDto) =>
  f.tipoPessoa === 'PJ' ? formatarCnpj(f.cnpj) : formatarCpf(f.cpf);

/** Fornecedor: criar, ver e editar, com as abas Cadastro, Títulos e Histórico. */
export function PainelFornecedor({
  fornecedor,
  categorias,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
  historico,
  titulos,
}: PainelFornecedorProps) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    tipoPessoa: (fornecedor?.tipoPessoa ?? 'PJ') as 'PJ' | 'PF',
    razaoSocial: fornecedor?.razaoSocial ?? '',
    nomeFantasia: fornecedor?.nomeFantasia ?? '',
    cnpj: fornecedor?.cnpj ? formatarCnpj(fornecedor.cnpj) : '',
    cpf: fornecedor?.cpf ? formatarCpf(fornecedor.cpf) : '',
    email: fornecedor?.email ?? '',
    telefone: fornecedor?.telefone ? aplicarMascara('telefone', fornecedor.telefone) : '',
    cep: fornecedor?.cep ? formatarCep(fornecedor.cep) : '',
    logradouro: fornecedor?.logradouro ?? '',
    numero: fornecedor?.numero ?? '',
    complemento: fornecedor?.complemento ?? '',
    bairro: fornecedor?.bairro ?? '',
    cidade: fornecedor?.cidade ?? '',
    uf: fornecedor?.uf ?? '',
    tipoChavePix: fornecedor?.tipoChavePix ?? '',
    chavePix:
      fornecedor?.chavePix && fornecedor.tipoChavePix && MASCARA_PIX[fornecedor.tipoChavePix]
        ? aplicarMascara(MASCARA_PIX[fornecedor.tipoChavePix] as Mascara, fornecedor.chavePix)
        : (fornecedor?.chavePix ?? ''),
    bancoCodigo: fornecedor?.bancoCodigo ?? '',
    agencia: fornecedor?.agencia ?? '',
    ...separarDigito(fornecedor?.conta ?? ''),
    categoriaPadraoId: fornecedor?.categoriaPadraoId ?? '',
    ativo: fornecedor?.ativo ?? true,
    observacoes: fornecedor?.observacoes ?? '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      const pj = value.tipoPessoa === 'PJ';
      try {
        await onSalvar({
          tipoPessoa: value.tipoPessoa,
          razaoSocial: value.razaoSocial.trim(),
          nomeFantasia: opcional(value.nomeFantasia),
          cnpj: pj ? soDigitos(value.cnpj) || null : null,
          cpf: pj ? null : soDigitos(value.cpf) || null,
          email: opcional(value.email),
          telefone: soDigitos(value.telefone) || null,
          cep: soDigitos(value.cep) || null,
          logradouro: opcional(value.logradouro),
          numero: opcional(value.numero),
          complemento: opcional(value.complemento),
          bairro: opcional(value.bairro),
          cidade: opcional(value.cidade),
          uf: value.uf || null,
          tipoChavePix: (value.tipoChavePix || null) as FornecedorDto['tipoChavePix'],
          chavePix: MASCARA_PIX[value.tipoChavePix]
            ? soDigitos(value.chavePix) || null
            : opcional(value.chavePix),
          bancoCodigo: opcional(value.bancoCodigo),
          agencia: opcional(value.agencia),
          conta: opcional(juntarDigito(value.conta, value.digito)),
          categoriaPadraoId: value.categoriaPadraoId || null,
          ativo: value.ativo,
          observacoes: opcional(value.observacoes),
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
  const tipoPessoa = useStore(form.store, (s) => s.values.tipoPessoa);
  const tipoChavePix = useStore(form.store, (s) => s.values.tipoChavePix);

  // Categoria padrão inativa que o fornecedor já usa continua na lista, para não sumir da tela.
  const opcoesCategoria = [
    { valor: '', rotulo: 'Nenhuma' },
    ...categorias.map((c) => ({ valor: c.id, rotulo: rotuloDaCategoria(c) })),
    ...(fornecedor?.categoriaPadraoId &&
    !categorias.some((c) => c.id === fornecedor.categoriaPadraoId)
      ? [{ valor: fornecedor.categoriaPadraoId, rotulo: fornecedor.categoriaPadraoNome ?? '—' }]
      : []),
  ];

  const excluir =
    fornecedor && onExcluir
      ? {
          acao: 'Excluir fornecedor',
          titulo: `Excluir ${fornecedor.razaoSocial}?`,
          consequencia:
            'O fornecedor sai do cadastro. Com títulos lançados, a exclusão é recusada: desative em vez de excluir.',
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

  const subtitulo = fornecedor ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{documentoDe(fornecedor)}</span>
      {fornecedor.ativo ? (
        <Etiqueta tom="sucesso">Ativo</Etiqueta>
      ) : (
        <Etiqueta tom="inativo">Inativo</Etiqueta>
      )}
    </span>
  ) : undefined;
  const extras =
    fornecedor && titulos ? [{ valor: 'titulos', rotulo: 'Títulos', conteudo: titulos }] : [];

  if (!podeEditar && fornecedor) {
    const endereco = [
      fornecedor.logradouro,
      fornecedor.numero,
      fornecedor.complemento,
      fornecedor.bairro,
      fornecedor.cidade && fornecedor.uf
        ? `${fornecedor.cidade}/${fornecedor.uf}`
        : fornecedor.cidade,
      fornecedor.cep && formatarCep(fornecedor.cep),
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <PainelLateral titulo={fornecedor.razaoSocial} subtitulo={subtitulo} onFechar={onFechar}>
        <AbasComHistorico
          historico={historico}
          extras={extras}
          aria-label="Partes do cadastro do fornecedor"
        >
          <div className="flex flex-col gap-4 p-4">
            {erro && <Alerta tom="erro">{erro}</Alerta>}
            <CampoSomenteLeitura label="Nome fantasia" value={fornecedor.nomeFantasia ?? '—'} />
            <CampoSomenteLeitura label="E-mail" value={fornecedor.email ?? '—'} />
            <CampoSomenteLeitura
              label="Telefone"
              value={fornecedor.telefone ? aplicarMascara('telefone', fornecedor.telefone) : '—'}
            />
            <CampoSomenteLeitura label="Endereço" value={endereco || '—'} />
            <CampoSomenteLeitura
              label="Chave Pix"
              value={
                fornecedor.chavePix ? `${fornecedor.tipoChavePix}: ${fornecedor.chavePix}` : '—'
              }
            />
            <CampoSomenteLeitura
              label="Banco · agência · conta"
              value={contaPorExtenso({ ...fornecedor, digito: null })}
            />
            <CampoSomenteLeitura
              label="Categoria padrão"
              value={fornecedor.categoriaPadraoNome ?? '—'}
            />
            <CampoSomenteLeitura label="Observações" value={fornecedor.observacoes ?? '—'} />
            <RodapeSomenteLeitura excluir={excluir} />
          </div>
        </AbasComHistorico>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral
      titulo={fornecedor?.razaoSocial ?? 'Novo fornecedor'}
      subtitulo={subtitulo}
      onFechar={onFechar}
      alterado={alterado}
    >
      <AbasComHistorico
        historico={historico}
        extras={extras}
        aria-label="Partes do cadastro do fornecedor"
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
          <div className="flex flex-wrap gap-4">
            <form.AppField name="tipoPessoa">
              {(field) => (
                <field.SegmentadaField
                  label="Tipo de pessoa"
                  required
                  opcoes={[
                    { valor: 'PJ', rotulo: 'Pessoa jurídica' },
                    { valor: 'PF', rotulo: 'Pessoa física' },
                  ]}
                  className="flex-[1_1_150px]"
                />
              )}
            </form.AppField>
            {tipoPessoa === 'PJ' ? (
              <form.AppField name="cnpj">
                {(field) => (
                  <field.TextField
                    label="CNPJ"
                    required
                    mascara="cnpj"
                    placeholder="00.000.000/0000-00"
                    autoComplete="off"
                    className="flex-[1_1_180px]"
                  />
                )}
              </form.AppField>
            ) : (
              <form.AppField name="cpf">
                {(field) => (
                  <field.TextField
                    label="CPF"
                    required
                    mascara="cpf"
                    placeholder="000.000.000-00"
                    autoComplete="off"
                    className="flex-[1_1_180px]"
                  />
                )}
              </form.AppField>
            )}
          </div>
          <form.AppField name="razaoSocial">
            {(field) => (
              <field.TextField
                label={tipoPessoa === 'PJ' ? 'Razão social' : 'Nome'}
                required
                placeholder={
                  tipoPessoa === 'PJ' ? 'Ex.: Ômega Serviços Contábeis Ltda.' : 'Ex.: Ana Prado'
                }
                autoComplete="off"
              />
            )}
          </form.AppField>
          {tipoPessoa === 'PJ' && (
            <form.AppField name="nomeFantasia">
              {(field) => (
                <field.TextField
                  label="Nome fantasia"
                  placeholder="Ex.: Contabilidade Ômega"
                  autoComplete="off"
                />
              )}
            </form.AppField>
          )}
          <div className="flex flex-wrap gap-4">
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  label="E-mail"
                  type="email"
                  placeholder="financeiro@empresa.com.br"
                  className="flex-[2_1_200px]"
                />
              )}
            </form.AppField>
            <form.AppField name="telefone">
              {(field) => (
                <field.TextField
                  label="Telefone"
                  mascara="telefone"
                  placeholder="(11) 3456-7890"
                  autoComplete="off"
                  className="flex-[1_1_150px]"
                />
              )}
            </form.AppField>
          </div>
          <form.AppField name="categoriaPadraoId">
            {(field) => (
              <field.SelectField
                label="Categoria padrão"
                placeholder="Nenhuma"
                description="Vem sugerida ao lançar uma despesa deste fornecedor."
                opcoes={opcoesCategoria}
              />
            )}
          </form.AppField>

          <fieldset className="mt-2 flex flex-col gap-4">
            <legend className="mb-2 font-semibold">Endereço</legend>
            <div className="flex flex-wrap gap-4">
              <form.AppField name="cep">
                {(field) => (
                  <field.TextField
                    label="CEP"
                    mascara="cep"
                    placeholder="00000-000"
                    autoComplete="off"
                    className="flex-[1_1_120px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="logradouro">
                {(field) => (
                  <field.TextField
                    label="Logradouro"
                    placeholder="Ex.: Av. Paulista"
                    autoComplete="off"
                    className="flex-[3_1_200px]"
                  />
                )}
              </form.AppField>
            </div>
            <div className="flex flex-wrap gap-4">
              <form.AppField name="numero">
                {(field) => (
                  <field.TextField
                    label="Número"
                    placeholder="1000"
                    autoComplete="off"
                    className="flex-[1_1_80px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="complemento">
                {(field) => (
                  <field.TextField
                    label="Complemento"
                    placeholder="Sala 12"
                    autoComplete="off"
                    className="flex-[2_1_140px]"
                  />
                )}
              </form.AppField>
            </div>
            <div className="flex flex-wrap gap-4">
              <form.AppField name="bairro">
                {(field) => (
                  <field.TextField
                    label="Bairro"
                    placeholder="Bela Vista"
                    autoComplete="off"
                    className="flex-[2_1_140px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="cidade">
                {(field) => (
                  <field.TextField
                    label="Cidade"
                    placeholder="São Paulo"
                    autoComplete="off"
                    className="flex-[2_1_140px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="uf">
                {(field) => (
                  <field.SelectField
                    label="UF"
                    placeholder="UF"
                    opcoes={[
                      { valor: '', rotulo: '—' },
                      ...UFS.map((uf) => ({ valor: uf, rotulo: uf })),
                    ]}
                    className="flex-[1_1_88px]"
                  />
                )}
              </form.AppField>
            </div>
            <p className="text-muted-foreground text-[13px]">
              Opcional. Começado, pede CEP, logradouro, cidade e UF.
            </p>
          </fieldset>

          <fieldset className="mt-2 flex flex-col gap-4">
            <legend className="mb-2 font-semibold">Pagamento</legend>
            <div className="flex flex-wrap gap-4">
              <form.AppField
                name="tipoChavePix"
                listeners={{
                  // A chave muda de formato com o tipo: trocar o tipo limpa a chave.
                  onChange: () => form.setFieldValue('chavePix', ''),
                }}
              >
                {(field) => (
                  <field.SelectField
                    label="Tipo de chave Pix"
                    placeholder="Sem Pix"
                    opcoes={[{ valor: '', rotulo: 'Sem Pix' }, ...TIPOS_PIX]}
                    className="flex-[1_1_150px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="chavePix">
                {(field) => (
                  <field.TextField
                    key={tipoChavePix}
                    label="Chave Pix"
                    mascara={MASCARA_PIX[tipoChavePix]}
                    type={tipoChavePix === 'EMAIL' ? 'email' : 'text'}
                    placeholder={
                      tipoChavePix ? 'A chave do tipo escolhido' : 'Escolha o tipo antes'
                    }
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-[2_1_180px]"
                  />
                )}
              </form.AppField>
            </div>
            <div className="flex flex-wrap gap-4">
              <form.AppField name="bancoCodigo">
                {(field) => (
                  <field.TextField
                    label="Banco"
                    placeholder="341"
                    inputMode="numeric"
                    autoComplete="off"
                    className="flex-[1_1_72px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="agencia">
                {(field) => (
                  <field.TextField
                    label="Agência"
                    placeholder="0123"
                    inputMode="numeric"
                    autoComplete="off"
                    className="flex-[1_1_88px]"
                  />
                )}
              </form.AppField>
              {/* Conta e dígito sempre juntos na mesma linha. */}
              <div className="flex flex-[2_1_176px] gap-2">
                <form.AppField name="conta">
                  {(field) => (
                    <field.TextField
                      label="Conta"
                      placeholder="45678"
                      inputMode="numeric"
                      autoComplete="off"
                      className="min-w-0 flex-1"
                    />
                  )}
                </form.AppField>
                <form.AppField name="digito">
                  {(field) => (
                    <field.TextField
                      label="Dígito"
                      placeholder="9"
                      autoComplete="off"
                      className="w-16 flex-none"
                    />
                  )}
                </form.AppField>
              </div>
            </div>
          </fieldset>

          <form.AppField name="observacoes">
            {(field) => (
              <field.TextAreaField
                label="Observações"
                placeholder="Ex.: honorários vencem no dia 5"
              />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => (
              <field.InterruptorField
                label="Ativo"
                description="Inativo some da escolha de favorecido, mas continua nos títulos já lançados."
              />
            )}
          </form.AppField>
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar fornecedor"
              editando={Boolean(fornecedor)}
              excluir={excluir}
              onCancelar={onFechar}
            />
          </form.AppForm>
        </form>
      </AbasComHistorico>
    </PainelLateral>
  );
}
