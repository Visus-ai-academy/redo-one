import { Button } from '@base-ui/react/button';
import { Fieldset } from '@base-ui/react/fieldset';
import { Plus, Trash } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { dadosFiscaisControllerSalvar } from '../../gen/clients/dadosFiscaisControllerSalvar';
import { dadosFiscaisControllerObterQueryOptions } from '../../gen/hooks/useDadosFiscaisControllerObter';
import type { DadosFiscaisClienteDto } from '../../gen/types/DadosFiscaisClienteDto';
import { dataHoraCurta } from '../../lib/datas';
import { formatarCep } from '../../lib/documentos';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { AbaComErro } from '../distribuicao/estados';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { mostrarErrosDoServidor } from '../form/erros-do-servidor';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';
import {
  cepNoFormato,
  corpoDosDados,
  enderecoComecado,
  esquemaDadosFaturamento,
  telefoneParaLer,
  telefoneUnico,
  UFS,
  valoresIniciais,
} from './dados-faturamento';

export type DadosFaturamentoClienteProps = {
  clienteId: string;
  /** `clientes.faturamento.editar`; sem ela, só leitura. */
  podeEditar: boolean;
  /** Nome do cliente principal, quando o cliente é unidade (a NF usa os dados do principal). */
  unidadeDe?: string;
  /** Avisa quando há algo digitado e não salvo (o painel pergunta antes de fechar). */
  onAlterado?: (alterado: boolean) => void;
  agora?: Date;
};

const OPCOES_UF = UFS.map((uf) => ({ valor: uf, rotulo: uf }));
const ou = (valor: string | null) => valor || '—';
const FALHA_AO_SALVAR = 'Não foi possível salvar agora. Confira sua conexão e tente de novo.';

/** Um grupo da aba (Nota fiscal, Endereço…): `fieldset` com o título como `legend`. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Fieldset.Root className="flex flex-col gap-4 border-t pt-4 first:border-t-0 first:pt-0">
      <Fieldset.Legend className="text-base font-semibold">{titulo}</Fieldset.Legend>
      {children}
    </Fieldset.Root>
  );
}

/** Dois ou três campos na mesma linha, que quebram no celular. */
const Linha = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-4 *:min-w-0">{children}</div>
);

/**
 * Dados de faturamento do cliente na aba Faturamento: para onde vai a NF (e a exclusão fiscal),
 * endereço e contato do cadastro no Omie, banco e o código no Omie (só leitura, vem da
 * sincronização). Nada é obrigatório, mas o endereço começado pede CEP, logradouro, cidade e UF.
 */
export function DadosFaturamentoCliente({
  clienteId,
  podeEditar,
  unidadeDe,
  onAlterado,
  agora = new Date(),
}: DadosFaturamentoClienteProps) {
  const opcoes = dadosFiscaisControllerObterQueryOptions({ path: { clienteId } });
  const consulta = useQuery(opcoes);

  if (consulta.isError) {
    return (
      <AbaComErro onTentarDeNovo={() => void consulta.refetch()}>
        Não foi possível carregar os dados de faturamento do cliente agora.
      </AbaComErro>
    );
  }
  if (!consulta.data) return <CamposCarregando quantidade={6} />;
  const dados = consulta.data;

  return (
    <div className="flex flex-col gap-4">
      {unidadeDe && (
        <Alerta tom="info" role="note">
          Este cliente é unidade de {unidadeDe}: a nota fiscal sai com os dados de faturamento do
          cliente principal. Os dados abaixo ficam guardados, mas não são usados na NF.
        </Alerta>
      )}
      {podeEditar ? (
        <FormDados
          clienteId={clienteId}
          dados={dados}
          queryKey={opcoes.queryKey}
          onAlterado={onAlterado}
          agora={agora}
        />
      ) : (
        <Leitura dados={dados} agora={agora} />
      )}
    </div>
  );
}

