import { describe, expect, it } from 'vitest';
import { assertCanUpdateAccount } from '../src/domain/account-update.js';

describe('account-update domain rules', () => {
  it('permite atualizar metadados de conta aberta sem baixas', () => {
    expect(() =>
      assertCanUpdateAccount({
        estado: 'ABIERTO',
        hasDueDateChange: false,
        activeBajasCount: 0,
        tipo: 'pagar',
      }),
    ).not.toThrow();
  });

  it('permite atualizar vencimento de conta sem baixas', () => {
    expect(() =>
      assertCanUpdateAccount({
        estado: 'ABIERTO',
        hasDueDateChange: true,
        activeBajasCount: 0,
        tipo: 'pagar',
      }),
    ).not.toThrow();
  });

  it('bloqueia qualquer atualização em conta cancelada', () => {
    expect(() =>
      assertCanUpdateAccount({
        estado: 'CANCELADO',
        hasDueDateChange: false,
        activeBajasCount: 0,
        tipo: 'pagar',
      }),
    ).toThrow('No se puede modificar una cuenta cancelada.');
  });

  it('bloqueia alteração de vencimento em conta a pagar com baixas ativas', () => {
    expect(() =>
      assertCanUpdateAccount({
        estado: 'ABIERTO',
        hasDueDateChange: true,
        activeBajasCount: 1,
        tipo: 'pagar',
      }),
    ).toThrow('No se puede modificar el vencimiento de una cuenta con pagos aplicados.');
  });

  it('bloqueia alteração de vencimento em conta a cobrar com baixas ativas', () => {
    expect(() =>
      assertCanUpdateAccount({
        estado: 'ABIERTO',
        hasDueDateChange: true,
        activeBajasCount: 2,
        tipo: 'cobrar',
      }),
    ).toThrow('No se puede modificar el vencimiento de una cuenta con cobros aplicados.');
  });

  it('permite atualizar metadados mesmo em conta com baixas ativas se o vencimento não mudar', () => {
    expect(() =>
      assertCanUpdateAccount({
        estado: 'ABIERTO',
        hasDueDateChange: false,
        activeBajasCount: 1,
        tipo: 'pagar',
      }),
    ).not.toThrow();
  });
});
