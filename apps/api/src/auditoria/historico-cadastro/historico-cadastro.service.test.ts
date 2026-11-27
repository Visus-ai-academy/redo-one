import { describe, expect, it } from 'vitest';

import type { Principal } from '../../identidade/principal';
import type {
  AlvoHistorico,
  HistoricoCadastroRepository,
  PaginaHistoricoCadastro,
} from './historico-cadastro.repository';
import { HistoricoCadastroService } from './historico-cadastro.service';

class FakeRepo implements HistoricoCadastroRepository {
  alvos: AlvoHistorico[] = [];
  async listar(alvo: AlvoHistorico): Promise<PaginaHistoricoCadastro> {
    this.alvos.push(alvo);
    return { itens: [], total: 0, nomes: {} };
  }
}

const quem = (permissoes: string[], acessoTotal = false) =>
  ({ tipo: 'usuario', acessoTotal, permissoes: new Set(permissoes) }) as unknown as Principal;
const pagina = { pagina: 1, porPagina: 10 };

describe('HistoricoCadastroService', () => {
  it('no médico, só com medicos.ver: sem pagamento, distribuição nem acesso', async () => {
    const repo = new FakeRepo();
    await new HistoricoCadastroService(repo).doMedico(quem(['medicos.ver']), 'm-1', pagina);

    expect(repo.alvos).toEqual([
      {
        cadastro: 'medico',
        id: 'm-1',
        incluir: { pagamento: false, distribuicao: false, acesso: false },
      },
    ]);
  });

  it('no médico, cada parte entra com a permissão dela', async () => {
    const repo = new FakeRepo();
    const service = new HistoricoCadastroService(repo);
    await service.doMedico(quem(['medicos.ver', 'medicos.pagamento.ver']), 'm-1', pagina);
    await service.doMedico(quem(['medicos.ver', 'medicos.distribuicao.ver']), 'm-1', pagina);
    await service.doMedico(quem(['medicos.ver', 'medicos.acesso.ver']), 'm-1', pagina);
    await service.doMedico(quem([], true), 'm-1', pagina);

    expect(repo.alvos.map((a) => (a.cadastro === 'medico' ? a.incluir : null))).toEqual([
      { pagamento: true, distribuicao: false, acesso: false },
      { pagamento: false, distribuicao: true, acesso: false },
      { pagamento: false, distribuicao: false, acesso: true },
      { pagamento: true, distribuicao: true, acesso: true },
    ]);
  });

  it('cliente, exame e fornecedor consultam o próprio cadastro', async () => {
    const repo = new FakeRepo();
    const service = new HistoricoCadastroService(repo);
    await service.doCliente('c-1', pagina);
    await service.doExame('x-1', pagina);
    await service.doFornecedor('f-1', pagina);
    await service.doTitulo('pagar', 't-1', pagina);

    expect(repo.alvos).toEqual([
      { cadastro: 'cliente', id: 'c-1' },
      { cadastro: 'exame', id: 'x-1' },
      { cadastro: 'fornecedor', id: 'f-1' },
      { cadastro: 'titulo', tipo: 'pagar', id: 't-1' },
    ]);
  });
});
