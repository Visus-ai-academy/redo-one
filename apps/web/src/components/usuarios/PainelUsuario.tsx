import { DeviceMobile, Monitor, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId, useState } from 'react';

import { usuariosControllerObterQueryKey } from '../../gen/hooks/useUsuariosControllerObter';
import { useUsuariosControllerTrocarPapel } from '../../gen/hooks/useUsuariosControllerTrocarPapel';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioDetalheDto } from '../../gen/types/UsuarioDetalheDto';
import { descreverAparelho, ipParcial } from '../../lib/aparelho';
import { cn } from '../../lib/cn';
import { cpfMascarado } from '../../lib/cpf';
import { dataDeBrasilia, dataHoraCurta } from '../../lib/datas';
import { Alerta } from '../alerta/Alerta';
import { iniciais } from '../app-shell/iniciais';
import { buttonClassName } from '../button/button-class';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { controlClassName } from '../form/control-class';
import { EtiquetaSituacao } from './EtiquetaSituacao';

export type PainelUsuarioProps = {
  usuario: UsuarioDetalheDto;
  papeis: PapelAtribuivelDto[];
  euId: string;
  /** Tem usuarios.editar (trocar papel). */
  podeEditar: boolean;
  agora?: Date;
  onFechar: () => void;
};

/** Detalhe de um usuário ao lado da lista (`?id=` na URL); no celular ocupa a tela. */
export function PainelUsuario({
  usuario,
  papeis,
  euId,
  podeEditar,
  agora,
  onFechar,
}: PainelUsuarioProps) {
  const [referencia] = useState(() => agora ?? new Date());
  const tituloId = useId();

  return (
    <aside
      aria-labelledby={tituloId}
      className="bg-card flex min-w-0 flex-[1_1_340px] flex-col self-start rounded-lg border lg:max-w-[400px]"
    >
      <div className="flex items-start gap-3 border-b p-4">
        <span
          aria-hidden="true"
          className="bg-inactive-soft text-muted-foreground flex size-10 flex-none items-center justify-center rounded-full text-sm font-semibold"
        >
          {iniciais(usuario.nome)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <h2 id={tituloId} className="truncate text-base font-semibold">
            {usuario.nome}
          </h2>
          <span className="text-muted-foreground truncate text-[13px]">{usuario.email}</span>
        </span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar painel"
          className={buttonClassName({ variant: 'ghost', className: 'size-9 flex-none px-0' })}
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4">
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

        {podeEditar ? (
          <TrocarPapel usuario={usuario} papeis={papeis} proprio={usuario.id === euId} />
        ) : (
          <CampoSomenteLeitura label="Papel" value={usuario.papel.nome} />
        )}

        <SessoesDoUsuario usuario={usuario} agora={referencia} />
      </div>
    </aside>
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

function TrocarPapel({
  usuario,
  papeis,
  proprio,
}: {
  usuario: UsuarioDetalheDto;
  papeis: PapelAtribuivelDto[];
  proprio: boolean;
}) {
  const queryClient = useQueryClient();
  const trocar = useUsuariosControllerTrocarPapel();
  const [papelId, setPapelId] = useState(usuario.papel.id);
  const [aviso, setAviso] = useState<string>();
  const campoId = useId();
  const ajudaId = useId();

  const enviar = async () => {
    setAviso(undefined);
    try {
      await trocar.mutateAsync({ path: { id: usuario.id }, body: { papelId } });
    } catch {
      return; // A mensagem vem de `trocar.error`.
    }
    // A lista e o detalhe mostram o papel; as chaves são diferentes (/usuarios e /usuarios/:id).
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [{ url: '/usuarios' }] }),
      queryClient.invalidateQueries({
        queryKey: usuariosControllerObterQueryKey({ path: { id: usuario.id } }),
      }),
    ]);
    setAviso(`Papel trocado. As sessões abertas de ${usuario.nome} foram encerradas.`);
  };

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        void enviar();
      }}
      className="flex flex-col gap-2"
    >
      {aviso && <Alerta tom="sucesso">{aviso}</Alerta>}
      {trocar.error && (
        <Alerta tom="erro">Não foi possível trocar o papel agora. Tente de novo.</Alerta>
      )}
      <div className="flex items-baseline gap-1">
        <label htmlFor={campoId} className="font-medium">
          Papel
        </label>
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      </div>
      <div className="flex gap-2">
        <select
          id={campoId}
          required
          disabled={proprio}
          value={papelId}
          onChange={(evento) => setPapelId(evento.target.value)}
          aria-describedby={ajudaId}
          className={controlClassName('app', 'flex-1 px-2')}
        >
          {papeis.map((papel) => (
            <option
              key={papel.id}
              value={papel.id}
              disabled={!papel.atribuivel && papel.id !== usuario.papel.id}
            >
              {papel.nome}
            </option>
          ))}
        </select>
        {!proprio && (
          <button
            type="submit"
            disabled={papelId === usuario.papel.id || trocar.isPending}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Trocar papel
          </button>
        )}
      </div>
      <span id={ajudaId} className="text-muted-foreground text-[13px]">
        {proprio
          ? 'Você não pode trocar o próprio papel.'
          : 'Ao trocar o papel, as sessões abertas desta pessoa são encerradas.'}
      </span>
    </form>
  );
}

function SessoesDoUsuario({ usuario, agora }: { usuario: UsuarioDetalheDto; agora: Date }) {
  const tituloId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={tituloId} className="font-medium">
        Sessões abertas{' '}
        <span className="text-subtle-foreground font-normal tabular-nums">
          {usuario.sessoesAbertas.length}
        </span>
      </span>
      {usuario.sessoesAbertas.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">Nenhuma sessão aberta.</p>
      ) : (
        <ul aria-label="Sessões abertas" className="rounded-md border">
          {usuario.sessoesAbertas.map((sessao, indice) => {
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
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{aparelho.nome}</span>
                  <span className="text-muted-foreground text-[13px] tabular-nums">
                    {ip ? `${quando}, IP ${ip}` : quando}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
