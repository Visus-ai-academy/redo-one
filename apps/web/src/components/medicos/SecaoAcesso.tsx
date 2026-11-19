import { useState } from 'react';
import { z } from 'zod';

import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioResumoDto } from '../../gen/types/UsuarioResumoDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { useAppForm } from '../form/form';
import { EtiquetaSituacao } from '../usuarios/EtiquetaSituacao';

/** Nome fixo do papel do sistema para médicos (a API também o acha pelo nome). */
const PAPEL_MEDICO = 'Médico';

export type SecaoAcessoProps = {
  medico: { nome: string; email: string | null };
  /** Conta ligada ao médico, se houver. */
  conta: UsuarioResumoDto | null;
  /** Papéis para o convite (só os atribuíveis aparecem). */
  papeis: PapelAtribuivelDto[];
  /** `medicos.acesso.editar`. */
  podeConvidar: boolean;
  /** `medicos.acesso.editar`: ligar e desligar uma conta. */
  podeLigar: boolean;
  buscarUsuarios: (termo: string) => Promise<OpcaoBusca[]>;
  onConvidar: (dados: { nome: string; email: string; papelId: string }) => Promise<void>;
  onLigar: (usuarioId: string) => Promise<void>;
  onDesligar: () => Promise<void>;
};

/**
 * Acesso do médico ao portal: a conta ligada a ele (um usuário por médico) ou, sem conta, o
 * convite por e-mail ou a ligação a uma conta que já existe. Nunca senha padrão.
 */
export function SecaoAcesso({
  medico,
  conta,
  papeis,
  podeConvidar,
  podeLigar,
  buscarUsuarios,
  onConvidar,
  onLigar,
  onDesligar,
}: SecaoAcessoProps) {
  const [erro, setErro] = useState<string>();
  const tentar = async (acao: () => Promise<void>, padrao: string) => {
    setErro(undefined);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, padrao));
    }
  };

  if (conta) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <div className="flex flex-col gap-1">
          <span className="font-medium">{conta.nome}</span>
          <span className="text-muted-foreground">{conta.email}</span>
          <span className="flex flex-wrap items-center gap-2 pt-1">
            <EtiquetaSituacao situacao={conta.situacao} />
            <span className="text-muted-foreground text-[13px]">
              {conta.papeis.length > 1 ? 'Papéis' : 'Papel'}{' '}
              {conta.papeis.map((papel) => papel.nome).join(', ')}
            </span>
          </span>
        </div>
        <p className="text-muted-foreground text-[13px]">
          Pelo portal, esta conta vê só os dados de {medico.nome}. Senha, bloqueio e sessões ficam
          em Configurações › Usuários.
        </p>
        {podeLigar && (
          <span className="self-start">
            <ConfirmarAcao
              acao="Desligar conta"
              titulo={`Desligar a conta de ${conta.nome}?`}
              consequencia={`A conta continua existindo, mas deixa de ver os dados de ${medico.nome} no portal, e as sessões abertas dela são encerradas.`}
              onConfirmar={() =>
                tentar(onDesligar, 'Não foi possível desligar agora. Tente de novo.')
              }
            />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-muted-foreground">Este médico ainda não tem acesso ao portal.</p>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {podeConvidar && (
        <Convite
          medico={medico}
          papeis={papeis.filter((p) => p.atribuivel)}
          onConvidar={(dados) =>
            tentar(() => onConvidar(dados), 'Não foi possível convidar agora. Tente de novo.')
          }
        />
      )}
      {podeLigar && (
        <Ligar
          buscarUsuarios={buscarUsuarios}
          onLigar={(id) =>
            tentar(() => onLigar(id), 'Não foi possível ligar agora. Tente de novo.')
          }
        />
      )}
    </div>
  );
}

function Convite({
  medico,
  papeis,
  onConvidar,
}: {
  medico: SecaoAcessoProps['medico'];
  papeis: PapelAtribuivelDto[];
  onConvidar: SecaoAcessoProps['onConvidar'];
}) {
  const form = useAppForm({
    defaultValues: {
      nome: medico.nome,
      email: medico.email ?? '',
      papelId: papeis.find((p) => p.nome === PAPEL_MEDICO)?.id ?? '',
    },
    validators: {
      onSubmit: z.object({
        nome: z.string().trim().min(1, 'Informe o nome.'),
        email: z.email('Informe um e-mail válido, como nome@clinica.com.br.'),
        papelId: z.string().min(1, 'Escolha o papel.'),
      }),
    },
    onSubmit: ({ value }) =>
      onConvidar({
        nome: value.nome.trim(),
        email: value.email.trim().toLowerCase(),
        papelId: value.papelId,
      }),
  });

  return (
    <form
      method="post"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <h3 className="text-base font-semibold">Convidar</h3>
      <p className="text-muted-foreground -mt-2 text-[13px]">
        O médico recebe por e-mail um link (vale 7 dias) para criar a senha.
      </p>
      <form.AppField name="nome">
        {(field) => (
          <field.TextField label="Nome" placeholder="Nome do médico" autoComplete="off" required />
        )}
      </form.AppField>
      <form.AppField name="email">
        {(field) => (
          <field.TextField
            label="E-mail"
            type="email"
            placeholder="nome@clinica.com.br"
            autoComplete="off"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="papelId">
        {(field) => (
          <field.SelectField
            label="Papel"
            placeholder="Escolha o papel"
            required
            opcoes={papeis.map((p) => ({ valor: p.id, rotulo: p.nome }))}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Enviando…" className="self-start">
          Enviar convite
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

function Ligar({
  buscarUsuarios,
  onLigar,
}: {
  buscarUsuarios: SecaoAcessoProps['buscarUsuarios'];
  onLigar: (usuarioId: string) => Promise<void>;
}) {
  const form = useAppForm({
    defaultValues: { conta: null as OpcaoBusca | null },
    validators: {
      onSubmit: z.object({
        conta: z.custom<OpcaoBusca | null>((v) => v !== null, 'Escolha a conta.'),
      }),
    },
    onSubmit: ({ value }) => (value.conta ? onLigar(value.conta.valor) : undefined),
  });

  return (
    <form
      method="post"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3 border-t pt-4"
    >
      <h3 className="text-base font-semibold">Ligar a uma conta que já existe</h3>
      <form.AppField name="conta">
        {(field) => (
          <field.BuscaField
            label="Conta que já existe"
            placeholder="Nome ou e-mail"
            chave="usuarios"
            buscar={buscarUsuarios}
            description="Só aparecem contas ainda sem médico. A pessoa passa a ver os dados deste médico no portal; as sessões dela são encerradas."
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Ligando…" variant="secondary" className="self-start">
          Ligar conta
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}
