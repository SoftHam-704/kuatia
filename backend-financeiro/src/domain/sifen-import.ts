import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export type ImportedCurrency = 'PYG' | 'USD' | 'BRL';

export interface SifenPurchasePreview {
  sourceHash: string;
  documentId: string;
  invoiceNumber: string | null;
  issuer: { ruc: string | null; razonSocial: string };
  fechaEmision: string;
  moneda: ImportedCurrency;
  totalMinor: string;
  ivaMinor: string;
  ivaTipo: '10' | '5' | 'EXENTA' | null;
  items: Array<{ descripcion: string; cantidad: string | null; totalMinor: string | null }>;
  signed: boolean;
  warnings: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || null;
  const record = objectValue(value);
  if (record && typeof record['#text'] === 'string') return record['#text'].trim() || null;
  return null;
}

function findFirst(node: unknown, names: readonly string[]): string | null {
  if (Array.isArray(node)) {
    for (const value of node) { const found = findFirst(value, names); if (found) return found; }
    return null;
  }
  const record = objectValue(node);
  if (!record) return null;
  for (const name of names) {
    if (name in record) {
      const value = text(record[name]);
      if (value) return value;
    }
  }
  for (const value of Object.values(record)) {
    const found = findFirst(value, names);
    if (found) return found;
  }
  return null;
}

function findNode(node: unknown, name: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const value of node) { const found = findNode(value, name); if (found) return found; }
    return null;
  }
  const record = objectValue(node);
  if (!record) return null;
  if (name in record) {
    const found = objectValue(record[name]);
    if (found) return found;
  }
  for (const value of Object.values(record)) {
    const found = findNode(value, name);
    if (found) return found;
  }
  return null;
}

function findAllNodes(node: unknown, name: string, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    node.forEach((value) => findAllNodes(value, name, output));
    return output;
  }
  const record = objectValue(node);
  if (!record) return output;
  if (name in record) {
    const value = record[name];
    const nodes = Array.isArray(value) ? value : [value];
    for (const entry of nodes) { const found = objectValue(entry); if (found) output.push(found); }
  }
  for (const value of Object.values(record)) findAllNodes(value, name, output);
  return output;
}

function normaliseCurrency(value: string | null): ImportedCurrency {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'USD' || normalized === '840' || normalized === 'US$') return 'USD';
  if (normalized === 'BRL' || normalized === '986' || normalized === 'R$') return 'BRL';
  return 'PYG';
}

function toMinor(value: string | null, currency: ImportedCurrency, label: string): string {
  if (!value) throw new Error(`El XML no informa ${label}.`);
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error(`El valor ${label} del XML es inválido.`);
  const [integer, fraction = ''] = normalized.split('.');
  if (currency === 'PYG') {
    if (fraction.replace(/0/g, '') !== '') throw new Error('Un documento en PYG no puede incluir fracciones de guaraní.');
    return BigInt(integer).toString();
  }
  if (fraction.length > 2) throw new Error(`El valor ${label} tiene más de dos decimales.`);
  return BigInt(`${integer}${fraction.padEnd(2, '0')}`).toString();
}

function invoiceNumber(document: Record<string, unknown>): string | null {
  const establishment = findFirst(document, ['dEst']);
  const expedition = findFirst(document, ['dPunExp']);
  const number = findFirst(document, ['dNumDoc']);
  if (!number) return null;
  const pad = (value: string | null, width: number) => value ? value.padStart(width, '0') : null;
  return [pad(establishment, 3), pad(expedition, 3), pad(number, 7)].filter(Boolean).join('-') || number;
}

export function parseSifenPurchaseXml(xml: string): SifenPurchasePreview {
  let parsed: unknown;
  try { parsed = parser.parse(xml); } catch { throw new Error('El archivo no contiene XML válido.'); }
  const root = objectValue(parsed);
  const envelope = root?.rDE;
  const document = objectValue(envelope)?.DE ?? root?.DE;
  const de = objectValue(document);
  if (!de) throw new Error('El XML no corresponde a un Documento Electrónico (DE) de SIFEN.');

  const currency = normaliseCurrency(findFirst(de, ['cMoneOpe', 'cMone']));
  const totalMinor = toMinor(findFirst(de, ['dTotGralOpe']), currency, 'el total general');
  const ivaValue = findFirst(de, ['dTotIVA', 'dIVA']) ?? '0';
  const ivaMinor = toMinor(ivaValue, currency, 'el IVA total');
  const emission = findFirst(de, ['dFeEmi']);
  const fechaEmision = emission?.slice(0, 10);
  if (!fechaEmision || !/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) throw new Error('El XML no informa una fecha de emisión válida.');

  const rucBase = findFirst(de, ['dRucEm']);
  const rucDigit = findFirst(de, ['dDVEmi', 'dDVEm']);
  const ruc = rucBase ? `${rucBase}${rucDigit ? `-${rucDigit}` : ''}` : null;
  const issuerName = findFirst(de, ['dNomEmi', 'dNomEm']) ?? 'Proveedor sin nombre';
  const taxRate = findFirst(de, ['cTasaIVA']);
  const ivaTipo = taxRate === '10' ? '10' : taxRate === '5' ? '5' : ivaMinor === '0' ? 'EXENTA' : null;
  const sourceId = text(de['@_Id']) ?? invoiceNumber(de) ?? createHash('sha256').update(xml).digest('hex');
  const items = findAllNodes(de, 'gCamItem').map((item) => ({
    descripcion: findFirst(item, ['dDesProSer', 'dDesItem']) ?? 'Ítem sin descripción',
    cantidad: findFirst(item, ['dCantProSer']),
    totalMinor: (() => {
      const value = findFirst(item, ['dTotOpeItem']);
      return value ? toMinor(value, currency, 'el total de un ítem') : null;
    })(),
  }));
  const warnings: string[] = [];
  if (!ruc) warnings.push('El XML no informa RUC del emisor; se creará el proveedor sin RUC.');
  if (!items.length) warnings.push('El XML no contiene ítems legibles; se importará el total del documento.');
  const signed = findNode(root, 'Signature') !== null;
  if (!signed) warnings.push('No se encontró firma digital en el XML. La importación no sustituye la validación del documento en SIFEN.');

  return {
    sourceHash: createHash('sha256').update(xml).digest('hex'), documentId: sourceId, invoiceNumber: invoiceNumber(de),
    issuer: { ruc, razonSocial: issuerName }, fechaEmision, moneda: currency, totalMinor, ivaMinor, ivaTipo,
    items, signed, warnings,
  };
}
