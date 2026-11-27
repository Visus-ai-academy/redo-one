import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACOES_PADRAO,
  CATALOGO_PERMISSOES,
  chavesDaTela,
  existePermissao,
  normalizarPermissoes,
  TODAS_AS_PERMISSOES,
} from './catalogo';

const tela = (nome: string) => {
  const encontrada = CATALOGO_PERMISSOES.find((t) => t.tela === nome);
  if (!encontrada) throw new Error(`tela ${nome} fora do catálogo`);
  return encontrada;
};
const padroes = (nome: string) => tela(nome).padrao.map((a) => a.acao);
const especiais = (nome: string) => tela(nome).especiais.map((e) => e.chave);
const sensiveis = (nome: string) => [
  ...tela(nome)
    .padrao.filter((a) => a.sensivel)
    .map((a) => `${nome}.${a.acao}`),
  ...tela(nome)
    .especiais.filter((e) => e.sensivel)
    .map((e) => e.chave),
];

describe('catálogo de permissões', () => {
  it('toda tela tem ver como primeira ação padrão, e as padrão seguem a ordem ver, criar, editar, excluir', () => {
    for (const t of CATALOGO_PERMISSOES) {
      const acoes = t.padrao.map((a) => a.acao);
      expect(acoes[0]).toBe('ver');
      expect(acoes).toEqual(ACOES_PADRAO.filter((a) => acoes.includes(a)));
    }
  });

  it('nenhum texto cita o Omie: o redo-one não fala com ele', () => {
    expect(JSON.stringify(CATALOGO_PERMISSOES)).not.toMatch(/omie/i);
  });

  it('as especiais são da própria tela, não repetem uma padrão e todas as chaves são únicas', () => {
    for (const t of CATALOGO_PERMISSOES) {
      for (const e of t.especiais) {
        expect(e.chave.startsWith(`${t.tela}.`)).toBe(true);
        expect(ACOES_PADRAO.map((a) => `${t.tela}.${a}`)).not.toContain(e.chave);
        expect(e.rotulo.length).toBeGreaterThan(0);
        expect(e.descricao.length).toBeGreaterThan(0);
      }
    }
    const telas = CATALOGO_PERMISSOES.map((t) => t.tela);
    expect(new Set(telas).size).toBe(telas.length);
    expect(new Set(TODAS_AS_PERMISSOES).size).toBe(TODAS_AS_PERMISSOES.length);
  });

  it('as telas e as ações padrão de cada uma seguem o contrato', () => {
    const resumo = Object.fromEntries(
      CATALOGO_PERMISSOES.map((t) => [t.tela, [t.area, padroes(t.tela)]]),
    );
    const crud = ['ver', 'criar', 'editar', 'excluir'];
    expect(resumo).toEqual({
      'painel-executivo': ['Painéis', ['ver']],
      volumetria: ['Painéis', ['ver']],
      sla: ['Painéis', ['ver']],
      qualidade: ['Painéis', ['ver']],
      distribuicao: ['Operação', ['ver']],
      importacao: ['Operação', ['ver', 'criar']],
      escala: ['Operação', crud],
      ausencias: ['Operação', crud],
      'escala-historico': ['Operação', ['ver']],
      clientes: ['Cadastros', crud],
      medicos: ['Cadastros', crud],
      exames: ['Cadastros', crud],
      avisos: ['Cadastros', ['ver']],
      faturamento: ['Financeiro', ['ver']],
      repasse: ['Financeiro', ['ver']],
      'pre-pago': ['Financeiro', ['ver']],
      contratos: ['Financeiro', crud],
      'categorias-financeiras': ['Financeiro', crud],
      usuarios: ['Configurações', ['ver', 'criar', 'editar']],
      papeis: ['Configurações', crud],
      catalogo: ['Configurações', crud],
      'de-para': ['Configurações', crud],
      'escala-config': ['Configurações', crud],
      'distribuicao-config': ['Configurações', ['ver', 'editar']],
      'avisos-config': ['Configurações', ['ver', 'editar']],
      'chaves-robo': ['Configurações', ['ver']],
    });
  });

  it('as especiais e as sensíveis seguem o contrato', () => {
    expect(especiais('volumetria')).toEqual(['volumetria.exportar']);
    expect(especiais('sla')).toEqual(['sla.exportar']);
    expect(especiais('distribuicao')).toEqual([
      'distribuicao.rodada.iniciar',
      'distribuicao.rodada.aprovar',
      'distribuicao.rodada.ajustar',
      'distribuicao.rodada.controlar',
      'distribuicao.paciente.ver',
    ]);
    expect(especiais('importacao')).toEqual([
      'importacao.arquivo.baixar',
      'importacao.parametros.editar',
      'importacao.paciente.ver',
    ]);
    expect(especiais('escala')).toEqual([]);
    expect(especiais('ausencias')).toEqual(['ausencias.aprovar', 'ausencias.observacoes.ver']);
    expect(especiais('medicos')).toEqual([
      'medicos.pagamento.ver',
      'medicos.pagamento.editar',
      'medicos.distribuicao.ver',
      'medicos.distribuicao.editar',
      'medicos.acesso.ver',
      'medicos.acesso.editar',
    ]);
    expect(especiais('clientes')).toEqual([
      'clientes.distribuicao.ver',
      'clientes.distribuicao.editar',
      'clientes.faturamento.ver',
      'clientes.faturamento.editar',
    ]);
    expect(especiais('exames')).toEqual(['exames.subespecialidade.editar']);
    expect(especiais('avisos')).toEqual(['avisos.triar']);
    expect(especiais('faturamento')).toEqual([
      'faturamento.demonstrativo.gerar',
      'faturamento.competencia.fechar',
      'faturamento.competencia.fechar_com_avisos',
      'faturamento.competencia.reabrir',
      'faturamento.competencia.recalcular',
      'faturamento.parametros.editar',
      'faturamento.ajuste_laudo.editar',
      'faturamento.competencia.travar',
      'faturamento.corte.editar',
      'faturamento.tipificacao.editar',
      'faturamento.precos.editar',
    ]);
    expect(especiais('repasse')).toEqual([
      'repasse.adicional.lancar',
      'repasse.adicional.lancar_fechada',
      'repasse.recalcular',
      'repasse.precos.editar',
      'repasse.regras.editar',
      'repasse.parametros.editar',
    ]);
    expect(especiais('pre-pago')).toEqual(['pre-pago.recarga.solicitar']);
    expect(especiais('contratos')).toEqual(['contratos.assinatura.enviar']);
    expect(especiais('categorias-financeiras')).toEqual([]);
    expect(especiais('usuarios')).toEqual([
      'usuarios.desbloquear',
      'usuarios.desativar',
      'usuarios.escopo-escala.editar',
    ]);
    expect(especiais('chaves-robo')).toEqual(['chaves-robo.gerenciar']);

    expect(sensiveis('qualidade')).toEqual(['qualidade.radshield.ver']);
    expect(sensiveis('distribuicao')).toEqual([
      'distribuicao.rodada.aprovar',
      'distribuicao.paciente.ver',
    ]);
    expect(sensiveis('importacao')).toEqual([
      'importacao.arquivo.baixar',
      'importacao.parametros.editar',
      'importacao.paciente.ver',
    ]);
    expect(sensiveis('distribuicao-config')).toEqual(['distribuicao-config.editar']);
    expect(sensiveis('avisos-config')).toEqual(['avisos-config.editar']);
    expect(sensiveis('ausencias')).toEqual(['ausencias.observacoes.ver']);
    expect(sensiveis('exames')).toEqual(['exames.editar', 'exames.excluir']);
    expect(sensiveis('faturamento')).toEqual([
      'faturamento.competencia.fechar',
      'faturamento.competencia.fechar_com_avisos',
      'faturamento.competencia.reabrir',
      'faturamento.competencia.recalcular',
      'faturamento.parametros.editar',
      'faturamento.ajuste_laudo.editar',
      'faturamento.competencia.travar',
      'faturamento.corte.editar',
      'faturamento.tipificacao.editar',
      'faturamento.precos.editar',
    ]);
    expect(sensiveis('medicos')).toEqual([
      'medicos.pagamento.ver',
      'medicos.pagamento.editar',
      'medicos.distribuicao.editar',
      'medicos.acesso.editar',
    ]);
    expect(sensiveis('papeis')).toEqual(['papeis.criar', 'papeis.editar', 'papeis.excluir']);
    expect(sensiveis('de-para')).toEqual(['de-para.criar', 'de-para.editar', 'de-para.excluir']);
    expect(sensiveis('clientes')).toEqual([
      'clientes.distribuicao.editar',
      'clientes.faturamento.editar',
    ]);
    expect(sensiveis('usuarios')).toEqual([
      'usuarios.desbloquear',
      'usuarios.desativar',
      'usuarios.escopo-escala.editar',
    ]);
  });

  it('usuários: criar se chama Convidar e editar diz o que faz', () => {
    expect(tela('usuarios').padrao).toEqual([
      { acao: 'ver' },
      { acao: 'criar', rotulo: 'Convidar' },
      { acao: 'editar', rotulo: 'Trocar papel e encerrar sessões' },
    ]);
  });

  it('reconhece só as chaves do catálogo (as antigas deixaram de existir)', () => {
    for (const chave of ['usuarios.criar', 'ausencias.observacoes.ver', 'escala-historico.ver']) {
      expect(existePermissao(chave)).toBe(true);
    }
    for (const chave of [
      'usuarios.convidar',
      'importacao.enviar',
      'escala.alocacao.editar',
      'escala.ausencia.editar',
      'escala.ausencia.aprovar',
      'escala.historico.ver',
      'volumetria.criar',
      'usuarios.excluir',
      'usuarios.apagar-tudo',
    ]) {
      expect(existePermissao(chave)).toBe(false);
    }
  });

  it('lista as chaves de uma tela: padrão e especiais', () => {
    expect(chavesDaTela('ausencias')).toEqual([
      'ausencias.ver',
      'ausencias.criar',
      'ausencias.editar',
      'ausencias.excluir',
      'ausencias.aprovar',
      'ausencias.observacoes.ver',
    ]);
    expect(chavesDaTela('inexistente')).toEqual([]);
  });

  it('normaliza: acrescenta o ver da tela, tira repetição e ordena', () => {
    expect(
      normalizarPermissoes([
        'repasse.recalcular',
        'faturamento.ver',
        'repasse.recalcular',
        'clientes.excluir',
        'inexistente.x',
      ]),
    ).toEqual([
      'clientes.excluir',
      'clientes.ver',
      'faturamento.ver',
      'repasse.recalcular',
      'repasse.ver',
    ]);
  });

  it('qualquer ação da configuração da escala leva junto o ver da escala', () => {
    expect(normalizarPermissoes(['escala-config.excluir'])).toEqual([
      'escala-config.excluir',
      'escala-config.ver',
      'escala.ver',
    ]);
  });

  it('qualquer ação da configuração da distribuição leva junto o ver da escala (a tela lê os turnos)', () => {
    expect(normalizarPermissoes(['distribuicao-config.editar'])).toEqual([
      'distribuicao-config.editar',
      'distribuicao-config.ver',
      'escala.ver',
    ]);
  });

  it('qualquer ação das ausências leva junto o ver da escala (o formulário lê turnos, frentes e médicos dela)', () => {
    expect(normalizarPermissoes(['ausencias.criar'])).toEqual([
      'ausencias.criar',
      'ausencias.ver',
      'escala.ver',
    ]);
  });

  it('editar a distribuição ou o acesso do médico leva junto o ver da mesma aba', () => {
    expect(normalizarPermissoes(['medicos.distribuicao.editar'])).toEqual([
      'medicos.distribuicao.editar',
      'medicos.distribuicao.ver',
      'medicos.ver',
    ]);
    expect(normalizarPermissoes(['medicos.acesso.editar'])).toEqual([
      'medicos.acesso.editar',
      'medicos.acesso.ver',
      'medicos.ver',
    ]);
  });

  it('só implica chaves da própria tela que existem no catálogo', () => {
    for (const t of CATALOGO_PERMISSOES) {
      for (const e of t.especiais) {
        for (const chave of e.implica ?? []) {
          expect(chave.startsWith(`${t.tela}.`)).toBe(true);
          expect(existePermissao(chave)).toBe(true);
          expect(chave).not.toBe(e.chave);
        }
      }
    }
  });

  it('toda chave exigida por @Permissao() na API existe no catálogo', () => {
    const raiz = join(__dirname, '../..');
    const arquivos = readdirSync(raiz, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const usadas = new Set(
      arquivos.flatMap((f) =>
        [...readFileSync(join(raiz, f), 'utf8').matchAll(/@Permissao\(([^)]*)\)/g)].flatMap((m) =>
          [...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((c) => c[1] ?? ''),
        ),
      ),
    );

    expect(usadas.size).toBeGreaterThan(20);
    expect([...usadas].filter((chave) => !existePermissao(chave))).toEqual([]);
  });
});
