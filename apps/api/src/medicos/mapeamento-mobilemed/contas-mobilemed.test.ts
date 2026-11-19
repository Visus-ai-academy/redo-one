import { describe, expect, it } from 'vitest';

import { ClienteMobileMed } from '../../comum/mobilemed/cliente-mobilemed';
import { lerContasMobileMed } from './contas-mobilemed';

const BASE = 'http://mobilemed.teste/portal-api';

/** fetch simulado por rota: nenhum teste fala com a MobileMed. */
const criar = (rotas: Record<string, unknown>) => {
  const chamadas: { url: string; metodo: string; corpo: unknown }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, metodo: init.method ?? 'GET', corpo: init.body });
    const caminho = url.slice(BASE.length);
    if (!(caminho in rotas)) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(rotas[caminho]), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const cliente = new ClienteMobileMed({
    baseUrl: BASE,
    token: { accessToken: async () => 'tok', descartar: () => {} },
    timeoutMs: 1_000,
    concorrencia: 1,
    limiteAnomalias: 2,
    fetch,
  });
  return { cliente, chamadas };
};

describe('lerContasMobileMed', () => {
  it('lê os estados e a lista de médicos, só com leitura, uma chamada por vez com pausa', async () => {
    const pausas: number[] = [];
    const { cliente, chamadas } = criar({
      '/estados/1': { estados: [{ id: 26, uf: 'SP', nome: 'São Paulo' }] },
      '/usuario/medicos/lista/empresa': {
        lista: [
          {
            id: 7968,
            nome: 'Dr. James Yared',
            crm: 122929,
            crm_uf: 26,
            email_usuario: 'james@x.com',
            is_ativo: true,
            is_excluido: false,
            senha: 'hash-que-nao-pode-sair',
            token: 'segredo',
            cpf_usuario: '123',
          },
          { id: 1, nome: 'Inativo', crm: null, crm_uf: null, email_usuario: null, is_ativo: false },
          { id: 2, nome: 'Excluído', crm: null, crm_uf: null, is_ativo: true, is_excluido: true },
          { id: 7968, nome: 'Dr. James Yared', crm: 122929, crm_uf: 26, is_ativo: true },
          { id: 3, nome: 'Sem UF', crm: '555', crm_uf: 99, is_ativo: 1 },
        ],
      },
    });

    const contas = await lerContasMobileMed(cliente, async (ms) => {
      pausas.push(ms);
    });

    expect(contas).toEqual([
      { id: 7968, nome: 'Dr. James Yared', crm: '122929', uf: 'SP', email: 'james@x.com' },
      { id: 3, nome: 'Sem UF', crm: '555', uf: null, email: null },
    ]);
    expect(chamadas.map((c) => `${c.metodo} ${c.url.slice(BASE.length)}`)).toEqual([
      'GET /estados/1',
      'POST /usuario/medicos/lista/empresa',
    ]);
    expect(pausas).toEqual([1_000]);
  });
});
