import { Button } from '@base-ui/react/button';
import { DeviceMobile, Monitor } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useUsuariosControllerDesativar } from '../../gen/hooks/useUsuariosControllerDesativar';
import { useUsuariosControllerDesbloquear } from '../../gen/hooks/useUsuariosControllerDesbloquear';
import { useUsuariosControllerEncerrarSessao } from '../../gen/hooks/useUsuariosControllerEncerrarSessao';
import { useUsuariosControllerEncerrarSessoes } from '../../gen/hooks/useUsuariosControllerEncerrarSessoes';
import { useUsuariosControllerEnviarLinkSenha } from '../../gen/hooks/useUsuariosControllerEnviarLinkSenha';
import { usuariosControllerObterQueryKey } from '../../gen/hooks/useUsuariosControllerObter';
import { useUsuariosControllerReativar } from '../../gen/hooks/useUsuariosControllerReativar';
import { useUsuariosControllerReenviarConvite } from '../../gen/hooks/useUsuariosControllerReenviarConvite';
import { useUsuariosControllerTrocarPapeis } from '../../gen/hooks/useUsuariosControllerTrocarPapeis';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioDetalheDto } from '../../gen/types/UsuarioDetalheDto';
import { horaDeBrasilia } from '../../lib/acesso';
import { descreverAparelho, ipParcial } from '../../lib/aparelho';
import { cn } from '../../lib/cn';
import { cpfMascarado } from '../../lib/cpf';
import { dataDeBrasilia, dataHoraCurta } from '../../lib/datas';
import { pode } from '../../lib/permissoes';
import { sessaoQueryOptions } from '../../lib/sessao';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { Avatar } from '../avatar/Avatar';
import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { useAvisos } from '../toast/use-avisos';
import { EtiquetaSituacao } from './EtiquetaSituacao';
import { RecorteEscala } from './RecorteEscala';

export type PermissoesUsuarios = {
  /** usuarios.editar: trocar papéis, link de nova senha, encerrar sessões. */
  editar: boolean;
  desbloquear: boolean;
  /** usuarios.desativar: desativar e reativar. */
  desativar: boolean;
  /** usuarios.criar: reenviar convite. */
  convidar: boolean;
};

export type PainelUsuarioProps = {
  usuario: UsuarioDetalheDto;
  papeis: PapelAtribuivelDto[];
  euId: string;
  /** O que quem está logado pode fazer aqui (cada ação aparece só com a sua permissão). */
  permissoes: PermissoesUsuarios;
  agora?: Date;
  onFechar: () => void;
};

