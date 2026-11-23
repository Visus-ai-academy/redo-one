import { useState } from 'react';
import type { AcessoRecenteDto } from '../../gen/types/AcessoRecenteDto';
import type { MinhaContaDto } from '../../gen/types/MinhaContaDto';

import { Avatar } from '../avatar/Avatar';
import { useGuardaDeSaida } from '../painel/use-guarda-de-saida';
import { AcessosRecentes } from './AcessosRecentes';
import { DadosDaConta } from './DadosDaConta';
import { SessoesAbertas } from './SessoesAbertas';
import { TrocarSenha } from './TrocarSenha';

export function MeuPerfil({
  conta,
  acessos,
}: {
  conta: MinhaContaDto;
  acessos: AcessoRecenteDto[];
}) {
  // Nome ou senha mudados e não salvos: sair da página pergunta antes de descartar.
  const [dadosAlterados, setDadosAlterados] = useState(false);
  const [senhaAlterada, setSenhaAlterada] = useState(false);
  const { confirmacao } = useGuardaDeSaida(dadosAlterados || senhaAlterada);
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar nome={conta.nome} tamanho="lg" className="bg-accent text-accent-foreground" />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] leading-snug font-semibold">Meu perfil</h1>
          <span className="text-muted-foreground">
            {conta.nome}, {conta.papeis.map((papel) => papel.nome).join(', ')}
          </span>
        </div>
      </div>
      <DadosDaConta conta={conta} onAlterado={setDadosAlterados} />
      <TrocarSenha senhaAlteradaEm={conta.senhaAlteradaEm} onAlterado={setSenhaAlterada} />
      <SessoesAbertas sessoes={conta.sessoesAbertas} />
      <AcessosRecentes acessos={acessos} />
      {confirmacao}
    </div>
  );
}
