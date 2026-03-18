import type { TipoTabela } from './tipos.js';

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
] as const;

export const MAPA_TIPO: Record<string, TipoTabela> = {
  '0': 'ncm',
  '1': 'nbs',
  '2': 'lc116'
};

export const ROTULO_TIPO: Record<TipoTabela, string> = {
  ncm: 'NCM - Nomenclatura Comum do Mercosul',
  nbs: 'NBS - Nomenclatura Brasileira de Serviços',
  lc116: 'LC116 - Lei Complementar 116'
};

export const TIPOS: TipoTabela[] = ['ncm', 'nbs', 'lc116'];
