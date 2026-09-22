import { ChangeEvent, useEffect, useState } from 'react';
import { formatDate, formatMinor } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError, apiDownload, apiGet, apiPost } from '../lib/api';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

interface XmlPreview {
  sourceHash: string;
  documentId: string;
  invoiceNumber: string | null;
  issuer: { ruc: string | null; razonSocial: string };
  fechaEmision: string;
  moneda: CurrencyCode;
  totalMinor: string;
  ivaMinor: string;
  ivaTipo: '10' | '5' | 'EXENTA' | null;
  items: Array<{ descripcion: string; cantidad: string | null; totalMinor: string | null }>;
  signed: boolean;
  warnings: string[];
}

type TipoPlanilla = 'CONTRAPARTES' | 'CUENTAS_PAGAR' | 'CUENTAS_COBRAR';

interface FilaPreview {
  linea: number;
  datos: Record<string, unknown> | null;
  errores: string[];
}

interface PlanillaPreviewData {
  validas: number;
  conError: number;
  csv: string;
  filas: FilaPreview[];
}

export function ImportacionesScreen({ token, empresaId }: { token: string; empresaId: number }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'planilla' | 'xml' | 'extractos'>('planilla');

  // --- XML ---
  const [preview, setPreview] = useState<XmlPreview | null>(null);
  const [xml, setXml] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [planId, setPlanId] = useState('');
  const [centerId, setCenterId] = useState('');
  const [plans, setPlans] = useState<Array<{ id: number; codigo: string; descripcion: string; naturaleza: 'R' | 'D' }>>([]);
  const [centers, setCenters] = useState<Array<{ id: number; codigo: string | null; descripcion: string }>>([]);
  const [status, setStatus] = useState<'idle' | 'reading' | 'ready' | 'saving'>('idle');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --- Planilla ---
  const [tipoPlanilla, setTipoPlanilla] = useState<TipoPlanilla>('CONTRAPARTES');
  const [planillaStatus, setPlanillaStatus] = useState<'idle' | 'reading' | 'ready' | 'saving'>('idle');
  const [planillaPreview, setPlanillaPreview] = useState<PlanillaPreviewData | null>(null);
  const [planillaError, setPlanillaError] = useState('');
  const [planillaSuccess, setPlanillaSuccess] = useState('');

  useEffect(() => {
    void Promise.all([
      apiGet<{ data: Array<{ id: number; codigo: string; descripcion: string; naturaleza: 'R' | 'D' }> }>(`/plan-cuentas?empresaId=${empresaId}`, token),
      apiGet<{ data: Array<{ id: number; codigo: string | null; descripcion: string }> }>(`/centros-costo?empresaId=${empresaId}`, token),
    ]).then(([plan, center]) => { setPlans(plan.data.filter((item) => item.naturaleza === 'D')); setCenters(center.data); }).catch(() => undefined);
  }, [empresaId, token]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess(''); setPreview(null); setStatus('reading');
    try {
      const contents = await file.text();
      const response = await apiPost<{ data: XmlPreview }>('/importaciones/xml-compra/preview', { empresaId, xml: contents }, token);
      setXml(contents); setPreview(response.data); setDueDate(response.data.fechaEmision); setStatus('ready');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo leer el archivo XML.')); setStatus('idle');
    }
  }

  async function confirm() {
    if (!preview || !xml || !dueDate) return;
    setError(''); setSuccess(''); setStatus('saving');
    try {
      const response = await apiPost<{ cuentaId: string | number }>(
        '/importaciones/xml-compra/confirmar',
        { empresaId, xml, fechaVencimiento: dueDate, cuentaPlanId: planId ? Number(planId) : undefined, centroCostoId: centerId ? Number(centerId) : undefined },
        token,
      );
      setSuccess(tMsg('Compra importada en la cuenta por pagar #{id}.', { id: response.cuentaId }));
      setPreview(null); setXml(''); setPlanId(''); setCenterId(''); setStatus('idle');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo importar la compra.')); setStatus('ready');
    }
  }

  async function downloadTemplate(formato: 'xlsx' | 'csv') {
    try {
      await apiDownload(
        `/importaciones/planilla/plantilla?tipo=${tipoPlanilla}&formato=${formato}`,
        `plantilla_${tipoPlanilla.toLowerCase()}.${formato}`,
        token,
      );
    } catch (failure) {
      setPlanillaError(failure instanceof ApiError ? failure.message : tMsg('No se pudo preparar el archivo.'));
    }
  }

  async function choosePlanillaFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPlanillaError('');
    setPlanillaSuccess('');
    setPlanillaPreview(null);
    setPlanillaStatus('reading');
    try {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      let body: { empresaId: number; tipo: TipoPlanilla; csv?: string; archivoBase64?: string };

      if (isXlsx) {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        const archivoBase64 = window.btoa(binary);
        body = { empresaId, tipo: tipoPlanilla, archivoBase64 };
      } else {
        const contents = await file.text();
        body = { empresaId, tipo: tipoPlanilla, csv: contents };
      }

      const response = await apiPost<{ data: PlanillaPreviewData }>(
        '/importaciones/planilla/preview',
        body,
        token,
      );
      setPlanillaPreview(response.data);
      setPlanillaStatus('ready');
    } catch (failure) {
      setPlanillaError(failure instanceof ApiError ? failure.message : tMsg('No se pudo leer la planilla.'));
      setPlanillaStatus('idle');
    }
  }

  async function confirmPlanilla() {
    if (!planillaPreview || !planillaPreview.csv) return;
    setPlanillaError('');
    setPlanillaSuccess('');
    setPlanillaStatus('saving');
    try {
      const response = await apiPost<{ importadas: number; existentes: number; saltadas: Array<{ linea: number; errores: string[] }> }>(
        '/importaciones/planilla/confirmar',
        { empresaId, tipo: tipoPlanilla, csv: planillaPreview.csv },
        token,
      );
      setPlanillaSuccess(tMsg('Planilla importada con éxito: {n} registros creados.', { n: String(response.importadas) }));
      setPlanillaPreview(null);
      setPlanillaStatus('idle');
    } catch (failure) {
      setPlanillaError(failure instanceof ApiError ? failure.message : tMsg('No se pudo importar la planilla.'));
      setPlanillaStatus('ready');
    }
  }

  function renderFilaDetalle(tipo: TipoPlanilla, datos: Record<string, unknown> | null) {
    if (!datos) return '—';
    if (tipo === 'CONTRAPARTES') {
      const razon = String(datos.razonSocial ?? '');
      const ruc = datos.ruc ? ` · RUC ${String(datos.ruc)}` : '';
      const email = datos.email ? ` · ${String(datos.email)}` : '';
      return `${razon}${ruc}${email}`;
    }
    const desc = String(datos.descripcion ?? '');
    const moneda = String(datos.moneda ?? '');
    const total = datos.valorTotalMinor ? formatMinor(String(datos.valorTotalMinor), moneda as CurrencyCode) : '';
    const venc = datos.fechaVencimiento ? ` · ${formatDate(String(datos.fechaVencimiento))}` : '';
    const cuotas = datos.cuotas ? ` · ${String(datos.cuotas)} cuotas` : '';
    return `${desc} · ${total}${venc}${cuotas}`;
  }

  return <>
    <header className="ds-page-header">
      <div className="ds-page-header__text">
        <h1 className="ds-title">{t('Importaciones')}</h1>
        <p className="ds-secondary">{t('Convertí documentos externos en registros financieros trazables.')}</p>
      </div>
    </header>

    <div className="ds-page-header__actions" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        className={`ds-btn ${tab === 'planilla' ? 'ds-btn--primary' : 'ds-btn--secondary'}`}
        onClick={() => setTab('planilla')}
      >
        {t('Carga inicial por planilla')}
      </button>
      <button
        type="button"
        className={`ds-btn ${tab === 'xml' ? 'ds-btn--primary' : 'ds-btn--secondary'}`}
        onClick={() => setTab('xml')}
      >
        {t('Compra desde XML electrónico')}
      </button>
      <button
        type="button"
        className={`ds-btn ${tab === 'extractos' ? 'ds-btn--primary' : 'ds-btn--secondary'}`}
        onClick={() => setTab('extractos')}
      >
        {t('Extractos bancarios')}
      </button>
    </div>

    {tab === 'planilla' && <>
      {planillaError && <div className="ds-alert ds-alert--danger" role="alert"><div className="ds-alert__body"><p>{planillaError}</p></div></div>}
      {planillaSuccess && <div className="ds-alert ds-alert--success" role="status"><div className="ds-alert__body"><p>{planillaSuccess}</p></div></div>}
      <section className="ds-card">
        <div className="ds-card__header">
          <div>
            <h2 className="ds-card__title">{t('Carga inicial por planilla (CSV / Excel)')}</h2>
            <p className="ds-card__subtitle">{t('Cargá en lote clientes, proveedores o saldos iniciales de cuentas a pagar y cobrar.')}</p>
          </div>
        </div>
        <div className="ds-card__body ds-stack-3">
          <div className="ds-form-grid">
            <div className="ds-field ds-col-6">
              <label className="ds-label" htmlFor="tipo-planilla">{t('Tipo de planilla')}</label>
              <select
                id="tipo-planilla"
                className="ds-select"
                value={tipoPlanilla}
                onChange={(e) => {
                  setTipoPlanilla(e.target.value as TipoPlanilla);
                  setPlanillaPreview(null);
                  setPlanillaError('');
                  setPlanillaSuccess('');
                }}
              >
                <option value="CONTRAPARTES">{t('Clientes y proveedores')}</option>
                <option value="CUENTAS_PAGAR">{t('Cuentas por pagar (saldos iniciales)')}</option>
                <option value="CUENTAS_COBRAR">{t('Cuentas por cobrar (saldos iniciales)')}</option>
              </select>
            </div>
            <div className="ds-field ds-col-6" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <span className="ds-help" style={{ marginBottom: '0.35rem' }}>
                {t('Descargá una planilla modelo con las columnas requeridas:')}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="ds-btn ds-btn--sm ds-btn--secondary"
                  onClick={() => void downloadTemplate('xlsx')}
                >
                  {t('Modelo Excel (.xlsx)')}
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--sm ds-btn--secondary"
                  onClick={() => void downloadTemplate('csv')}
                >
                  {t('Modelo CSV (.csv)')}
                </button>
              </div>
            </div>
          </div>

          <div className="ds-field">
            <label className="ds-label" htmlFor="archivo-planilla">{t('Archivo de planilla (.xlsx, .csv)')}</label>
            <input
              id="archivo-planilla"
              className="ds-input"
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void choosePlanillaFile(event)}
              disabled={planillaStatus === 'reading' || planillaStatus === 'saving'}
            />
            {planillaStatus === 'reading' && (
              <p className="ds-field__hint">{t('Leyendo y validando filas de la planilla…')}</p>
            )}
          </div>

          {planillaPreview && (
            <div className="ds-stack-2">
              <div className="ds-alert ds-alert--info">
                <div className="ds-alert__body">
                  <p className="ds-alert__title">{t('Planilla analizada')}</p>
                  <p>
                    {t('Total:')} {planillaPreview.filas.length} ·{' '}
                    <span className="ds-badge ds-badge--pagado">{planillaPreview.validas} {t('Válidas')}</span>{' '}
                    {planillaPreview.conError > 0 && (
                      <span className="ds-badge ds-badge--vencido">{planillaPreview.conError} {t('Con error')}</span>
                    )}
                  </p>
                  {planillaPreview.conError > 0 && (
                    <p style={{ marginTop: '0.5rem' }}>
                      {t('Las filas con error no serán importadas. Podés corregir la planilla o confirmar solo las válidas.')}
                    </p>
                  )}
                </div>
              </div>

              <div className="ds-table-wrap">
                <table className="ds-table ds-table--cards">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>{t('Línea')}</th>
                      <th style={{ width: '120px' }}>{t('Estado')}</th>
                      <th>{t('Detalle')}</th>
                      <th>{t('Errores / Motivo')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planillaPreview.filas.map((fila) => (
                      <tr key={fila.linea}>
                        <td data-label={t('Línea')}>#{fila.linea}</td>
                        <td data-label={t('Estado')}>
                          <span className={`ds-badge ds-badge--${fila.errores.length ? 'vencido' : 'pagado'}`}>
                            {fila.errores.length ? t('Error') : t('Válida')}
                          </span>
                        </td>
                        <td data-label={t('Detalle')}>
                          {renderFilaDetalle(tipoPlanilla, fila.datos)}
                        </td>
                        <td data-label={t('Errores / Motivo')}>
                          {fila.errores.length ? (
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--negative-strong)' }}>
                              {fila.errores.map((err, idx) => <li key={idx}>{err}</li>)}
                            </ul>
                          ) : (
                            <span className="ds-help">{t('Sin errores')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="ds-card__footer">
                <button
                  type="button"
                  className="ds-btn ds-btn--primary"
                  onClick={() => void confirmPlanilla()}
                  disabled={planillaStatus === 'saving' || planillaPreview.validas === 0}
                >
                  {planillaStatus === 'saving'
                    ? t('Importando…')
                    : t('Confirmar importación ({n} válidas)', { n: String(planillaPreview.validas) })}
                </button>
              </footer>
            </div>
          )}
        </div>
      </section>
    </>}

    {tab === 'xml' && <>
      {error && <div className="ds-alert ds-alert--danger" role="alert"><div className="ds-alert__body"><p>{error}</p></div></div>}
      {success && <div className="ds-alert ds-alert--success" role="status"><div className="ds-alert__body"><p>{success}</p></div></div>}
      <section className="ds-card"><div className="ds-card__header"><div><h2 className="ds-card__title">{t('Compra desde XML electrónico')}</h2><p className="ds-card__subtitle">{t('Leé el XML del Documento Electrónico (DE) recibido del proveedor.')}</p></div></div><div className="ds-card__body ds-stack-3">
        <div className="ds-field"><label className="ds-label" htmlFor="xml-compra">{t('Archivo XML de compra')}</label><input id="xml-compra" className="ds-input" type="file" accept=".xml,application/xml,text/xml" onChange={(event) => void chooseFile(event)} disabled={status === 'reading' || status === 'saving'} />{status === 'reading' && <p className="ds-field__hint">{t('Leyendo y validando la estructura del documento…')}</p>}</div>
        {preview && <>
          <div className="ds-alert ds-alert--info"><div className="ds-alert__body"><p className="ds-alert__title">{t('Documento detectado')}</p><p><strong>{preview.issuer.razonSocial}</strong>{preview.issuer.ruc ? ` · RUC ${preview.issuer.ruc}` : ''}<br />{t('Factura:')} {preview.invoiceNumber ?? t('No informado')} · {t('Emisión:')} {formatDate(preview.fechaEmision)}<br />{t('Total:')} {formatMinor(preview.totalMinor, preview.moneda)} · IVA: {formatMinor(preview.ivaMinor, preview.moneda)}{preview.ivaTipo ? ` (${preview.ivaTipo})` : ''}</p></div></div>
          {preview.warnings.map((warning) => <div key={warning} className="ds-alert ds-alert--warning"><div className="ds-alert__body"><p>{warning}</p></div></div>)}
          {preview.signed && <p className="ds-field__hint">{t('Se detectó la firma digital del DE. La vigencia tributaria debe verificarse en SIFEN cuando se habilite esa consulta.')}</p>}
          <div className="ds-form-grid"><div className="ds-field ds-col-6"><label className="ds-label">{t('Vencimiento')}</label><input className="ds-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></div><div className="ds-field ds-col-6"><label className="ds-label">{t('Cuenta de gasto')} <span className="ds-label__optional">{t('(opcional)')}</span></label><select className="ds-select" value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">{t('Sin clasificar')}</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.descripcion}</option>)}</select></div><div className="ds-field ds-col-6"><label className="ds-label">{t('Centro de costo')} <span className="ds-label__optional">{t('(opcional)')}</span></label><select className="ds-select" value={centerId} onChange={(event) => setCenterId(event.target.value)}><option value="">{t('Sin centro')}</option>{centers.map((item) => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} · ` : ''}{item.descripcion}</option>)}</select></div></div>
          <div className="ds-table-wrap"><table className="ds-table ds-table--cards"><thead><tr><th>{t('Ítem')}</th><th className="is-num">{t('Cantidad')}</th><th className="is-num">{t('Total')}</th></tr></thead><tbody>{preview.items.map((item, index) => <tr key={`${item.descripcion}-${index}`}><td data-label={t('Ítem')}>{item.descripcion}</td><td className="is-num" data-label={t('Cantidad')}>{item.cantidad ?? '—'}</td><td className="is-num" data-label={t('Total')}>{item.totalMinor ? formatMinor(item.totalMinor, preview.moneda) : '—'}</td></tr>)}</tbody></table></div>
          <footer className="ds-card__footer"><button type="button" className="ds-btn ds-btn--primary" onClick={() => void confirm()} disabled={status === 'saving'}>{status === 'saving' ? t('Importando…') : t('Confirmar compra')}</button></footer>
        </>}
      </div></section>
    </>}

    {tab === 'extractos' && (
      <section className="ds-card"><div className="ds-card__header"><div><h2 className="ds-card__title">{t('Extractos bancarios')}</h2><p className="ds-card__subtitle">{t('Base preparada para CSV y OFX; falta registrar un archivo real del banco para mapear cada columna y evitar interpretaciones incorrectas.')}</p></div></div><div className="ds-card__body"><div className="ds-alert ds-alert--info"><div className="ds-alert__body"><p>{t('Cuando tengamos el primer extracto de cada banco, habilitamos su perfil de lectura, la conciliación asistida y la importación segura al Libro de Caja.')}</p></div></div></div></section>
    )}
  </>;
}
