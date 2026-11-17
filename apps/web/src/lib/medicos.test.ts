import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { abasDoMedico, invalidarMedicos } from './medicos';

describe('invalidarMedicos', () => {
  it('refaz as consultas de médicos, equipes, níveis e usuários, e só elas', async () => {
    const queryClient = new QueryClient();
    const urls = [
      '/medicos',
      '/medicos/{id}',
      '/equipes',
      '/niveis-medico',
      '/usuarios',
      '/catalogo/clientes',
    ];
    for (const url of urls) queryClient.setQueryData([{ url }], 1);

    await invalidarMedicos(queryClient);

    const invalidadas = urls.filter((url) => queryClient.getQueryState([{ url }])?.isInvalidated);
    expect(invalidadas).toEqual([
      '/medicos',
      '/medicos/{id}',
      '/equipes',
      '/niveis-medico',
      '/usuarios',
    ]);
  });
});

describe('abasDoMedico', () => {
  const papel = (...permissoes: string[]) => ({ acessoTotal: false, permissoes });

  it('cada aba do painel do médico depende da sua chave, sem passar pela tela Usuários', () => {
    expect(
      abasDoMedico(papel('medicos.ver', 'medicos.acesso.ver', 'medicos.distribuicao.ver')),
    ).toEqual({
      pagamento: { ver: false, editar: false },
      acesso: { ver: true, editar: false },
      escala: false,
      distribuicao: { ver: true, editar: false },
    });
    expect(
      abasDoMedico(
        papel(
          'medicos.ver',
          'medicos.acesso.ver',
          'medicos.acesso.editar',
          'medicos.distribuicao.ver',
          'medicos.distribuicao.editar',
          'medicos.pagamento.ver',
          'medicos.pagamento.editar',
          'escala.ver',
        ),
      ),
    ).toEqual({
      pagamento: { ver: true, editar: true },
      acesso: { ver: true, editar: true },
      escala: true,
      distribuicao: { ver: true, editar: true },
    });
  });

  it('as chaves da tela Usuários não abrem mais a aba Acesso, e medicos.ver sozinho não abre a Distribuição', () => {
    expect(abasDoMedico(papel('medicos.ver', 'usuarios.ver', 'usuarios.criar'))).toMatchObject({
      acesso: { ver: false, editar: false },
      distribuicao: { ver: false, editar: false },
    });
  });

  it('o Administrador vê e edita todas as abas', () => {
    const tudo = abasDoMedico({ acessoTotal: true, permissoes: [] });
    expect(tudo.acesso.editar && tudo.distribuicao.editar && tudo.pagamento.editar).toBe(true);
  });
});
