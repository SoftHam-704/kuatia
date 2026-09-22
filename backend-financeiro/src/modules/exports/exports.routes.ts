import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { companyDashboard } from '../reports/reports.routes.js';
import { projectCashflow, type CashflowEventInput, type CashflowInitialBalance } from '../../domain/cashflow.js';

const router = Router();
const querySchema = z.object({
  empresaId: z.coerce.number().int().positive(),
  tipo: z.enum(['PAGAR', 'COBRAR']),
  formato: z.enum(['xlsx', 'pdf']),
});
type Currency = 'PYG' | 'USD' | 'BRL';
interface AccountRow { fecha: string; descripcion: string; documento: string | null; contraparte: string | null; moneda: Currency; total_minor: string; saldo_minor: string; estado: string; }
interface CashRow { fecha: string; caja: string; historico: string; documento: string | null; origen: 'MA' | 'CP' | 'CC' | 'TR'; tipo: 'C' | 'D'; moneda: Currency; valor_minor: string; }
interface ReportTable { title: string; subtitle: string; headers: string[]; rows: string[][]; }

function formatMoney(minor: string, currency: Currency): string {
  const value = BigInt(minor); const negative = value < 0n; const digits = (negative ? -value : value).toString();
  const scale = currency === 'PYG' ? 0 : 2;
  const padded = scale ? digits.padStart(scale + 1, '0') : digits;
  const integer = scale ? padded.slice(0, -scale) : padded;
  const fraction = scale ? `,${padded.slice(-scale)}` : '';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${currency} ${grouped}${fraction}`;
}

function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function downloadName(tipo: 'PAGAR' | 'COBRAR', format: 'xlsx' | 'pdf'): string {
  return `kuatia-cuentas-${tipo.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${format}`;
}

function cashDownloadName(format: 'xlsx' | 'pdf'): string {
  return `kuatia-libro-caja-${new Date().toISOString().slice(0, 10)}.${format}`;
}

async function loadAccounts(tenantId: number, userId: number, schema: string, pool: NonNullable<Express.Request['auth']>['pool'], empresaId: number, tipo: 'PAGAR' | 'COBRAR') {
  return withTenantContext({ tenantId, userId, schema }, async (client) => {
    const company = await client.query('SELECT razon_social FROM empresas WHERE tenant_id=$1 AND id=$2 AND activa=TRUE', [tenantId, empresaId]);
    if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');
    const payable = tipo === 'PAGAR';
    const table = payable ? 'cuentas_pagar' : 'cuentas_cobrar';
    const installment = payable ? 'cuotas_pagar' : 'cuotas_cobrar';
    const ledger = payable ? 'bajas_pagar' : 'bajas_cobrar';
    const amount = payable ? 'valor_pagado_minor' : 'valor_cobrado_minor';
    const status = payable ? 'PAGADA' : 'COBRADA';
    const rows = await client.query(
      `SELECT c.fecha_vencimiento::TEXT AS fecha, c.descripcion, c.numero_documento AS documento, cp.razon_social AS contraparte,
              c.moneda, c.valor_total_minor::TEXT AS total_minor,
              COALESCE(s.saldo_minor, c.valor_total_minor)::TEXT AS saldo_minor,
              CASE WHEN COALESCE(s.saldo_minor, c.valor_total_minor)=0 THEN '${status}' WHEN c.fecha_vencimiento<CURRENT_DATE THEN 'VENCIDA' ELSE 'ABIERTA' END AS estado
       FROM ${table} c
       LEFT JOIN contrapartes cp ON cp.tenant_id=c.tenant_id AND cp.id=c.contraparte_id
       LEFT JOIN LATERAL (
         SELECT SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) AS saldo_minor
         FROM ${installment} q
         LEFT JOIN LATERAL (
           SELECT SUM(CASE WHEN tipo='BAJA' THEN ${amount}+descuento_minor ELSE -(${amount}+descuento_minor) END) AS aplicado_minor
           FROM ${ledger} WHERE tenant_id=q.tenant_id AND cuota_id=q.id
         ) b ON TRUE WHERE q.tenant_id=c.tenant_id AND q.${payable ? 'cuenta_pagar_id' : 'cuenta_cobrar_id'}=c.id
       ) s ON TRUE
       WHERE c.tenant_id=$1 AND c.empresa_id=$2 ORDER BY c.fecha_vencimiento, c.id LIMIT 10000`,
      [tenantId, empresaId],
    );
    return { company: company.rows[0].razon_social as string, rows: rows.rows as AccountRow[] };
  }, pool);
}

export async function createXlsx(company: string, title: string, rows: AccountRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kuatia'; workbook.created = new Date();
  const sheet = workbook.addWorksheet('Cuentas', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
  sheet.mergeCells('A1:H1'); sheet.getCell('A1').value = 'Kuatia - Gestión financiera'; sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C2A45' } }; sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.mergeCells('A2:H2'); sheet.getCell('A2').value = `${title} · ${company}`; sheet.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF17496F' } };
  sheet.mergeCells('A3:H3'); sheet.getCell('A3').value = `Emitido el ${new Date().toLocaleDateString('es-PY')}. Los importes se conservan como texto exacto para no perder precisión financiera.`; sheet.getCell('A3').font = { italic: true, color: { argb: 'FF536477' } };
  const headers = ['Vencimiento', 'Descripción', 'Documento', 'Proveedor / cliente', 'Moneda', 'Total', 'Saldo', 'Estado'];
  sheet.getRow(5).values = headers; sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17496F' } };
  rows.forEach((row) => sheet.addRow([formatDate(row.fecha), row.descripcion, row.documento ?? '', row.contraparte ?? '', row.moneda, formatMoney(row.total_minor, row.moneda), formatMoney(row.saldo_minor, row.moneda), row.estado]));
  sheet.columns = [{ width: 14 }, { width: 38 }, { width: 18 }, { width: 30 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 }];
  sheet.getColumn(6).alignment = { horizontal: 'right' }; sheet.getColumn(7).alignment = { horizontal: 'right' };
  sheet.autoFilter = { from: 'A5', to: `H${Math.max(5, rows.length + 5)}` };
  for (let rowIndex = 6; rowIndex <= rows.length + 5; rowIndex += 1) { const row = sheet.getRow(rowIndex); if (rowIndex % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } }; }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function createPdf(company: string, title: string, rows: AccountRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 }); const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const widths = [62, 180, 82, 134, 42, 76, 76, 58]; const headers = ['Venc.', 'Descripción', 'Documento', 'Proveedor / cliente', 'Moneda', 'Total', 'Saldo', 'Estado'];
    const drawHeader = () => { doc.fillColor('#0C2A45').fontSize(16).font('Helvetica-Bold').text('Kuatia - Gestión financiera'); doc.fillColor('#17496F').fontSize(11).text(`${title} · ${company}`); doc.fillColor('#536477').font('Helvetica').fontSize(8).text(`Emitido el ${new Date().toLocaleDateString('es-PY')}`); let x = doc.page.margins.left; const y = doc.y + 12; doc.fillColor('#17496F').rect(x, y, widths.reduce((a, b) => a + b, 0), 18).fill(); doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7); headers.forEach((header, index) => { doc.text(header, x + 3, y + 6, { width: widths[index] - 6, lineBreak: false }); x += widths[index]; }); return y + 22; };
    let y = drawHeader(); doc.font('Helvetica').fontSize(7);
    rows.forEach((row, index) => { if (y > doc.page.height - 45) { doc.addPage(); y = drawHeader(); doc.font('Helvetica').fontSize(7); } let x = doc.page.margins.left; if (index % 2 === 0) { doc.fillColor('#F4F7FA').rect(x, y - 2, widths.reduce((a, b) => a + b, 0), 17).fill(); } const values = [formatDate(row.fecha), row.descripcion, row.documento ?? '—', row.contraparte ?? '—', row.moneda, formatMoney(row.total_minor, row.moneda), formatMoney(row.saldo_minor, row.moneda), row.estado]; doc.fillColor('#1D2939'); values.forEach((value, column) => { doc.text(value, x + 3, y + 3, { width: widths[column] - 6, height: 10, ellipsis: true, lineBreak: false, align: column === 5 || column === 6 ? 'right' : 'left' }); x += widths[column]; }); y += 17; });
    doc.fontSize(7).fillColor('#536477').text(`Registros: ${rows.length}`, doc.page.margins.left, doc.page.height - 45, { lineBreak: false }); doc.end();
  });
}

async function loadCash(tenantId: number, userId: number, schema: string, pool: NonNullable<Express.Request['auth']>['pool'], empresaId: number, filters: { cajaId?: number; desde?: string; hasta?: string }) {
  return withTenantContext({ tenantId, userId, schema }, async (client) => {
    const company = await client.query('SELECT razon_social FROM empresas WHERE tenant_id=$1 AND id=$2 AND activa=TRUE', [tenantId, empresaId]);
    if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');
    const result = await client.query(
      `SELECT m.fecha::TEXT AS fecha,m.historico,m.documento,m.origen,m.tipo,m.moneda,m.valor_minor::TEXT,c.nombre AS caja
       FROM movimientos_caja m JOIN cajas c ON c.tenant_id=m.tenant_id AND c.id=m.caja_id
       WHERE m.tenant_id=$1 AND m.empresa_id=$2 AND ($3::bigint IS NULL OR m.caja_id=$3) AND ($4::date IS NULL OR m.fecha >= $4) AND ($5::date IS NULL OR m.fecha <= $5)
       ORDER BY m.fecha DESC,m.id DESC LIMIT 10000`,
      [tenantId, empresaId, filters.cajaId ?? null, filters.desde ?? null, filters.hasta ?? null],
    );
    return { company: company.rows[0].razon_social as string, rows: result.rows as CashRow[] };
  }, pool);
}

export async function createCashXlsx(company: string, rows: CashRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Kuatia'; workbook.created = new Date();
  const sheet = workbook.addWorksheet('Libro de Caja', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
  sheet.mergeCells('A1:H1'); sheet.getCell('A1').value = 'Kuatia - Gestión financiera'; sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C2A45' } };
  sheet.mergeCells('A2:H2'); sheet.getCell('A2').value = `Libro de Caja · ${company}`; sheet.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF17496F' } };
  sheet.mergeCells('A3:H3'); sheet.getCell('A3').value = `Emitido el ${new Date().toLocaleDateString('es-PY')}. Las monedas se mantienen separadas y los importes se preservan como texto exacto.`; sheet.getCell('A3').font = { italic: true, color: { argb: 'FF536477' } };
  sheet.getRow(5).values = ['Fecha', 'Caja / banco', 'Historial', 'Documento', 'Origen', 'Moneda', 'Entrada', 'Salida']; sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17496F' } };
  const origin = { MA: 'Manual', CP: 'Cuenta por pagar', CC: 'Cuenta por cobrar', TR: 'Transferencia' } as const;
  rows.forEach((row) => sheet.addRow([formatDate(row.fecha), row.caja, row.historico, row.documento ?? '', origin[row.origen], row.moneda, row.tipo === 'C' ? formatMoney(row.valor_minor, row.moneda) : '', row.tipo === 'D' ? formatMoney(row.valor_minor, row.moneda) : '']));
  sheet.columns = [{ width: 14 }, { width: 24 }, { width: 44 }, { width: 18 }, { width: 20 }, { width: 10 }, { width: 18 }, { width: 18 }]; sheet.getColumn(7).alignment = { horizontal: 'right' }; sheet.getColumn(8).alignment = { horizontal: 'right' }; sheet.autoFilter = { from: 'A5', to: `H${Math.max(5, rows.length + 5)}` };
  for (let rowIndex = 6; rowIndex <= rows.length + 5; rowIndex += 1) { if (rowIndex % 2 === 0) sheet.getRow(rowIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } }; }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function createCashPdf(company: string, rows: CashRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 }); const chunks: Buffer[] = []; doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const widths = [66, 105, 240, 76, 60, 45, 80, 80]; const headers = ['Fecha', 'Caja / banco', 'Historial', 'Documento', 'Origen', 'Moneda', 'Entrada', 'Salida']; const origin = { MA: 'Manual', CP: 'C. pagar', CC: 'C. cobrar', TR: 'Transfer.' } as const;
    const drawHeader = () => { doc.fillColor('#0C2A45').fontSize(16).font('Helvetica-Bold').text('Kuatia - Gestión financiera'); doc.fillColor('#17496F').fontSize(11).text(`Libro de Caja · ${company}`); doc.fillColor('#536477').font('Helvetica').fontSize(8).text(`Emitido el ${new Date().toLocaleDateString('es-PY')}`); let x = doc.page.margins.left; const y = doc.y + 12; doc.fillColor('#17496F').rect(x, y, widths.reduce((a, b) => a + b, 0), 18).fill(); doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7); headers.forEach((header, index) => { doc.text(header, x + 3, y + 6, { width: widths[index] - 6, lineBreak: false }); x += widths[index]; }); return y + 22; };
    let y = drawHeader(); doc.font('Helvetica').fontSize(7); rows.forEach((row, index) => { if (y > doc.page.height - 55) { doc.addPage(); y = drawHeader(); doc.font('Helvetica').fontSize(7); } let x = doc.page.margins.left; if (index % 2 === 0) { doc.fillColor('#F4F7FA').rect(x, y - 2, widths.reduce((a, b) => a + b, 0), 17).fill(); } const values = [formatDate(row.fecha), row.caja, row.historico, row.documento ?? '—', origin[row.origen], row.moneda, row.tipo === 'C' ? formatMoney(row.valor_minor, row.moneda) : '—', row.tipo === 'D' ? formatMoney(row.valor_minor, row.moneda) : '—']; doc.fillColor('#1D2939'); values.forEach((value, column) => { doc.text(value, x + 3, y + 3, { width: widths[column] - 6, height: 10, ellipsis: true, lineBreak: false, align: column > 5 ? 'right' : 'left' }); x += widths[column]; }); y += 17; }); doc.fontSize(7).fillColor('#536477').text(`Registros: ${rows.length}`, doc.page.margins.left, doc.page.height - 45, { lineBreak: false }); doc.end();
  });
}

export async function createReportXlsx(report: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Kuatia'; workbook.created = new Date(); const sheet = workbook.addWorksheet('Reporte', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] }); const last = String.fromCharCode(64 + report.headers.length);
  sheet.mergeCells(`A1:${last}1`); sheet.getCell('A1').value = 'Kuatia - Gestión financiera'; sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C2A45' } };
  sheet.mergeCells(`A2:${last}2`); sheet.getCell('A2').value = report.title; sheet.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF17496F' } }; sheet.mergeCells(`A3:${last}3`); sheet.getCell('A3').value = report.subtitle; sheet.getCell('A3').font = { italic: true, color: { argb: 'FF536477' } };
  sheet.getRow(5).values = report.headers; sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17496F' } }; report.rows.forEach((row) => sheet.addRow(row)); sheet.columns = report.headers.map((header, index) => ({ width: Math.min(42, Math.max(14, header.length + (index === 0 ? 18 : 8))) })); sheet.autoFilter = { from: 'A5', to: `${last}${Math.max(5, report.rows.length + 5)}` };
  for (let index = 6; index <= report.rows.length + 5; index += 1) if (index % 2 === 0) sheet.getRow(index).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function createReportPdf(report: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => { const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 }); const chunks: Buffer[] = []; doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right; const widths = report.headers.map(() => usable / report.headers.length);
    const drawHeader = () => { doc.fillColor('#0C2A45').fontSize(16).font('Helvetica-Bold').text('Kuatia - Gestión financiera'); doc.fillColor('#17496F').fontSize(11).text(report.title); doc.fillColor('#536477').font('Helvetica').fontSize(8).text(report.subtitle); let x = doc.page.margins.left; const y = doc.y + 12; doc.fillColor('#17496F').rect(x, y, usable, 18).fill(); doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7); report.headers.forEach((header, index) => { doc.text(header, x + 3, y + 6, { width: widths[index] - 6, lineBreak: false }); x += widths[index]; }); return y + 22; }; let y = drawHeader(); doc.font('Helvetica').fontSize(7);
    report.rows.forEach((row, rowIndex) => { if (y > doc.page.height - 55) { doc.addPage(); y = drawHeader(); doc.font('Helvetica').fontSize(7); } let x = doc.page.margins.left; if (rowIndex % 2 === 0) { doc.fillColor('#F4F7FA').rect(x, y - 2, usable, 17).fill(); } doc.fillColor('#1D2939'); row.forEach((value, index) => { doc.text(value, x + 3, y + 3, { width: widths[index] - 6, height: 10, ellipsis: true, lineBreak: false, align: index === row.length - 1 ? 'right' : 'left' }); x += widths[index]; }); y += 17; }); doc.fontSize(7).fillColor('#536477').text(`Registros: ${report.rows.length}`, doc.page.margins.left, doc.page.height - 45, { lineBreak: false }); doc.end(); });
}

router.get('/cuentas', authenticate, async (request, response) => {
  try {
    const { empresaId, tipo, formato } = querySchema.parse(request.query); const auth = request.auth!;
    const report = await loadAccounts(auth.tenantId, auth.tenantUserCode, auth.schema, auth.pool, empresaId, tipo);
    const title = tipo === 'PAGAR' ? 'Cuentas por pagar' : 'Cuentas por cobrar';
    const bytes = formato === 'xlsx' ? await createXlsx(report.company, title, report.rows) : await createPdf(report.company, title, report.rows);
    response.setHeader('Content-Type', formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${downloadName(tipo, formato)}"`);
    response.send(bytes);
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Parámetros de exportación inválidos.' : (error as Error).message }); }
});

