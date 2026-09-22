/* =============================================================================
   Importación de planilla — carga inicial (clientes/proveedores y cuentas
   abiertas). Requisito de supervivencia del spec: "sin esto el proyecto muere
   en la largada".

   Decisiones conscientes:
   · CSV con `;` o `,` — se detecta por la línea de encabezado. En es-PY el
     Excel exporta con `;` porque la coma es el separador decimal.
   · Dinero en formato HUMANO dentro de la planilla ("1.500.000" en PYG,
     "1.500,00" en USD) y se convierte a unidades mínimas (bigint) acá, una
     sola vez, con reglas por moneda. Nada de float.
   · Fechas: aaaa-mm-dd o dd/mm/aaaa.
   · Una fila con error NO frena a las demás: el preview marca cada una y el
     confirmar importa solo las válidas, informando las saltadas.
   ============================================================================ */

import type { Currency } from './currency.js';

export type TipoPlanilla = 'CONTRAPARTES' | 'CUENTAS_PAGAR' | 'CUENTAS_COBRAR';

export interface FilaPlanilla<T> {
  linea: number; // número de línea en el archivo (1 = encabezado)
  datos: T | null;
  errores: string[];
}

/* --- CSV ------------------------------------------------------------------ */

export function detectSeparator(headerLine: string): ';' | ',' {
  const semicolons = headerLine.split(';').length;
  const commas = headerLine.split(',').length;
  return semicolons > commas ? ';' : ',';
}

/** Parser CSV mínimo y correcto: comillas dobles, `""` como comilla escapada,
 *  separador configurable. Sin librería porque el formato de carga inicial es
 *  controlado y cada dependencia es una superficie de ataque. */
export function parseCsv(text: string, separator: ';' | ','): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => { row.push(field.trim()); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === separator) { pushField(); continue; }
    if (char === '\n') { pushRow(); continue; }
    if (char === '\r') continue;
    field += char;
  }
  if (field !== '' || row.length > 0) pushRow();
  // Suelta filas completamente vacías (típica línea final del Excel)
  return rows.filter((cells) => cells.some((cell) => cell !== ''));
}

/* --- Valores humanos → formato del sistema --------------------------------- */

/** Convierte importe humano a unidades mínimas según la moneda.
 *  PYG: enteros, el punto es separador de miles ("1.500.000").
 *  USD/BRL: coma es el decimal ("1.500,00"); se acepta también punto decimal
 *  plano ("1500.00") cuando no hay ambigüedad. */
export function parseImporteHumano(raw: string, currency: Currency): bigint {
  const value = raw.trim().replace(/\s/g, '');
  if (!value) throw new Error('Importe vacío.');

  if (currency === 'PYG') {
    const digits = value.replace(/\./g, '');
    if (!/^\d+$/.test(digits)) throw new Error(`Importe PYG inválido: "${raw}". Use solo dígitos y puntos de miles.`);
    return BigInt(digits);
  }

  const hasDot = value.includes('.');
  const hasComma = value.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    // estilo es-PY: 1.500,00
    normalized = value.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = value.replace(',', '.');
  } else if (hasDot) {
    const parts = value.split('.');
    const last = parts[parts.length - 1];
    // un solo punto con 1-2 dígitos finales = decimal plano; lo demás = miles
    normalized = parts.length === 2 && last.length <= 2 ? value : value.replace(/\./g, '');
  } else {
    normalized = value;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`Importe ${currency} inválido: "${raw}".`);
  const [integer, decimals = ''] = normalized.split('.');
  return BigInt(integer) * 100n + BigInt((decimals + '00').slice(0, 2));
}

