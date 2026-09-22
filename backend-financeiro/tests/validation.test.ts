import { describe, expect, it } from 'vitest';
import { assertBusinessDate } from '../src/domain/validation.js';

describe('fechas de negocio', () => {
  it('acepta fechas reales dentro del rango permitido', () => expect(() => assertBusinessDate('2026-08-11')).not.toThrow());
  it('rechaza un año fuera del rango', () => expect(() => assertBusinessDate('1999-12-31')).toThrow('2000 y 2100'));
  it('rechaza una fecha inexistente', () => expect(() => assertBusinessDate('2026-02-30')).toThrow('no es válida'));
});
