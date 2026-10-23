// Metadados de origem e confiabilidade para todo dado numérico de catálogo.

/**
 * - 'publicado': valor divulgado pelo fabricante/operador ou documento oficial citado;
 * - 'derivado': calculado a partir de valores publicados (ex.: empuxo = ṁ·Isp·g0);
 * - 'estimado': estimativa pública não oficial, NÃO validada;
 * - 'didatico': valor de jogo escolhido para fins didáticos, sem pretensão de realidade.
 */
export type DataStatus = 'publicado' | 'derivado' | 'estimado' | 'didatico';
export type Confidence = 'alta' | 'media' | 'baixa';

export interface Provenance {
  source: string;
  status: DataStatus;
  confidence: Confidence;
  note?: string;
}

export const STATUS_LABEL: Record<DataStatus, string> = {
  publicado: 'Publicado',
  derivado: 'Derivado',
  estimado: 'Estimado (não validado)',
  didatico: 'Valor didático',
};
