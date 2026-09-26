import { apiClient } from '../../../lib/api-client';
import type { Uom, UomInput } from './types';

const BASE_PATH = '/api/inventory/uoms';

export function listUoms(): Promise<Uom[]> {
  return apiClient.get<Uom[]>(BASE_PATH);
}

export function createUom(input: UomInput): Promise<Uom> {
  return apiClient.post<Uom>(BASE_PATH, input);
}

export function updateUom(id: string, patch: Partial<UomInput> & { active?: boolean }): Promise<Uom> {
  return apiClient.patch<Uom>(`${BASE_PATH}/${id}`, patch);
}