router.get('/libro-caja', authenticate, async (request, response) => {
  try {
    const input = z.object({ empresaId: z.coerce.number().int().positive(), formato: z.enum(['xlsx', 'pdf']), cajaId: z.coerce.number().int().positive().optional(), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query);
    if (input.desde && input.hasta && input.hasta < input.desde) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
    const auth = request.auth!; const report = await loadCash(auth.tenantId, auth.tenantUserCode, auth.schema, auth.pool, input.empresaId, input);
    const bytes = input.formato === 'xlsx' ? await createCashXlsx(report.company, report.rows) : await createCashPdf(report.company, report.rows);
    response.setHeader('Content-Type', input.formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'); response.setHeader('Content-Disposition', `attachment; filename="${cashDownloadName(input.formato)}"`); response.send(bytes);
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Parámetros de exportación inválidos.' : (error as Error).message }); }
});

router.get('/reportes', authenticate, async (request, response) => {
  try {
    const input = z.object({ tipo: z.enum(['FLUJO', 'RESULTADOS', 'CONSOLIDADO']), formato: z.enum(['xlsx', 'pdf']), empresaId: z.coerce.number().int().positive().optional(), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query);
    if ((input.tipo === 'FLUJO' || input.tipo === 'RESULTADOS') && (!input.empresaId || !input.desde || !input.hasta)) throw new Error('Empresa y período son obligatorios.'); if (input.desde && input.hasta && input.hasta < input.desde) throw new Error('La fecha final debe ser igual o posterior a la inicial.'); const auth = request.auth!; if (input.tipo === 'CONSOLIDADO' && auth.role !== 'ADMIN_TENANT') throw new Error('El consolidado requiere perfil administrador.');
    const report = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client): Promise<ReportTable> => {
      if (input.tipo === 'FLUJO') {
        const company = await client.query('SELECT razon_social FROM empresas WHERE tenant_id=$1 AND id=$2 AND activa=TRUE', [auth.tenantId, input.empresaId]);
        if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');

        const initialRes = await client.query(
          `WITH saldos_caja AS (
             SELECT c.moneda,
                    c.saldo_inicial_minor + COALESCE(SUM(
                      CASE WHEN m.tipo = 'C' THEN m.valor_minor ELSE -m.valor_minor END
                    ) FILTER (WHERE m.fecha < $3 AND m.fecha >= c.fecha_saldo_inicial), 0) AS saldo_caja_minor
             FROM cajas c
             LEFT JOIN movimientos_caja m ON m.tenant_id = c.tenant_id AND m.caja_id = c.id
             WHERE c.tenant_id = $1 AND c.empresa_id = $2 AND c.activo = TRUE
             GROUP BY c.id, c.moneda, c.saldo_inicial_minor
           )
           SELECT moneda, SUM(saldo_caja_minor)::TEXT AS saldo_inicial_minor
           FROM saldos_caja
           GROUP BY moneda
           ORDER BY moneda`,
          [auth.tenantId, input.empresaId, input.desde],
        );

        const eventsRes = await client.query(
          `WITH eventos AS (
             SELECT cp.moneda, q.fecha_vencimiento AS fecha, 'PAGAR' AS tipo,
                    SUM(q.valor_minor - COALESCE(b.aplicado_minor, 0)) AS valor_minor
             FROM cuentas_pagar cp
             JOIN cuotas_pagar q ON q.tenant_id = cp.tenant_id AND q.cuenta_pagar_id = cp.id
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_pagado_minor + descuento_minor ELSE -(valor_pagado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_pagar WHERE tenant_id = q.tenant_id AND cuota_id = q.id
             ) b ON TRUE
             WHERE cp.tenant_id = $1 AND cp.empresa_id = $2 AND cp.estado <> 'CANCELADO' AND q.estado <> 'CANCELADO'
               AND q.fecha_vencimiento BETWEEN $3 AND $4
               AND (q.valor_minor - COALESCE(b.aplicado_minor, 0)) > 0
             GROUP BY cp.moneda, q.fecha_vencimiento
             UNION ALL
             SELECT cc.moneda, q.fecha_vencimiento, 'COBRAR',
                    SUM(q.valor_minor - COALESCE(b.aplicado_minor, 0))
             FROM cuentas_cobrar cc
             JOIN cuotas_cobrar q ON q.tenant_id = cc.tenant_id AND q.cuenta_cobrar_id = cc.id
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_cobrado_minor + descuento_minor ELSE -(valor_cobrado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_cobrar WHERE tenant_id = q.tenant_id AND cuota_id = q.id
             ) b ON TRUE
             WHERE cc.tenant_id = $1 AND cc.empresa_id = $2 AND cc.estado <> 'CANCELADO' AND q.estado <> 'CANCELADO'
               AND q.fecha_vencimiento BETWEEN $3 AND $4
               AND (q.valor_minor - COALESCE(b.aplicado_minor, 0)) > 0
             GROUP BY cc.moneda, q.fecha_vencimiento
           )
           SELECT fecha::TEXT, moneda,
                  COALESCE(SUM(valor_minor) FILTER (WHERE tipo = 'COBRAR'), 0)::TEXT AS cobrar_minor,
                  COALESCE(SUM(valor_minor) FILTER (WHERE tipo = 'PAGAR'), 0)::TEXT AS pagar_minor
           FROM eventos
           GROUP BY fecha, moneda
           ORDER BY fecha ASC, moneda ASC`,
          [auth.tenantId, input.empresaId, input.desde, input.hasta],
        );

        const projected = projectCashflow(initialRes.rows as CashflowInitialBalance[], eventsRes.rows as CashflowEventInput[]);
        const initialText = projected.saldosIniciales.length
          ? ' · Saldo inicial: ' + projected.saldosIniciales.map((s) => formatMoney(s.saldo_inicial_minor, s.moneda as Currency)).join(' | ')
          : '';

        return {
          title: 'Flujo de Caja',
          subtitle: `${company.rows[0].razon_social} · ${formatDate(input.desde!)} al ${formatDate(input.hasta!)}${initialText}`,
          headers: ['Fecha', 'Moneda', 'A cobrar', 'A pagar', 'Neto', 'Saldo acumulado'],
          rows: projected.rows.map((row) => [
            formatDate(row.fecha),
            row.moneda,
            formatMoney(row.cobrar_minor, row.moneda as Currency),
            formatMoney(row.pagar_minor, row.moneda as Currency),
            formatMoney(row.neto_minor, row.moneda as Currency),
            formatMoney(row.saldo_acumulado_minor, row.moneda as Currency),
          ]),
        };
      }
      if (input.tipo === 'RESULTADOS') {
        const company = await client.query('SELECT razon_social FROM empresas WHERE tenant_id=$1 AND id=$2 AND activa=TRUE', [auth.tenantId, input.empresaId]); if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');
        const data = await client.query(
          `SELECT cp.codigo,cp.descripcion,cp.naturaleza,origen.moneda,SUM(origen.valor_minor)::TEXT AS valor_minor,COUNT(*)::INT AS documentos
           FROM (
             SELECT cuenta_plan_id,moneda,valor_total_minor AS valor_minor
             FROM cuentas_pagar
             WHERE tenant_id=$1 AND empresa_id=$2 AND fecha_emision BETWEEN $3 AND $4 AND estado<>'CANCELADO' AND cuenta_plan_id IS NOT NULL
             UNION ALL
             SELECT cuenta_plan_id,moneda,valor_total_minor
             FROM cuentas_cobrar
             WHERE tenant_id=$1 AND empresa_id=$2 AND fecha_emision BETWEEN $3 AND $4 AND estado<>'CANCELADO' AND cuenta_plan_id IS NOT NULL
             UNION ALL
             SELECT m.cuenta_plan_id,m.moneda,
                    CASE
                      WHEN (cp_sub.naturaleza = 'D' AND m.tipo = 'D') OR (cp_sub.naturaleza = 'R' AND m.tipo = 'C') THEN m.valor_minor
                      ELSE -m.valor_minor
                    END AS valor_minor
             FROM movimientos_caja m
             JOIN cuentas_plan cp_sub ON cp_sub.tenant_id = m.tenant_id AND cp_sub.id = m.cuenta_plan_id
             WHERE m.tenant_id=$1 AND m.empresa_id=$2 AND m.fecha BETWEEN $3 AND $4
               AND m.origen='MA' AND m.cuenta_plan_id IS NOT NULL
           ) origen JOIN cuentas_plan cp ON cp.tenant_id=$1 AND cp.id=origen.cuenta_plan_id
           GROUP BY cp.codigo,cp.descripcion,cp.naturaleza,origen.moneda ORDER BY origen.moneda,cp.codigo`,
          [auth.tenantId, input.empresaId, input.desde, input.hasta],
        );
        return { title: 'Resultados gerenciales', subtitle: `${company.rows[0].razon_social} · ${formatDate(input.desde!)} al ${formatDate(input.hasta!)} · no sustituye contabilidade formal`, headers: ['Código', 'Cuenta', 'Tipo', 'Moneda', 'Importe', 'Documentos'], rows: data.rows.map((row) => [row.codigo, row.descripcion, row.naturaleza === 'R' ? 'Ingreso' : 'Egreso', row.moneda, formatMoney(row.valor_minor, row.moneda), String(row.documentos)]) };
      }
      const companies = await client.query('SELECT id,razon_social FROM empresas WHERE tenant_id=$1 AND activa=TRUE ORDER BY razon_social', [auth.tenantId]); const rows: string[][] = [];
      for (const company of companies.rows) { const dashboard = await companyDashboard(client, auth.tenantId, Number(company.id)); const add = (indicator: string, list: any[], value: (row: any) => string) => list.forEach((row) => rows.push([company.razon_social, indicator, row.moneda, formatMoney(value(row), row.moneda)])); add('Saldo en cajas', dashboard.saldosCaja, (row) => row.saldo_minor); add('Por pagar: vencido + 30 días', dashboard.cuentasPagar, (row) => (BigInt(row.vencidos_minor) + BigInt(row.proximos_30_minor)).toString()); add('Por cobrar: vencido + 30 días', dashboard.cuentasCobrar, (row) => (BigInt(row.vencidos_minor) + BigInt(row.proximos_30_minor)).toString()); add('Entradas del mes', dashboard.movimientosMes, (row) => row.entradas_minor); add('Salidas del mes', dashboard.movimientosMes, (row) => row.salidas_minor); add('Neto del mes', dashboard.movimientosMes, (row) => (BigInt(row.entradas_minor) - BigInt(row.salidas_minor)).toString()); }
      return { title: 'Consolidado del grupo', subtitle: `Emitido el ${new Date().toLocaleDateString('es-PY')} · las monedas no se suman entre sí`, headers: ['Empresa', 'Indicador', 'Moneda', 'Importe'], rows };
    }, auth.pool);
    const bytes = input.formato === 'xlsx' ? await createReportXlsx(report) : await createReportPdf(report); response.setHeader('Content-Type', input.formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'); response.setHeader('Content-Disposition', `attachment; filename="kuatia-${input.tipo.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${input.formato}"`); response.send(bytes);
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Parámetros de exportación inválidos.' : (error as Error).message }); }
});

export default router;
