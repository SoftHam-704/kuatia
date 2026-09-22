import { describe, expect, it } from 'vitest';
import {
  addMonths,
  detectSeparator,
  parseCsv,
  parseFechaHumana,
  parseImporteHumano,
  parsePlanilla,
} from '../src/domain/spreadsheet-import.js';

describe('detectSeparator', () => {
  it('prefiere ; cuando domina en el encabezado (Excel es-PY)', () => {
    expect(detectSeparator('a;b;c')).toBe(';');
    expect(detectSeparator('a,b,c')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('separa campos, respeta comillas y suelta filas vacías', () => {
    const rows = parseCsv('a;b\n"1;uno";dos\n\nultimo;"con ""comilla"""\n', ';');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1;uno', 'dos'],
      ['ultimo', 'con "comilla"'],
    ]);
  });
});

describe('parseImporteHumano', () => {
  it('PYG: enteros con punto de miles', () => {
    expect(parseImporteHumano('1.500.000', 'PYG')).toBe(1500000n);
    expect(parseImporteHumano('750000', 'PYG')).toBe(750000n);
  });
  it('USD/BRL: coma decimal estilo es-PY', () => {
    expect(parseImporteHumano('1.500,00', 'USD')).toBe(150000n);
    expect(parseImporteHumano('99,90', 'BRL')).toBe(9990n);
  });
  it('USD/BRL: punto decimal plano cuando no es ambiguo', () => {
    expect(parseImporteHumano('1500.00', 'USD')).toBe(150000n);
    expect(parseImporteHumano('1.500', 'USD')).toBe(150000n); // miles, no decimal
  });
  it('rechaza basura', () => {
    expect(() => parseImporteHumano('abc', 'PYG')).toThrow();
    expect(() => parseImporteHumano('', 'USD')).toThrow();
    expect(() => parseImporteHumano('1,234', 'USD')).toThrow(); // coma sola con 3 dígitos: ambigua, fuera
  });
});

describe('parseFechaHumana', () => {
  it('acepta ISO y dd/mm/aaaa', () => {
    expect(parseFechaHumana('2026-08-22')).toBe('2026-08-22');
    expect(parseFechaHumana('22/8/2026')).toBe('2026-08-22');
  });
  it('rechaza fechas inexistentes', () => {
    expect(() => parseFechaHumana('31/02/2026')).toThrow();
    expect(() => parseFechaHumana('1999-01-01')).toThrow();
  });
});

describe('addMonths', () => {
  it('respeta fin de mes corto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-08-22', 3)).toBe('2026-11-22');
  });
});

describe('parsePlanilla', () => {
  it('CONTRAPARTES: marca fila mala sin frenar las buenas', () => {
    const csv = 'tipo_persona;ruc;razon_social;email\nJ;80012345-6;Proveedor SA;ok@mail.com\nX;;Sin tipo;malEmail\n';
    const result = parsePlanilla('CONTRAPARTES', csv);
    expect(result.validas).toBe(1);
    expect(result.conError).toBe(1);
    expect(result.filas[1].errores.length).toBeGreaterThan(1);
  });

  it('CUENTAS_PAGAR: convierte importes y fechas, exige columnas', () => {
    const csv = 'descripcion;moneda;valor;emision;vencimiento;cuotas\nAlquiler agosto;PYG;1.500.000;01/08/2026;31/08/2026;3\n';
    const result = parsePlanilla('CUENTAS_PAGAR', csv);
    expect(result.validas).toBe(1);
    const datos = result.filas[0].datos as { valorTotalMinor: bigint; cuotas: number; fechaEmision: string };
    expect(datos.valorTotalMinor).toBe(1500000n);
    expect(datos.cuotas).toBe(3);
    expect(datos.fechaEmision).toBe('2026-08-01');
  });

  it('falla entero si falta columna obligatoria', () => {
    expect(() => parsePlanilla('CUENTAS_COBRAR', 'descripcion;valor\nX;100\n')).toThrow(/obligatorias/);
  });

  it('vencimiento anterior a emisión es error de fila', () => {
    const csv = 'descripcion;moneda;valor;emision;vencimiento\nX;PYG;1000;2026-08-10;2026-08-01\n';
    const result = parsePlanilla('CUENTAS_PAGAR', csv);
    expect(result.conError).toBe(1);
  });
});
