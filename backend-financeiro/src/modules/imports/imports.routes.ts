import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { parseSifenPurchaseXml } from '../../domain/sifen-import.js';
import {
  addMonths,
  generateTemplateCsv,
  generateTemplateXlsx,
  parsePlanilla,
  parseXlsxBuffer,
} from '../../domain/spreadsheet-import.js';
import type { ContrapartePlanilla, CuentaPlanilla, TipoPlanilla } from '../../domain/spreadsheet-import.js';
import { splitMinorAmount } from '../../domain/installments.js';
import { assertAllBusinessDates, asMinorUnit } from '../../domain/validation.js';
import { authenticate } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';

const router = Router();
const xml = z.string().min(50).max(2_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const previewSchema = z.object({ empresaId: z.number().int().positive(), xml });
const confirmSchema = previewSchema.extend({
  fechaVencimiento: date,
  cuentaPlanId: z.number().int().positive().optional(),
  centroCostoId: z.number().int().positive().optional(),
  descripcion: z.string().trim().min(1).max(200).optional(),
});

router.post('/xml-compra/preview', authenticate, (request, response) => {
  try {
    const input = previewSchema.parse(request.body);
    response.json({ data: parseSifenPurchaseXml(input.xml) });
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Archivo XML o empresa inválidos.' : (error as Error).message });
  }
});

router.post('/xml-compra/confirmar', authenticate, async (request, response) => {
  try {
    const input = confirmSchema.parse(request.body);
    const parsed = parseSifenPurchaseXml(input.xml);
    if (!parsed.signed) throw new Error('El XML no contiene firma digital de SIFEN y no puede convertirse en una compra.');
    assertAllBusinessDates(parsed.fechaEmision, input.fechaVencimiento);
    const auth = request.auth!;
    const result = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const company = await client.query('SELECT id FROM empresas WHERE tenant_id=$1 AND id=$2 AND activa=TRUE', [auth.tenantId, input.empresaId]);
      if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');
      const duplicate = await client.query("SELECT cuenta_pagar_id FROM documentos_importados WHERE tenant_id=$1 AND empresa_id=$2 AND tipo='XML_COMPRA' AND (identificador_origen=$3 OR hash_archivo=$4)", [auth.tenantId, input.empresaId, parsed.documentId, parsed.sourceHash]);
      if (duplicate.rowCount) throw new Error(`Este XML ya fue importado${duplicate.rows[0].cuenta_pagar_id ? ` en la cuenta ${duplicate.rows[0].cuenta_pagar_id}` : ''}.`);

      let counterpartId: number | null = null;
      if (parsed.issuer.ruc) {
        const existing = await client.query('SELECT id FROM contrapartes WHERE tenant_id=$1 AND ruc=$2 AND activo=TRUE ORDER BY id LIMIT 1', [auth.tenantId, parsed.issuer.ruc]);
        counterpartId = existing.rowCount ? Number(existing.rows[0].id) : null;
      }
      if (!counterpartId) {
        const created = await client.query(
          'INSERT INTO contrapartes (tenant_id,tipo_persona,ruc,razon_social,observaciones) VALUES ($1,\'J\',$2,$3,$4) RETURNING id',
          [auth.tenantId, parsed.issuer.ruc, parsed.issuer.razonSocial, `Creado por importación XML SIFEN: ${parsed.documentId}`],
        );
        counterpartId = Number(created.rows[0].id);
      }
      const description = input.descripcion ?? `Compra ${parsed.invoiceNumber ?? parsed.documentId} · ${parsed.issuer.razonSocial}`;
      const account = await client.query(
        `INSERT INTO cuentas_pagar (tenant_id,empresa_id,descripcion,contraparte_id,numero_documento,moneda,valor_total_minor,fecha_emision,fecha_vencimiento,cuenta_plan_id,centro_costo_id,iva_tipo,iva_valor_minor,observaciones,creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [auth.tenantId, input.empresaId, description, counterpartId, parsed.invoiceNumber ?? parsed.documentId, parsed.moneda, asMinorUnit(BigInt(parsed.totalMinor)), parsed.fechaEmision, input.fechaVencimiento, input.cuentaPlanId ?? null, input.centroCostoId ?? null, parsed.ivaTipo, asMinorUnit(BigInt(parsed.ivaMinor)), `Importado desde XML SIFEN ${parsed.documentId}`, auth.financeUserId],
      );
      const cuentaId = account.rows[0].id;
      await client.query('INSERT INTO cuotas_pagar (tenant_id,empresa_id,cuenta_pagar_id,numero_cuota,valor_minor,fecha_vencimiento) VALUES ($1,$2,$3,1,$4,$5)', [auth.tenantId, input.empresaId, cuentaId, asMinorUnit(BigInt(parsed.totalMinor)), input.fechaVencimiento]);
      await client.query(
        'INSERT INTO documentos_importados (tenant_id,empresa_id,tipo,identificador_origen,hash_archivo,cuenta_pagar_id,archivo_xml,datos_extra,creado_por) VALUES ($1,$2,\'XML_COMPRA\',$3,$4,$5,$6,$7,$8)',
        [auth.tenantId, input.empresaId, parsed.documentId, parsed.sourceHash, cuentaId, input.xml, JSON.stringify(parsed), auth.financeUserId],
      );
      return { cuentaId, contraparteId: counterpartId, documentoId: parsed.documentId };
    }, auth.pool);
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de importación inválidos.' : (error as Error).message });
  }
});

router.get('/extractos-bancarios/capacidades', authenticate, (_request, response) => {
  response.json({ data: { enabled: false, acceptedFormats: ['CSV', 'OFX'], message: 'La lectura de extractos está preparada; se habilitará el perfil de cada banco cuando se disponga de un archivo real.' } });
});

/* --- Planilla (carga inicial) -------------------------------------------------
   Preview no escribe nada; confirmar re-parsea el mismo CSV dentro de una
   transacción e inserta SOLO las filas válidas, informando las saltadas.
   El hash del archivo queda registrado para rechazar una doble importación. */

const planillaSchema = z.object({
  empresaId: z.number().int().positive(),
  tipo: z.enum(['CONTRAPARTES', 'CUENTAS_PAGAR', 'CUENTAS_COBRAR']),
  csv: z.string().min(10).max(5_000_000).optional(),
  archivoBase64: z.string().min(10).max(10_000_000).optional(),
}).refine((data) => data.csv || data.archivoBase64, {
  message: 'Debe proporcionar csv o archivoBase64.',
});

async function resolveCsvContent(input: { csv?: string; archivoBase64?: string }): Promise<string> {
  if (input.csv) return input.csv;
  if (input.archivoBase64) {
    const buffer = Buffer.from(input.archivoBase64, 'base64');
    return await parseXlsxBuffer(buffer);
  }
  throw new Error('No se proporcionó archivo CSV ni Excel.');
}

const plantillaQuerySchema = z.object({
  tipo: z.enum(['CONTRAPARTES', 'CUENTAS_PAGAR', 'CUENTAS_COBRAR']),
  formato: z.enum(['csv', 'xlsx']).default('xlsx'),
});

router.get('/planilla/plantilla', authenticate, async (request, response) => {
  try {
    const query = plantillaQuerySchema.parse(request.query);
    const filename = `plantilla_${query.tipo.toLowerCase()}.${query.formato}`;

    if (query.formato === 'csv') {
      const csv = generateTemplateCsv(query.tipo);
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      response.send(csv);
    } else {
      const buffer = await generateTemplateXlsx(query.tipo);
      response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      response.send(buffer);
    }
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Parámetros de plantilla inválidos.' : (error as Error).message });
  }
});

router.post('/planilla/preview', authenticate, async (request, response) => {
  try {
    const input = planillaSchema.parse(request.body);
    const csv = await resolveCsvContent(input);
    const parsed = parsePlanilla(input.tipo, csv);
    response.json({
      data: {
        ...parsed,
        csv,
        filas: parsed.filas.map((fila) => ({
          ...fila,
          datos: fila.datos && 'valorTotalMinor' in fila.datos
            ? { ...fila.datos, valorTotalMinor: fila.datos.valorTotalMinor.toString() }
            : fila.datos,
        })),
      },
    });
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Solicitud de importación inválida.' : (error as Error).message });
  }
});

router.post('/planilla/confirmar', authenticate, async (request, response) => {
  try {
    const input = planillaSchema.parse(request.body);
    const auth = request.auth!;
    const csv = await resolveCsvContent(input);
    const hash = createHash('sha256').update(csv).digest('hex');
    const parsed = parsePlanilla(input.tipo, csv);
    const validas = parsed.filas.filter((fila) => fila.datos !== null);
    const saltadas = parsed.filas.filter((fila) => fila.datos === null).map((fila) => ({ linea: fila.linea, errores: fila.errores }));

    const result = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const company = await client.query('SELECT id FROM empresas WHERE tenant_id=$1 AND id=$2 AND activa=TRUE', [auth.tenantId, input.empresaId]);
      if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');
      const duplicate = await client.query("SELECT id FROM documentos_importados WHERE tenant_id=$1 AND empresa_id=$2 AND tipo='PLANILLA' AND hash_archivo=$3", [auth.tenantId, input.empresaId, hash]);
      if (duplicate.rowCount) throw new Error('Esta planilla ya fue importada. Si necesitás repetirla, cambiá al menos una línea.');

      let importadas = 0;
      let existentes = 0;

      if (input.tipo === 'CONTRAPARTES') {
        for (const fila of validas) {
          const datos = fila.datos as ContrapartePlanilla;
          if (datos.ruc) {
            const existing = await client.query('SELECT id FROM contrapartes WHERE tenant_id=$1 AND ruc=$2 AND activo=TRUE', [auth.tenantId, datos.ruc]);
            if (existing.rowCount) { existentes += 1; continue; }
          }
          await client.query(
            'INSERT INTO contrapartes (tenant_id,tipo_persona,ruc,razon_social,nombre_fantasia,ciudad,telefono,celular,email,observaciones) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [auth.tenantId, datos.tipoPersona, datos.ruc ?? null, datos.razonSocial, datos.nombreFantasia ?? null, datos.ciudad ?? null, datos.telefono ?? null, datos.celular ?? null, datos.email ?? null, 'Cargado por importación de planilla'],
          );
          importadas += 1;
        }
      } else {
        const tabla = input.tipo === 'CUENTAS_PAGAR' ? 'pagar' : 'cobrar';
        for (const fila of validas) {
          const datos = fila.datos as CuentaPlanilla;
          assertAllBusinessDates(datos.fechaEmision, datos.fechaVencimiento);

          // Contraparte: por RUC, por razón social exacta, o se crea mínima.
          let contraparteId: number | null = null;
          if (datos.contraparte) {
            const byRuc = await client.query('SELECT id FROM contrapartes WHERE tenant_id=$1 AND ruc=$2 AND activo=TRUE ORDER BY id LIMIT 1', [auth.tenantId, datos.contraparte]);
            if (byRuc.rowCount) contraparteId = Number(byRuc.rows[0].id);
            else {
              const byName = await client.query('SELECT id FROM contrapartes WHERE tenant_id=$1 AND LOWER(razon_social)=LOWER($2) AND activo=TRUE ORDER BY id LIMIT 1', [auth.tenantId, datos.contraparte]);
              if (byName.rowCount) contraparteId = Number(byName.rows[0].id);
              else {
                const created = await client.query(
                  'INSERT INTO contrapartes (tenant_id,tipo_persona,razon_social,observaciones) VALUES ($1,\'J\',$2,$3) RETURNING id',
                  [auth.tenantId, datos.contraparte, 'Creado por importación de planilla'],
                );
                contraparteId = Number(created.rows[0].id);
              }
            }
          }

          const valores = splitMinorAmount(datos.valorTotalMinor, datos.cuotas);
          const insertCuenta = tabla === 'pagar'
            ? `INSERT INTO cuentas_pagar (tenant_id,empresa_id,descripcion,contraparte_id,numero_documento,moneda,valor_total_minor,fecha_emision,fecha_vencimiento,iva_valor_minor,observaciones,creado_por)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'0',$10,$11) RETURNING id`
            : `INSERT INTO cuentas_cobrar (tenant_id,empresa_id,descripcion,contraparte_id,numero_documento,moneda,valor_total_minor,fecha_emision,fecha_vencimiento,iva_valor_minor,observaciones,creado_por)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'0',$10,$11) RETURNING id`;
          const cuenta = await client.query(insertCuenta, [
            auth.tenantId, input.empresaId, datos.descripcion, contraparteId, datos.numeroDocumento ?? null, datos.moneda,
            asMinorUnit(datos.valorTotalMinor), datos.fechaEmision, datos.fechaVencimiento, 'Importado desde planilla', auth.financeUserId,
          ]);
          const cuentaId = cuenta.rows[0].id;
          const tablaCuotas = tabla === 'pagar' ? 'cuotas_pagar' : 'cuotas_cobrar';
          const columnaCuenta = tabla === 'pagar' ? 'cuenta_pagar_id' : 'cuenta_cobrar_id';
          for (let index = 0; index < valores.length; index += 1) {
            await client.query(
              `INSERT INTO ${tablaCuotas} (tenant_id,empresa_id,${columnaCuenta},numero_cuota,valor_minor,fecha_vencimiento) VALUES ($1,$2,$3,$4,$5,$6)`,
              [auth.tenantId, input.empresaId, cuentaId, index + 1, asMinorUnit(valores[index]), addMonths(datos.fechaVencimiento, index)],
            );
          }
          await recordAudit(client, {
            tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'CREAR',
            entity: tabla === 'pagar' ? 'CUENTA_PAGAR' : 'CUENTA_COBRAR', entityId: cuentaId, empresaId: input.empresaId,
            detail: { descripcion: datos.descripcion, moneda: datos.moneda, cuotas: datos.cuotas, origen: 'PLANILLA' },
          });
          importadas += 1;
        }
      }

      await client.query(
        "INSERT INTO documentos_importados (tenant_id,empresa_id,tipo,identificador_origen,hash_archivo,datos_extra,creado_por) VALUES ($1,$2,'PLANILLA',$3,$4,$5,$6)",
        [auth.tenantId, input.empresaId, `${input.tipo}:${hash.slice(0, 16)}`, hash, JSON.stringify({ tipoPlanilla: input.tipo, lineas: parsed.filas.length, importadas, saltadas: saltadas.length }), auth.financeUserId],
      );
      await recordAudit(client, {
        tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'CREAR', entity: 'IMPORTACION_PLANILLA', entityId: hash.slice(0, 12), empresaId: input.empresaId,
        detail: { tipo: input.tipo, importadas, existentes, saltadas: saltadas.length },
      });
      return { importadas, existentes, saltadas };
    }, auth.pool);
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Solicitud de importación inválida.' : (error as Error).message });
  }
});

export default router;