function Omie({ dados, agora }: { dados: DadosFiscaisClienteDto; agora: Date }) {
  return (
    <Grupo titulo="Omie">
      <Linha>
        <CampoSomenteLeitura
          label="Código do cliente no Omie"
          value={dados.omieCodigoCliente ?? 'Ainda não sincronizado'}
          description="Preenchido pela sincronização com o Omie."
          className="flex-[1_1_200px]"
        />
        <CampoSomenteLeitura
          label="Sincronizado em"
          value={dados.omieSincronizadoEm ? dataHoraCurta(dados.omieSincronizadoEm, agora) : '—'}
          className="flex-[1_1_160px]"
        />
      </Linha>
    </Grupo>
  );
}

function Rodape({ dados, agora }: { dados: DadosFiscaisClienteDto; agora: Date }) {
  if (!dados.atualizadoEm) return null;
  return (
    <p className="text-muted-foreground text-[13px] tabular-nums">
      Última alteração: {dataHoraCurta(dados.atualizadoEm, agora)}
      {dados.atualizadoPor ? `, por ${dados.atualizadoPor}` : ', na carga do dashboards-one'}.
    </p>
  );
}

function Leitura({ dados, agora }: { dados: DadosFiscaisClienteDto; agora: Date }) {
  const campo = (label: string, value: string, className = 'flex-[1_1_200px]') => (
    <CampoSomenteLeitura label={label} value={value} className={className} />
  );
  return (
    <div className="flex flex-col gap-4">
      <Grupo titulo="Nota fiscal">
        {dados.emailsNf.length === 0 ? (
          campo('E-mails da NF', 'Nenhum e-mail cadastrado', '')
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-medium">E-mails da NF</span>
            <ul className="flex flex-col gap-1">
              {dados.emailsNf.map((e) => (
                <li key={e} className="truncate">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
        {campo(
          'Exclusão fiscal',
          dados.exclusaoFiscal ? 'Sim: os laudos saem do faturamento' : 'Não',
          '',
        )}
      </Grupo>
      <Grupo titulo="Endereço">
        <Linha>
          {campo('CEP', formatarCep(dados.cep), 'flex-[1_1_120px]')}
          {campo('Logradouro', ou(dados.logradouro), 'flex-[3_1_220px]')}
        </Linha>
        <Linha>
          {campo('Número', ou(dados.numero), 'flex-[1_1_100px]')}
          {campo('Complemento', ou(dados.complemento))}
          {campo('Bairro', ou(dados.bairro))}
        </Linha>
        <Linha>
          {campo('Cidade', ou(dados.cidade), 'flex-[3_1_200px]')}
          {campo('UF', ou(dados.uf), 'flex-[1_1_80px]')}
        </Linha>
      </Grupo>
      <Grupo titulo="Contato">
        <Linha>
          {campo('Nome do contato', ou(dados.contatoNome))}
          {campo('E-mail', ou(dados.email))}
          {campo('Telefone', telefoneParaLer(dados.telefone))}
        </Linha>
      </Grupo>
      <Grupo titulo="Banco">
        <Linha>
          {campo('Código do banco', ou(dados.bancoCodigo), 'flex-[1_1_120px]')}
          {campo('Agência', ou(dados.bancoAgencia), 'flex-[1_1_120px]')}
          {campo('Conta', ou(dados.bancoConta), 'flex-[1_1_160px]')}
        </Linha>
      </Grupo>
      <Omie dados={dados} agora={agora} />
      <Rodape dados={dados} agora={agora} />
    </div>
  );
}

function FormDados({
  clienteId,
  dados,
  queryKey,
  onAlterado,
  agora,
}: {
  clienteId: string;
  dados: DadosFiscaisClienteDto;
  queryKey: readonly unknown[];
  onAlterado?: (alterado: boolean) => void;
  agora: Date;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const iniciais = valoresIniciais(dados);
  const [erro, setErro] = useState<string>();
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaDadosFaturamento },
    onSubmit: async ({ value, formApi }) => {
      setErro(undefined);
      try {
        await dadosFiscaisControllerSalvar({
          path: { clienteId },
          body: corpoDosDados(value, dados),
        }).unwrap();
        await queryClient.invalidateQueries({ queryKey });
        // Recomeça do que foi gravado (CEP e telefone voltam só com os dígitos).
        const gravado = queryClient.getQueryData<DadosFiscaisClienteDto>(queryKey);
        if (gravado) formApi.reset(valoresIniciais(gravado));
        avisos.sucesso('Dados de faturamento salvos.');
      } catch (falha) {
        // Erro de um campo (e-mail, CEP, UF) vai para o campo; o resto, acima do botão.
        if (!mostrarErrosDoServidor(formApi, falha)) setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  // Os dados chegaram de novo (outra pessoa salvou, a janela voltou ao foco): sem nada digitado,
  // o formulário passa a mostrá-los; com algo digitado, o rascunho fica (o TanStack Form já faz
  // isso enquanto nenhum campo foi tocado; aqui, para o campo tocado que voltou ao valor salvo).
  const chaveIniciais = JSON.stringify(iniciais);
  const iniciaisAntes = useRef(chaveIniciais);
  useEffect(() => {
    if (iniciaisAntes.current === chaveIniciais) return;
    const limpo = JSON.stringify(form.state.values) === iniciaisAntes.current;
    iniciaisAntes.current = chaveIniciais;
    if (limpo) form.reset(JSON.parse(chaveIniciais));
  }, [chaveIniciais, form]);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);
  // Saiu da tela (fechou, trocou de aba): não há mais nada digitado aqui.
  useEffect(() => () => onAlterado?.(false), [onAlterado]);
  const valores = useStore(form.store, (s) => s.values);
  const exigeEndereco = enderecoComecado(valores);
  // UF que veio da carga fora das 27 continua à vista, para a pessoa trocar.
  const opcoesUf =
    valores.uf && !UFS.includes(valores.uf)
      ? [...OPCOES_UF, { valor: valores.uf, rotulo: valores.uf }]
      : OPCOES_UF;

  return (
    <form
      noValidate
      aria-label="Dados de faturamento"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <Grupo titulo="Nota fiscal">
        <form.AppField name="emailsNf" mode="array">
          {(lista) => (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-[13px]">
                Recebem a NF e os demonstrativos depois do fechamento, nesta ordem.
              </p>
              <ul className="flex flex-col gap-3">
                {lista.state.value.map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: os e-mails não têm id.
                  <li key={i} className="flex items-start gap-2">
                    <form.AppField name={`emailsNf[${i}]`}>
                      {(field) => (
                        <field.TextField
                          label={`E-mail da NF ${i + 1}`}
                          placeholder="nf@empresa.com.br"
                          type="email"
                          className="min-w-0 flex-1"
                        />
                      )}
                    </form.AppField>
                    <Button
                      type="button"
                      aria-label={`Remover e-mail da NF ${i + 1}`}
                      onClick={() =>
                        lista.state.value.length === 1
                          ? form.setFieldValue('emailsNf[0]', '')
                          : lista.removeValue(i)
                      }
                      className={buttonClassName({
                        variant: 'ghost',
                        // Na altura do campo (abaixo do rótulo), mesmo com o erro aparecendo embaixo.
                        className: 'text-muted-foreground mt-7 size-9 flex-none px-0',
                      })}
                    >
                      <Trash size={16} aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                onClick={() => lista.pushValue('')}
                className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
              >
                <Plus size={16} aria-hidden />
                Adicionar e-mail
              </Button>
            </div>
          )}
        </form.AppField>
        <form.AppField name="exclusaoFiscal">
          {(field) => (
            <field.CheckboxField
              label="Exclusão fiscal"
              description="Os laudos deste cliente saem do faturamento."
            />
          )}
        </form.AppField>
      </Grupo>

      <Grupo titulo="Endereço">
        <p className="text-muted-foreground -mt-2 text-[13px]">
          Opcional. Começou a preencher, CEP, logradouro, cidade e UF passam a ser obrigatórios.
        </p>
        <Linha>
          <form.AppField name="cep">
            {(field) => (
              <field.TextField
                label="CEP"
                placeholder="00000-000"
                // O da carga fora do formato aparece como está, para o erro fazer sentido.
                mascara={cepNoFormato(dados.cep) ? 'cep' : undefined}
                description={
                  cepNoFormato(dados.cep) ? undefined : 'Veio do dashboards-one fora do formato.'
                }
                required={exigeEndereco}
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
          <form.AppField name="logradouro">
            {(field) => (
              <field.TextField
                label="Logradouro"
                placeholder="Ex.: Av. Paulista"
                required={exigeEndereco}
                className="flex-[3_1_220px]"
              />
            )}
          </form.AppField>
        </Linha>
        <Linha>
          <form.AppField name="numero">
            {(field) => (
              <field.TextField
                label="Número"
                placeholder="Ex.: 1000"
                className="flex-[1_1_100px]"
              />
            )}
          </form.AppField>
          <form.AppField name="complemento">
            {(field) => (
              <field.TextField
                label="Complemento"
                placeholder="Ex.: Sala 12"
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
          <form.AppField name="bairro">
            {(field) => (
              <field.TextField
                label="Bairro"
                placeholder="Ex.: Centro"
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </Linha>
        <Linha>
          <form.AppField name="cidade">
            {(field) => (
              <field.TextField
                label="Cidade"
                placeholder="Ex.: São Paulo"
                required={exigeEndereco}
                className="flex-[3_1_200px]"
              />
            )}
          </form.AppField>
          <form.AppField name="uf">
            {(field) => (
              <field.SelectField
                label="UF"
                placeholder="Escolha"
                opcoes={opcoesUf}
                required={exigeEndereco}
                className="flex-[1_1_100px]"
              />
            )}
          </form.AppField>
        </Linha>
      </Grupo>

      <Grupo titulo="Contato">
        <Linha>
          <form.AppField name="contatoNome">
            {(field) => (
              <field.TextField
                label="Nome do contato"
                placeholder="Ex.: Maria Souza"
                className="flex-[1_1_200px]"
              />
            )}
          </form.AppField>
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="E-mail"
                placeholder="financeiro@empresa.com.br"
                type="email"
                description="Do cadastro no Omie."
                className="flex-[1_1_200px]"
              />
            )}
          </form.AppField>
          <form.AppField name="telefone">
            {(field) => (
              <field.TextField
                label="Telefone"
                placeholder="(00) 00000-0000"
                // Com dois contatos (veio assim da carga), sem máscara: a pessoa vê tudo e
                // reescreve como deve ficar.
                type="tel"
                mascara={telefoneUnico(dados.telefone) ? 'telefone' : undefined}
                description={
                  telefoneUnico(dados.telefone)
                    ? undefined
                    : 'Veio do dashboards-one com mais de um contato. Reescreva como deve ficar: o que estiver aqui ao salvar é o que fica.'
                }
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </Linha>
      </Grupo>

      <Grupo titulo="Banco">
        <Linha>
          <form.AppField name="bancoCodigo">
            {(field) => (
              <field.TextField
                label="Código do banco"
                placeholder="Ex.: 341"
                description="Código FEBRABAN."
                spellCheck={false}
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
          <form.AppField name="bancoAgencia">
            {(field) => (
              <field.TextField
                label="Agência"
                placeholder="Ex.: 0001"
                spellCheck={false}
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
          <form.AppField name="bancoConta">
            {(field) => (
              <field.TextField
                label="Conta"
                placeholder="Ex.: 12345-6"
                spellCheck={false}
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </Linha>
      </Grupo>

      <Omie dados={dados} agora={agora} />

      <div className="flex flex-col items-end gap-2 border-t pt-4">
        {erro && (
          <Alerta tom="erro" className="self-stretch">
            {erro}
          </Alerta>
        )}
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Rodape dados={dados} agora={agora} />
          <form.AppForm>
            <div className="ml-auto flex items-center gap-3">
              {exigeEndereco && <form.RequiredLegend />}
              <form.SubmitButton pendingLabel="Salvando…">
                Salvar dados de faturamento
              </form.SubmitButton>
            </div>
          </form.AppForm>
        </div>
      </div>
    </form>
  );
}