/** Detalhe de um usuário ao lado da lista (`?id=` na URL); no celular ocupa a tela. */
export function PainelUsuario({
  usuario,
  papeis,
  euId,
  permissoes,
  agora,
  onFechar,
}: PainelUsuarioProps) {
  const [referencia] = useState(() => agora ?? new Date());
  const acao = useAcaoNoUsuario(usuario.id);
  const desbloquear = useUsuariosControllerDesbloquear();
  const enviarLink = useUsuariosControllerEnviarLinkSenha();
  const reenviarConvite = useUsuariosControllerReenviarConvite();
  const desativar = useUsuariosControllerDesativar();
  const reativar = useUsuariosControllerReativar();
  const proprio = usuario.id === euId;
  const desativado = usuario.situacao === 'desativado';
  const caminho = { path: { id: usuario.id } };
  const pendente = usuario.situacao === 'convite_pendente';
  const podeConviteOuLink = pendente ? permissoes.convidar : permissoes.editar && !desativado;
  // Ninguém se desativa (a API também recusa).
  const podeDesativar = permissoes.desativar && !proprio;
  // Bloqueio vale pela data, não pela situação: quem tem convite pendente também pode ser bloqueado.
  const bloqueado = usuario.bloqueadoAte !== null && new Date(usuario.bloqueadoAte) > referencia;
  // Papéis ou recorte mudados e não salvos: fechar o painel pergunta antes de descartar.
  const [alterados, setAlterados] = useState<Record<string, boolean>>({});
  const marcarAlterado = useCallback(
    (parte: string, alterado: boolean) =>
      setAlterados((atual) => (atual[parte] === alterado ? atual : { ...atual, [parte]: alterado })),
    [],
  );

  return (
    <PainelLateral
      titulo={usuario.nome}
      subtitulo={usuario.email}
      inicio={<Avatar nome={usuario.nome} tamanho="md" />}
      alterado={Object.values(alterados).some(Boolean)}
      onFechar={onFechar}
    >
      <div className="flex flex-col gap-5 p-4">
        {acao.falha && <Alerta tom="erro">{acao.falha}</Alerta>}

        {bloqueado && usuario.bloqueadoAte && (
          <Alerta tom="bloqueio" role="note">
            <span className="flex flex-col items-start gap-2">
              Bloqueado até {horaDeBrasilia(usuario.bloqueadoAte)} por excesso de tentativas de
              senha.
              {permissoes.desbloquear && (
                <Button
                  type="button"
                  disabled={acao.ocupado}
                  onClick={() =>
                    acao.executar(
                      () => desbloquear.mutateAsync(caminho),
                      'Acesso liberado.',
                      'desbloquear o acesso',
                    )
                  }
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Desbloquear agora
                </Button>
              )}
            </span>
          </Alerta>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dado rotulo="Situação">
            <EtiquetaSituacao situacao={usuario.situacao} />
          </Dado>
          <Dado rotulo="Último acesso">
            {usuario.ultimoAcessoEm
              ? dataHoraCurta(usuario.ultimoAcessoEm, referencia)
              : 'Nunca entrou'}
          </Dado>
          <Dado rotulo="CPF">{cpfMascarado(usuario.cpfFinal)}</Dado>
          <Dado rotulo="Convidado em">{dataDeBrasilia(usuario.criadoEm)}</Dado>
        </dl>

        {permissoes.editar ? (
          <TrocarPapeis
            usuario={usuario}
            papeis={papeis}
            proprio={proprio}
            onAlterado={(alterado) => marcarAlterado('papeis', alterado)}
          />
        ) : (
          <CampoSomenteLeitura
            label="Papéis"
            value={usuario.papeis.map((papel) => papel.nome).join(', ')}
          />
        )}

        <SessoesDoUsuario
          usuario={usuario}
          agora={referencia}
          acao={permissoes.editar && !proprio ? acao : undefined}
          proprio={proprio}
        />

        <RecorteDaPessoa
          usuarioId={usuario.id}
          proprio={proprio}
          onAlterado={(alterado) => marcarAlterado('recorte', alterado)}
        />

        {(podeConviteOuLink || podeDesativar) && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {podeConviteOuLink &&
              (pendente ? (
                <Button
                  type="button"
                  disabled={acao.ocupado}
                  onClick={() =>
                    acao.executar(
                      () => reenviarConvite.mutateAsync(caminho),
                      `Convite reenviado para ${usuario.email}. Ele vale por 7 dias; o anterior deixa de valer.`,
                      'reenviar o convite',
                    )
                  }
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Reenviar convite
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={acao.ocupado}
                  onClick={() =>
                    acao.executar(
                      () => enviarLink.mutateAsync(caminho),
                      `Link enviado para ${usuario.email}. Ele vale por 1 hora.`,
                      'enviar o link de nova senha',
                    )
                  }
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Enviar link de nova senha
                </Button>
              ))}
            {podeDesativar &&
              (desativado ? (
                <Button
                  type="button"
                  disabled={acao.ocupado}
                  onClick={() =>
                    acao.executar(
                      () => reativar.mutateAsync(caminho),
                      'Usuário reativado. A pessoa já pode entrar de novo.',
                      'reativar o usuário',
                    )
                  }
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Reativar usuário
                </Button>
              ) : (
                <ConfirmarAcao
                  acao="Desativar usuário"
                  titulo={`Desativar ${usuario.nome}?`}
                  consequencia={consequenciaDeDesativar(usuario.sessoesAbertas.length)}
                  desabilitado={acao.ocupado}
                  onConfirmar={() =>
                    acao.executar(
                      () => desativar.mutateAsync(caminho),
                      'Usuário desativado.',
                      'desativar o usuário',
                    )
                  }
                />
              ))}
          </div>
        )}
      </div>
    </PainelLateral>
  );
}

/**
 * O recorte da escala da pessoa. As permissões da escala vêm da sessão (já em cache pelo layout),
 * não de `permissoes`: são de outro contexto e só esta seção as usa.
 */
function RecorteDaPessoa({
  usuarioId,
  proprio,
  onAlterado,
}: {
  usuarioId: string;
  proprio: boolean;
  onAlterado: (alterado: boolean) => void;
}) {
  const { data: sessao } = useQuery(sessaoQueryOptions());
  if (!sessao) return null;
  return (
    <div className="border-t pt-4">
      <RecorteEscala
        usuarioId={usuarioId}
        proprio={proprio}
        podeEditar={pode(sessao, 'usuarios.escopo-escala.editar')}
        podeVerCadastros={pode(sessao, 'escala.ver')}
        onAlterado={onAlterado}
      />
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-subtle-foreground text-xs">{rotulo}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

const schemaPapeis = z.object({
  papelIds: z.array(z.string()).min(1, 'Escolha pelo menos um papel.'),
});

const mesmosPapeis = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Papéis que quem está logado não pode atribuir ficam à vista, mas sem marcar nem desmarcar. */
function TrocarPapeis({
  usuario,
  papeis,
  proprio,
  onAlterado,
}: {
  usuario: UsuarioDetalheDto;
  papeis: PapelAtribuivelDto[];
  proprio: boolean;
  onAlterado: (alterado: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const trocar = useUsuariosControllerTrocarPapeis();
  const avisos = useAvisos();
  const atuais = usuario.papeis.map((papel) => papel.id);

  const form = useAppForm({
    defaultValues: { papelIds: atuais },
    validators: { onSubmit: schemaPapeis },
    onSubmit: async ({ value }) => {
      try {
        await trocar.mutateAsync({ path: { id: usuario.id }, body: { papelIds: value.papelIds } });
      } catch {
        return; // A mensagem vem de `trocar.error`.
      }
      // A lista e o detalhe mostram os papéis; as chaves são diferentes (/usuarios e /usuarios/:id).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [{ url: '/usuarios' }] }),
        queryClient.invalidateQueries({
          queryKey: usuariosControllerObterQueryKey({ path: { id: usuario.id } }),
        }),
      ]);
      avisos.sucesso(`Papéis trocados. As sessões abertas de ${usuario.nome} foram encerradas.`);
    },
  });
  // Comparado com os papéis de agora: salvou e o detalhe voltou da API, deixa de estar alterado.
  const alterado = useAlterado(form, { papelIds: atuais });
  useEffect(() => onAlterado(alterado), [alterado, onAlterado]);

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-2"
    >
      {trocar.error && (
        <Alerta tom="erro">
          {mensagemDaApi(
            trocar.error,
            'Não foi possível trocar os papéis. Confira sua conexão e tente de novo.',
          )}
        </Alerta>
      )}
      <form.AppField name="papelIds">
        {(field) => (
          <field.CheckboxListField
            label="Papéis"
            required
            description={
              proprio
                ? 'Você não pode trocar os próprios papéis.'
                : 'A pessoa pode tudo o que algum dos papéis permite. Ao trocar os papéis, as sessões abertas desta pessoa são encerradas.'
            }
            opcoes={papeis.map((papel) => ({
              valor: papel.id,
              rotulo: papel.nome,
              desabilitada: proprio || !papel.atribuivel,
            }))}
          />
        )}
      </form.AppField>
      {!proprio && (
        <form.Subscribe selector={(estado) => mesmosPapeis(estado.values.papelIds, atuais)}>
          {(iguais) => (
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={iguais || trocar.isPending}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Salvar papéis
              </Button>
            </div>
          )}
        </form.Subscribe>
      )}
    </form>
  );
}

function SessoesDoUsuario({
  usuario,
  agora,
  acao,
  proprio,
}: {
  usuario: UsuarioDetalheDto;
  agora: Date;
  /** Presente quando quem está logado pode encerrar as sessões (usuarios.editar). */
  acao?: AcaoNoUsuario;
  /** As próprias sessões se encerram em Meu perfil, que não derruba a sessão em uso. */
  proprio?: boolean;
}) {
  const encerrarSessao = useUsuariosControllerEncerrarSessao();
  // O painel é estreito: 5 por página.
  const paginacao = usePaginaLocal(usuario.sessoesAbertas, 5);
  const encerrarSessoes = useUsuariosControllerEncerrarSessoes();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          Sessões abertas{' '}
          <span className="text-subtle-foreground font-normal tabular-nums">
            {usuario.sessoesAbertas.length}
          </span>
        </span>
        {acao && usuario.sessoesAbertas.length > 0 && (
          <Button
            type="button"
            disabled={acao.ocupado}
            onClick={() =>
              acao.executar(
                () => encerrarSessoes.mutateAsync({ path: { id: usuario.id } }),
                `Todas as sessões de ${usuario.nome} foram encerradas.`,
                'encerrar as sessões',
              )
            }
            className={buttonClassName({ variant: 'secondary' })}
          >
            Encerrar todas
          </Button>
        )}
      </div>
      {usuario.sessoesAbertas.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">Nenhuma sessão aberta.</p>
      ) : (
        <div className="rounded-md border">
          <ul aria-label="Sessões abertas">
            {paginacao.itensDaPagina.map((sessao, indice) => {
              const aparelho = descreverAparelho(sessao.userAgent);
              const Icone = aparelho.movel ? DeviceMobile : Monitor;
              const ip = ipParcial(sessao.ip);
              const quando = dataHoraCurta(sessao.ultimoUsoEm, agora);
              return (
                <li
                  key={sessao.id}
                  className={cn('flex items-center gap-3 px-3 py-2', indice > 0 && 'border-t')}
                >
                  <Icone size={20} aria-hidden className="text-muted-foreground flex-none" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{aparelho.nome}</span>
                    <span className="text-muted-foreground text-[13px] tabular-nums">
                      {ip ? `${quando}, IP ${ip}` : quando}
                    </span>
                  </span>
                  {acao && (
                    <Button
                      type="button"
                      disabled={acao.ocupado}
                      aria-label={`Encerrar sessão ${aparelho.nome}`}
                      onClick={() =>
                        acao.executar(
                          () =>
                            encerrarSessao.mutateAsync({
                              path: { id: usuario.id, sessaoId: sessao.id },
                            }),
                          'Sessão encerrada.',
                          'encerrar a sessão',
                        )
                      }
                      className={buttonClassName({ variant: 'secondary' })}
                    >
                      Encerrar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {paginacao.precisaPaginar && (
            <Paginacao
              pagina={paginacao.pagina}
              porPagina={paginacao.porPagina}
              total={paginacao.total}
              onIrPara={paginacao.irPara}
            />
          )}
        </div>
      )}
      {proprio && (
        <p className="text-muted-foreground text-[13px]">
          Para encerrar as suas sessões, use{' '}
          <Link
            to="/configuracoes/meu-perfil"
            hash="seguranca"
            className="text-primary hover:text-primary-hover font-medium underline underline-offset-2"
          >
            Meu perfil
          </Link>
          .
        </p>
      )}
    </div>
  );
}

type AcaoNoUsuario = ReturnType<typeof useAcaoNoUsuario>;

/** Executa uma ação sobre a pessoa e recarrega a lista e o detalhe (chaves diferentes). */
function useAcaoNoUsuario(id: string) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const [falha, setFalha] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** `oQue`: a ação no infinitivo, para o erro ("enviar o link de nova senha"). */
  const executar = async (chamada: () => Promise<unknown>, sucesso: string, oQue: string) => {
    setFalha(null);
    setOcupado(true);
    try {
      await chamada();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [{ url: '/usuarios' }] }),
        queryClient.invalidateQueries({
          queryKey: usuariosControllerObterQueryKey({ path: { id } }),
        }),
      ]);
      avisos.sucesso(sucesso);
    } catch (erro) {
      setFalha(
        mensagemDaApi(erro, `Não foi possível ${oQue}. Confira sua conexão e tente de novo.`),
      );
    } finally {
      setOcupado(false);
    }
  };

  return {
    executar: (chamada: () => Promise<unknown>, sucesso: string, oQue: string) =>
      void executar(chamada, sucesso, oQue),
    falha,
    ocupado,
  };
}

function consequenciaDeDesativar(sessoes: number) {
  const queda =
    sessoes === 0
      ? ''
      : sessoes === 1
        ? ': a sessão aberta é encerrada'
        : `: as ${sessoes} sessões abertas são encerradas`;
  return `A pessoa perde o acesso na hora${queda} e não dá para entrar até alguém reativar.`;
}
