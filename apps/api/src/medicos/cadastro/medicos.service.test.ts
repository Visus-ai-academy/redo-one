import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
} from '../../catalogo/comum/catalogo.errors';
import { InMemoryListaRepository } from '../../catalogo/testing/fakes';
import { FixedClock } from '../../identidade/testing/fakes';
import { InMemoryMedicosRepository } from '../testing/fakes';
import {
  IdMobilemedEmUsoError,
  NivelInexistenteError,
  NomeMedicoInvalidoError,
} from './medicos.errors';
import type { DadosMedico } from './medicos.repository';
import { MedicosService } from './medicos.service';

const AGORA = new Date('2026-11-14T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const dados = (extra: Partial<DadosMedico> = {}): DadosMedico => ({
  nome: 'Dr. Augusto Lima',
  crm: null,
  idMobilemed: null,
  email: null,
  telefone: null,
  ativo: true,
  ocultoDashboards: false,
  senior: false,
  fellowship: false,
  funcao: null,
  nivelId: null,
  dataInicioVinculo: null,
  observacoes: null,
  ...extra,
});

describe('MedicosService', () => {
  let niveis: InMemoryListaRepository;
  let repo: InMemoryMedicosRepository;
  let auditoria: InMemoryAuditoria;
  let service: MedicosService;

  beforeEach(() => {
    niveis = new InMemoryListaRepository();
    repo = new InMemoryMedicosRepository(niveis);
    auditoria = new InMemoryAuditoria();
    service = new MedicosService(repo, niveis, auditoria, new FixedClock(AGORA));
  });

  it('cria com os textos aparados, o e-mail em minúsculas e registra a auditoria', async () => {
    const id = await service.criar(
      ator,
      dados({ nome: '  Dr. Augusto Lima ', crm: ' 1234-SP ', email: ' Augusto@Clinica.COM ' }),
    );

    expect(await service.obter(id)).toMatchObject({
      nome: 'Dr. Augusto Lima',
      crm: '1234-SP',
      email: 'augusto@clinica.com',
    });
    expect(repo.medicos.get(id)?.chaveNormalizada).toBe('augusto lima');
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({ entidade: 'medico', entidadeId: id, acao: 'criado', em: AGORA }),
    ]);
  });

  it('recusa nome que normalizado fica vazio', async () => {
    await expect(service.criar(ator, dados({ nome: 'Dr. 123' }))).rejects.toThrow(
      NomeMedicoInvalidoError,
    );
  });

  it('recusa nome igual ao de outro médico depois de normalizado', async () => {
    await service.criar(ator, dados({ nome: 'Dr. Augusto Lima' }));

    await expect(service.criar(ator, dados({ nome: 'augusto  LIMA' }))).rejects.toThrow(
      NomeEmUsoError,
    );
    await expect(service.criar(ator, dados({ nome: 'augusto  LIMA' }))).rejects.toThrow(
      'Já existe um médico chamado "augusto  LIMA".',
    );
  });

  it('permite salvar o médico com o próprio nome', async () => {
    const id = await service.criar(ator, dados());

    await service.atualizar(ator, id, dados({ senior: true }));

    expect((await service.obter(id)).senior).toBe(true);
  });

  it('recusa id da MobileMed que já é de outro médico, dizendo de quem', async () => {
    await service.criar(ator, dados({ nome: 'Ana Reis', idMobilemed: 77 }));

    await expect(service.criar(ator, dados({ idMobilemed: 77 }))).rejects.toThrow(
      IdMobilemedEmUsoError,
    );
    await expect(service.criar(ator, dados({ idMobilemed: 77 }))).rejects.toThrow(
      'Esse ID da MobileMed já está no cadastro de Ana Reis.',
    );
  });

  it('exige que o nível exista', async () => {
    await expect(service.criar(ator, dados({ nivelId: 'nao-existe' }))).rejects.toThrow(
      NivelInexistenteError,
    );
  });

  it('mostra o nível escolhido no detalhe', async () => {
    const nivelId = await niveis.criar({
      nome: 'Nível 2',
      descricao: null,
      cor: null,
      ordem: 0,
      ativo: true,
    });

    const id = await service.criar(ator, dados({ nivelId }));

    expect((await service.obter(id)).nivel).toEqual({ id: nivelId, nome: 'Nível 2' });
  });

  it('audita na edição só os campos que mudaram', async () => {
    const id = await service.criar(ator, dados());

    await service.atualizar(ator, id, dados({ funcao: 'STAFF', ativo: false }));

    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { funcao: null, ativo: true },
      depois: { funcao: 'STAFF', ativo: false },
    });
  });

  it('avisa quando o médico não existe', async () => {
    await expect(service.obter('nao-existe')).rejects.toThrow(ItemNaoEncontradoError);
    await expect(service.obter('nao-existe')).rejects.toThrow('Médico não encontrado.');
  });

  it('exclui e audita; em uso, pede para desativar', async () => {
    const usado = await service.criar(ator, dados({ nome: 'Ana Reis' }));
    repo.emUso.add(usado);
    const livre = await service.criar(ator, dados());

    await service.excluir(ator, livre);
    await expect(service.obter(livre)).rejects.toThrow(ItemNaoEncontradoError);
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'excluido' });

    await expect(service.excluir(ator, usado)).rejects.toThrow(ItemEmUsoError);
    await expect(service.excluir(ator, usado)).rejects.toThrow(
      'O médico está em uso. Desative-o em vez de excluir.',
    );
  });

  it('lista paginado por nome, com busca por nome, CRM ou id da MobileMed', async () => {
    await service.criar(ator, dados({ nome: 'Dra. Carla Souza', crm: '999' }));
    await service.criar(ator, dados({ nome: 'Dr. Bruno Alves', idMobilemed: 42 }));
    await service.criar(ator, dados({ nome: 'Ana Reis', ativo: false }));

    const pagina = await service.listar({ pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((m) => m.nome)).toEqual(['Ana Reis', 'Dr. Bruno Alves']);

    expect((await service.listar({ busca: '999', pagina: 1, porPagina: 10 })).itens).toHaveLength(
      1,
    );
    expect((await service.listar({ busca: '42', pagina: 1, porPagina: 10 })).itens).toHaveLength(1);
    expect((await service.listar({ ativo: false, pagina: 1, porPagina: 10 })).total).toBe(1);
  });
});
