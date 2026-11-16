import { describe, expect, it } from 'vitest';

import {
  classificarEstudo,
  type ExameDoCadastro,
  type RetratoCatalogo,
} from './classificar-estudo';

const exameMamografia: ExameDoCadastro = {
  id: 'ex-mamo',
  modalidadeId: 'mod-mg',
  especialidadeId: 'esp-mama',
  categoriaId: 'cat-sc',
};
const exameTorax: ExameDoCadastro = {
  id: 'ex-torax',
  modalidadeId: 'mod-ct',
  especialidadeId: 'esp-mi',
  categoriaId: null,
};
const exameAbdome: ExameDoCadastro = {
  id: 'ex-abdome',
  modalidadeId: 'mod-ct',
  especialidadeId: 'esp-mi',
  categoriaId: 'cat-sc',
};

const catalogo: RetratoCatalogo = {
  exames: new Map([
    ['mamografia', exameMamografia],
    ['tc torax', exameTorax],
    ['tc abdome', exameAbdome],
  ]),
  valoresForaDoPadrao: new Map([
    ['tc torax especial', { valores: 2, exame: exameTorax }],
    ['rx sem vinculo', { valores: 3, exame: null }],
  ]),
  quebras: new Map([
    [
      'tc torax e abdome',
      [
        { exameId: 'ex-torax', categoriaExameId: null, categoriaPecaId: 'cat-onco' },
        { exameId: 'ex-abdome', categoriaExameId: 'cat-sc', categoriaPecaId: 'cat-onco' },
      ],
    ],
  ]),
  modalidades: new Map([
    ['ct', 'mod-ct'],
    ['mg', 'mod-mg'],
    ['rx', 'mod-rx'],
    ['cr', 'mod-rx'],
    ['dx', 'mod-rx'],
    ['raio x', 'mod-rx'],
    ['ot', 'mod-do'],
  ]),
  especialidades: new Map([
    ['medicina interna', 'esp-mi'],
    ['neuro', 'esp-neuro'],
    ['mamo', 'esp-mama'],
    ['joelho', 'esp-msk'],
  ]),
  especialidadesInvalidas: new Set(['oncologico']),
};

const linha = (campos: Partial<Parameters<typeof classificarEstudo>[0]>) => ({
  estudo: 'TC TORAX',
  modalidade: 'CT',
  especialidade: 'MEDICINA INTERNA',
  valores: 1,
  ...campos,
});

