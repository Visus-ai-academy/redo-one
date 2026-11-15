import { z } from 'zod';

import type { PagamentoMedicoDto } from '../../gen/types/PagamentoMedicoDto';
import { formatarCnpj, formatarCpf, soDigitos } from '../../lib/documentos';
import type { Mascara } from '../../lib/mascaras';
import { Alerta } from '../alerta/Alerta';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';

type FormPagamentoProps = {
  dados: PagamentoMedicoDto;
  podeEditar: boolean;
  onSalvar: (dados: PagamentoMedicoDto) => Promise<void>;
};

const TIPOS_PIX = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  TELEFONE: 'Telefone',
  ALEATORIA: 'Chave aleatória',
} as const;

const SIM_NAO = [
  { valor: '', rotulo: 'Não informado' },
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
];

const tamanho = (n: number, mensagem: string) =>
  z.string().refine((v) => v.trim() === '' || soDigitos(v).length === n, mensagem);

const schema = z
  .object({
    socio: z.string(),
    optanteSimples: z.string(),
    cpf: tamanho(11, 'O CPF tem 11 dígitos.'),
    cnpj: tamanho(14, 'O CNPJ tem 14 dígitos.'),
    razaoSocial: z.string(),
    tipoChavePix: z.string(),
    chavePix: z.string(),
    omieCodigoFornecedor: z.string(),
  })
  .refine((v) => !v.chavePix.trim() || v.tipoChavePix, {
    message: 'Escolha o tipo da chave Pix.',
    path: ['tipoChavePix'],
  })
  .refine((v) => !v.tipoChavePix || v.chavePix.trim(), {
    message: 'Informe a chave Pix junto com o tipo dela.',
    path: ['chavePix'],
  });

const paraTexto = (valor: boolean | null | undefined) =>
  valor === true ? 'sim' : valor === false ? 'nao' : '';
const paraBooleano = (texto: string) => (texto === 'sim' ? true : texto === 'nao' ? false : null);
const opcional = (texto: string) => texto.trim() || null;

/** Dados de pagamento do médico (LGPD: pessoal), na aba Pagamento do painel. */
/** Chave Pix de CPF, CNPJ ou telefone ganha a máscara do tipo. */
const MASCARA_PIX: Record<string, Mascara | undefined> = {
  CPF: 'cpf',
  CNPJ: 'cnpj',
  TELEFONE: 'telefone',
};

export function FormPagamento({ dados, podeEditar, onSalvar }: FormPagamentoProps) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      socio: paraTexto(dados.socio),
      optanteSimples: paraTexto(dados.optanteSimples),
      cpf: dados.cpf ? formatarCpf(dados.cpf) : '',
      cnpj: dados.cnpj ? formatarCnpj(dados.cnpj) : '',
      razaoSocial: dados.razaoSocial ?? '',
      tipoChavePix: dados.tipoChavePix ?? '',
      chavePix: dados.chavePix ?? '',
      omieCodigoFornecedor: dados.omieCodigoFornecedor ?? '',
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          cpf: value.cpf.trim() ? soDigitos(value.cpf) : null,
          cnpj: value.cnpj.trim() ? soDigitos(value.cnpj) : null,
          razaoSocial: opcional(value.razaoSocial),
          tipoChavePix: (value.tipoChavePix || null) as PagamentoMedicoDto['tipoChavePix'],
          // CPF, CNPJ e telefone vão só com os dígitos; e-mail e chave aleatória, como digitados.
          chavePix: MASCARA_PIX[value.tipoChavePix]
            ? soDigitos(value.chavePix) || null
            : opcional(value.chavePix),
          socio: paraBooleano(value.socio),
          optanteSimples: paraBooleano(value.optanteSimples),
          omieCodigoFornecedor: opcional(value.omieCodigoFornecedor),
        }),
      ),
  });

  const aviso = (
    <p className="text-muted-foreground text-[13px]">
      Dados pessoais de pagamento. Cada vez que esta aba abre, fica registrado na auditoria.
    </p>
  );

  if (!podeEditar) {
    const simNao = (v: boolean | null | undefined) =>
      v === true ? 'Sim' : v === false ? 'Não' : '—';
    return (
      <div className="flex flex-col gap-4 p-4">
        {aviso}
        <CampoSomenteLeitura label="Sócio" value={simNao(dados.socio)} />
        <CampoSomenteLeitura label="CPF" value={dados.cpf ? formatarCpf(dados.cpf) : '—'} />
        <CampoSomenteLeitura label="CNPJ" value={dados.cnpj ? formatarCnpj(dados.cnpj) : '—'} />
        <CampoSomenteLeitura label="Razão social" value={dados.razaoSocial ?? '—'} />
        <CampoSomenteLeitura label="Optante do Simples" value={simNao(dados.optanteSimples)} />
        <CampoSomenteLeitura
          label="Chave Pix"
          value={
            dados.chavePix && dados.tipoChavePix
              ? `${TIPOS_PIX[dados.tipoChavePix]}: ${dados.chavePix}`
              : '—'
          }
        />
        <CampoSomenteLeitura
          label="Código do fornecedor no Omie"
          value={dados.omieCodigoFornecedor ?? '—'}
        />
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4 p-4"
    >
      {aviso}
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <form.AppField name="socio">
        {(field) => (
          <field.SelectField
            label="Sócio"
            placeholder="Não informado"
            description="Sócio e não sócio recebem em categorias diferentes do contas a pagar no Omie."
            opcoes={SIM_NAO}
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-4">
        <form.AppField name="cpf">
          {(field) => (
            <field.TextField
              label="CPF"
              mascara="cpf"
              placeholder="000.000.000-00"
              autoComplete="off"
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
        <form.AppField name="cnpj">
          {(field) => (
            <field.TextField
              label="CNPJ"
              mascara="cnpj"
              placeholder="00.000.000/0000-00"
              autoComplete="off"
              description="Quando recebe como pessoa jurídica."
              className="flex-[1_1_180px]"
            />
          )}
        </form.AppField>
      </div>
      <form.AppField name="razaoSocial">
        {(field) => (
          <field.TextField
            label="Razão social"
            placeholder="Empresa que recebe o repasse"
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.AppField name="optanteSimples">
        {(field) => (
          <field.SelectField
            label="Optante do Simples"
            placeholder="Não informado"
            opcoes={SIM_NAO}
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-4">
        <form.AppField name="tipoChavePix">
          {(field) => (
            <field.SelectField
              label="Tipo da chave Pix"
              placeholder="Sem chave"
              opcoes={[
                { valor: '', rotulo: 'Sem chave' },
                ...Object.entries(TIPOS_PIX).map(([valor, rotulo]) => ({ valor, rotulo })),
              ]}
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(estado) => estado.values.tipoChavePix}>
          {(tipo) => (
            <form.AppField name="chavePix">
              {(field) => (
                <field.TextField
                  // Remonta ao trocar o tipo: a máscara nova vale do zero.
                  key={tipo}
                  label="Chave Pix"
                  mascara={MASCARA_PIX[tipo]}
                  placeholder="Onde o médico recebe"
                  autoComplete="off"
                  className="flex-[1_1_200px]"
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
      </div>
      <form.AppField name="omieCodigoFornecedor">
        {(field) => (
          <field.TextField
            label="Código do fornecedor no Omie"
            placeholder="Ex.: 4214859321"
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…" className="self-end">
          Salvar pagamento
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}
