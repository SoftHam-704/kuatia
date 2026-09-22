import { describe, expect, it } from 'vitest';
import { assertMonetaryAmount, formatMoney } from '../src/domain/currency.js';

describe('reglas monetarias', () => {
  it('acepta guaraníes enteros', () => {
    expect(() => assertMonetaryAmount('1500000', 'PYG')).not.toThrow();
  });

  it('rechaza fracciones de guaraní', () => {
    expect(() => assertMonetaryAmount('1500000.01', 'PYG')).toThrow('PYG admite como máximo 0 decimales');
  });

  it('acepta dos decimales para dólar y real', () => {
    expect(() => assertMonetaryAmount('99.99', 'USD')).not.toThrow();
    expect(() => assertMonetaryAmount('99.99', 'BRL')).not.toThrow();
  });

  it('muestra PYG sin casas y USD con dos', () => {
    expect(formatMoney(1500, 'PYG')).not.toMatch(/,00$/);
    expect(formatMoney(12.5, 'USD')).toMatch(/12,50|12\.50/);
  });
});
