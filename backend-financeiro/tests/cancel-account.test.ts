import { describe, expect, it } from 'vitest';
import { assertCanCancelAccount, assertCanSettleInstallment } from '../src/domain/cancellation.js';

describe('Account cancellation rules (War Game B2)', () => {
  it('permite cancelar conta aberta sem baixas ativas (contas a pagar)', () => {
    expect(() => {
      assertCanCancelAccount({ estado: 'ABIERTO', activeBajasCount: 0, tipo: 'pagar' });
    }).not.toThrow();
  });

  it('permite cancelar conta aberta sem baixas ativas (contas a receber)', () => {
    expect(() => {
      assertCanCancelAccount({ estado: 'ABIERTO', activeBajasCount: 0, tipo: 'cobrar' });
    }).not.toThrow();
  });

  it('impede cancelar conta já cancelada', () => {
    expect(() => {
      assertCanCancelAccount({ estado: 'CANCELADO', activeBajasCount: 0, tipo: 'pagar' });
    }).toThrow('La cuenta ya se encuentra cancelada.');
  });

  it('impede cancelar conta com pagamentos aplicados não estornados', () => {
    expect(() => {
      assertCanCancelAccount({ estado: 'ABIERTO', activeBajasCount: 1, tipo: 'pagar' });
    }).toThrow('No se puede cancelar una cuenta con pagos aplicados. Debe revertir los pagos primero.');
  });

  it('impede cancelar conta com recebimentos aplicados não estornados', () => {
    expect(() => {
      assertCanCancelAccount({ estado: 'ABIERTO', activeBajasCount: 2, tipo: 'cobrar' });
    }).toThrow('No se puede cancelar una cuenta con cobros aplicados. Debe revertir los cobros primero.');
  });

  it('permite registrar baixa quando conta e parcela estão abertas', () => {
    expect(() => {
      assertCanSettleInstallment({ cuentaEstado: 'ABIERTO', cuotaEstado: 'ABIERTO', tipo: 'pagar' });
    }).not.toThrow();
  });

  it('bloqueia baixa quando a conta a pagar foi cancelada', () => {
    expect(() => {
      assertCanSettleInstallment({ cuentaEstado: 'CANCELADO', cuotaEstado: 'ABIERTO', tipo: 'pagar' });
    }).toThrow('No se puede registrar un pago en una cuenta o cuota cancelada.');
  });

  it('bloqueia baixa quando a parcela a pagar foi cancelada', () => {
    expect(() => {
      assertCanSettleInstallment({ cuentaEstado: 'ABIERTO', cuotaEstado: 'CANCELADO', tipo: 'pagar' });
    }).toThrow('No se puede registrar un pago en una cuenta o cuota cancelada.');
  });

  it('bloqueia baixa quando a conta a receber foi cancelada', () => {
    expect(() => {
      assertCanSettleInstallment({ cuentaEstado: 'CANCELADO', cuotaEstado: 'ABIERTO', tipo: 'cobrar' });
    }).toThrow('No se puede registrar un cobro en una cuenta o cuota cancelada.');
  });
});