/** aaaa-mm-dd o dd/mm/aaaa → aaaa-mm-dd (validación estricta real del día). */
export function parseFechaHumana(raw: string): string {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const latam = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  let year: number; let month: number; let day: number;
  if (iso) [, year, month, day] = iso.map(Number);
  else if (latam) { day = Number(latam[1]); month = Number(latam[2]); year = Number(latam[3]); }
  else throw new Error(`Fecha inválida: "${raw}". Use aaaa-mm-dd o dd/mm/aaaa.`);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || year < 2000 || year > 2100) {
    throw new Error(`Fecha inexistente: "${raw}".`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Suma meses respetando fin de mes corto (31/01 + 1 mes = 28/02). */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/* --- Filas tipadas ---------------------------------------------------------- */

export interface ContrapartePlanilla {
  tipoPersona: 'F' | 'J';
  ruc?: string;
  razonSocial: string;
  nombreFantasia?: string;
  ciudad?: string;
  telefono?: string;
  celular?: string;
  email?: string;
}

export interface CuentaPlanilla {
  descripcion: string;
  numeroDocumento?: string;
  contraparte?: string; // RUC o razón social — se resuelve al confirmar
  moneda: Currency;
  valorTotalMinor: bigint;
  fechaEmision: string;
  fechaVencimiento: string;
  cuotas: number;
}

export const ENCABEZADOS: Record<TipoPlanilla, string[]> = {
  CONTRAPARTES: ['tipo_persona', 'ruc', 'razon_social', 'nombre_fantasia', 'ciudad', 'telefono', 'celular', 'email'],
  CUENTAS_PAGAR: ['descripcion', 'documento', 'contraparte', 'moneda', 'valor', 'emision', 'vencimiento', 'cuotas'],
  CUENTAS_COBRAR: ['descripcion', 'documento', 'contraparte', 'moneda', 'valor', 'emision', 'vencimiento', 'cuotas'],
};

/** Índice de cada columna por nombre de encabezado (tolerante a mayúsculas y
 *  a columnas faltantes — las opcionales simplemente no aparecen). */
function mapColumns(header: string[], expected: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((cell, index) => {
    const name = cell.trim().toLowerCase();
    if (expected.includes(name)) map.set(name, index);
  });
  return map;
}

function cellOf(cells: string[], map: Map<string, number>, name: string): string {
  const index = map.get(name);
  return index === undefined ? '' : (cells[index] ?? '');
}

export function parsePlanilla(tipo: TipoPlanilla, text: string): { filas: Array<FilaPlanilla<ContrapartePlanilla | CuentaPlanilla>>; validas: number; conError: number } {
  const rows = parseCsv(text.replace(/^﻿/, ''), detectSeparator(text.split(/\r?\n/, 1)[0] ?? ''));
  if (rows.length < 2) throw new Error('La planilla está vacía o no tiene encabezado.');
  const map = mapColumns(rows[0], ENCABEZADOS[tipo]);
  const required = tipo === 'CONTRAPARTES' ? ['razon_social'] : ['descripcion', 'moneda', 'valor', 'emision', 'vencimiento'];
  const missing = required.filter((name) => !map.has(name));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}.`);

  const filas: Array<FilaPlanilla<ContrapartePlanilla | CuentaPlanilla>> = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex];
    const linea = rowIndex + 1;
    const errores: string[] = [];

    if (tipo === 'CONTRAPARTES') {
      const tipoPersonaRaw = cellOf(cells, map, 'tipo_persona').toUpperCase();
      const email = cellOf(cells, map, 'email');
      if (tipoPersonaRaw && !['F', 'J'].includes(tipoPersonaRaw)) errores.push(`tipo_persona debe ser F o J, vino "${tipoPersonaRaw}".`);
      if (!cellOf(cells, map, 'razon_social')) errores.push('razon_social es obligatoria.');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.push(`email inválido: "${email}".`);
      filas.push({
        linea,
        errores,
        datos: errores.length ? null : {
          tipoPersona: (tipoPersonaRaw || 'J') as 'F' | 'J',
          ruc: cellOf(cells, map, 'ruc') || undefined,
          razonSocial: cellOf(cells, map, 'razon_social'),
          nombreFantasia: cellOf(cells, map, 'nombre_fantasia') || undefined,
          ciudad: cellOf(cells, map, 'ciudad') || undefined,
          telefono: cellOf(cells, map, 'telefono') || undefined,
          celular: cellOf(cells, map, 'celular') || undefined,
          email: email || undefined,
        },
      });
    } else {
      let moneda: Currency | null = null;
      let valorTotalMinor: bigint | null = null;
      let fechaEmision = '';
      let fechaVencimiento = '';
      let cuotas = 1;
      const monedaRaw = cellOf(cells, map, 'moneda').toUpperCase();
      if (!['PYG', 'USD', 'BRL'].includes(monedaRaw)) errores.push(`moneda debe ser PYG, USD o BRL, vino "${monedaRaw}".`);
      else moneda = monedaRaw as Currency;
      if (!cellOf(cells, map, 'descripcion')) errores.push('descripcion es obligatoria.');
      try { if (moneda) { valorTotalMinor = parseImporteHumano(cellOf(cells, map, 'valor'), moneda); if (valorTotalMinor <= 0n) errores.push('valor debe ser mayor que cero.'); } } catch (error) { errores.push((error as Error).message); }
      try { fechaEmision = parseFechaHumana(cellOf(cells, map, 'emision')); } catch (error) { errores.push((error as Error).message); }
      try { fechaVencimiento = parseFechaHumana(cellOf(cells, map, 'vencimiento')); } catch (error) { errores.push((error as Error).message); }
      const cuotasRaw = cellOf(cells, map, 'cuotas');
      if (cuotasRaw) {
        cuotas = Number(cuotasRaw);
        if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 120) errores.push(`cuotas debe ser un entero entre 1 y 120, vino "${cuotasRaw}".`);
      }
      if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) errores.push('vencimiento anterior a la emisión.');
      filas.push({
        linea,
        errores,
        datos: errores.length || !moneda || valorTotalMinor === null ? null : {
          descripcion: cellOf(cells, map, 'descripcion'),
          numeroDocumento: cellOf(cells, map, 'documento') || undefined,
          contraparte: cellOf(cells, map, 'contraparte') || undefined,
          moneda,
          valorTotalMinor,
          fechaEmision,
          fechaVencimiento,
          cuotas,
        },
      });
    }
  }

  const conError = filas.filter((fila) => fila.errores.length > 0).length;
  return { filas, validas: filas.length - conError, conError };
}
