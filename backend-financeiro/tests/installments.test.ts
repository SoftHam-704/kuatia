import { describe, expect, it } from 'vitest';
import { assertInstallmentsTotal, splitMinorAmount } from '../src/domain/installments.js';

describe('cuotas', () => {
  it('distribuye el resto sin perder unidades de PYG', () => {
    const cuotas = splitMinorAmount(1_000_000n, 3);
    expect(cuotas).toEqual([333_334n, 333_333n, 333_333n]);
    expect(() => assertInstallmentsTotal(1_000_000n, cuotas)).not.toThrow();
  });
});
