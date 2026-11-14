import type { MinhaContaDto } from '../../gen/types/MinhaContaDto';
import { iniciais } from '../app-shell/iniciais';
import { DadosDaConta } from './DadosDaConta';
import { TrocarSenha } from './TrocarSenha';

export function MeuPerfil({ conta }: { conta: MinhaContaDto }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="bg-accent text-accent-foreground flex size-14 flex-none items-center justify-center rounded-full text-lg font-semibold"
        >
          {iniciais(conta.nome)}
        </span>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] leading-snug font-semibold">Meu perfil</h1>
          <span className="text-muted-foreground">
            {conta.nome}, {conta.papel.nome}
          </span>
        </div>
      </div>
      <DadosDaConta conta={conta} />
      <TrocarSenha senhaAlteradaEm={conta.senhaAlteradaEm} />
    </div>
  );
}