describe('classificarEstudo', () => {
  describe('exame', () => {
    it('acha o exame do cadastro pela chave do estudo, sem o sufixo X do fim', () => {
      const r = classificarEstudo(linha({ estudo: 'TC TORAX X1 X2' }), catalogo);
      expect(r.exameId).toBe('ex-torax');
      expect(r.pendencias).toEqual([]);
    });

    it('estudo fora do cadastro vira pendência de estudo', () => {
      const r = classificarEstudo(linha({ estudo: 'RM ESPECTROSCOPIA' }), catalogo);
      expect(r.exameId).toBeNull();
      expect(r.pendencias).toContainEqual({ tipo: 'estudo', valor: 'RM ESPECTROSCOPIA' });
    });

    it('estudo fora do padrão com exame vinculado não vira pendência', () => {
      const r = classificarEstudo(linha({ estudo: 'TC TORAX ESPECIAL' }), catalogo);
      expect(r.exameId).toBeNull();
      expect(r.pendencias).toEqual([]);
    });
  });

  describe('modalidade', () => {
    it('com o exame no cadastro, vale a modalidade dele (mamografia em CR vira MG)', () => {
      const r = classificarEstudo(
        linha({ estudo: 'MAMOGRAFIA', modalidade: 'CR', especialidade: '' }),
        catalogo,
      );
      expect(r.modalidadeId).toBe('mod-mg');
    });

    it('sem o exame, vale a variação de modalidade (OT → DO, DX → RX)', () => {
      expect(
        classificarEstudo(linha({ estudo: 'DENSITO X', modalidade: 'OT' }), catalogo).modalidadeId,
      ).toBe('mod-do');
      expect(
        classificarEstudo(linha({ estudo: 'RX PUNHO', modalidade: 'dx' }), catalogo).modalidadeId,
      ).toBe('mod-rx');
    });

    it('modalidade desconhecida sem exame no cadastro vira pendência', () => {
      const r = classificarEstudo(linha({ estudo: 'PET CORPO', modalidade: 'PT' }), catalogo);
      expect(r.modalidadeId).toBeNull();
      expect(r.pendencias).toContainEqual({ tipo: 'modalidade', valor: 'PT' });
    });
  });

  describe('especialidade', () => {
    it('com o exame no cadastro, vale a especialidade dele', () => {
      const r = classificarEstudo(linha({ especialidade: 'NEURO' }), catalogo);
      expect(r.especialidadeId).toBe('esp-mi');
    });

    it('o exame vinculado ao valor fora do padrão empresta especialidade e categoria', () => {
      const r = classificarEstudo(
        linha({ estudo: 'TC TORAX ESPECIAL', especialidade: 'NEURO' }),
        catalogo,
      );
      expect(r.especialidadeId).toBe('esp-mi');
      expect(r.categoriaId).toBeNull();
    });

    it('sem exame, vale a especialidade que chega, pela grafia ou região anatômica', () => {
      expect(
        classificarEstudo(linha({ estudo: 'RM X', especialidade: 'Neuro' }), catalogo)
          .especialidadeId,
      ).toBe('esp-neuro');
      expect(
        classificarEstudo(linha({ estudo: 'RM X', especialidade: 'MAMO' }), catalogo)
          .especialidadeId,
      ).toBe('esp-mama');
      expect(
        classificarEstudo(linha({ estudo: 'RM X', especialidade: 'JOELHO' }), catalogo)
          .especialidadeId,
      ).toBe('esp-msk');
    });

    it('especialidade que é modalidade (CT, RAIO X) é ignorada, sem pendência', () => {
      const r = classificarEstudo(linha({ estudo: 'RM X', especialidade: 'RAIO X' }), catalogo);
      expect(r.especialidadeId).toBeNull();
      expect(r.pendencias).not.toContainEqual(expect.objectContaining({ tipo: 'especialidade' }));
    });

    it('especialidade marcada como "não é especialidade" é ignorada, sem pendência', () => {
      const r = classificarEstudo(linha({ estudo: 'RM X', especialidade: 'ONCOLÓGICO' }), catalogo);
      expect(r.especialidadeId).toBeNull();
      expect(r.pendencias).not.toContainEqual(expect.objectContaining({ tipo: 'especialidade' }));
    });

    it('especialidade desconhecida vira pendência', () => {
      const r = classificarEstudo(linha({ estudo: 'RM X', especialidade: 'PEDIATRIA' }), catalogo);
      expect(r.especialidadeId).toBeNull();
      expect(r.pendencias).toContainEqual({ tipo: 'especialidade', valor: 'PEDIATRIA' });
    });
  });

  describe('conferidos', () => {
    it('lista o que chegou e foi achado no catálogo, para resolver avisos antigos', () => {
      const r = classificarEstudo(
        linha({ estudo: 'RM X', modalidade: 'dx', especialidade: 'Neuro' }),
        catalogo,
      );
      expect(r.conferidos).toEqual([
        { tipo: 'modalidade', valor: 'dx' },
        { tipo: 'especialidade', valor: 'Neuro' },
      ]);
    });

    it('com o exame no cadastro, a modalidade e a especialidade que chegam nem são consultadas', () => {
      const r = classificarEstudo(linha({ modalidade: 'XX', especialidade: 'YY' }), catalogo);
      expect(r.conferidos).toEqual([{ tipo: 'estudo', valor: 'TC TORAX' }]);
    });
  });

  describe('volume', () => {
    it('VALORES zerado usa o valor fora do padrão do estudo', () => {
      expect(
        classificarEstudo(linha({ estudo: 'RX SEM VINCULO X2', valores: 0 }), catalogo).volume,
      ).toBe(3);
    });

    it('VALORES zerado sem valor fora do padrão vale 1', () => {
      expect(classificarEstudo(linha({ valores: 0 }), catalogo).volume).toBe(1);
    });
  });

  describe('quebra', () => {
    it('casa o estudo limpo e devolve uma peça por exame, com a categoria do exame antes da peça', () => {
      const r = classificarEstudo(linha({ estudo: 'TC TORAX X1 E ABDOME', valores: 2 }), catalogo);
      expect(r.pecas).toEqual([
        { exameId: 'ex-torax', categoriaId: 'cat-onco' },
        { exameId: 'ex-abdome', categoriaId: 'cat-sc' },
      ]);
      expect(r.volume).toBe(2);
    });

    it('estudo que se quebra não vira pendência mesmo fora do cadastro', () => {
      const r = classificarEstudo(linha({ estudo: 'TC TORAX E ABDOME' }), catalogo);
      expect(r.pendencias).toEqual([]);
    });

    it('sem quebra, não há peças', () => {
      expect(classificarEstudo(linha({}), catalogo).pecas).toEqual([]);
    });
  });
});
