import { ChangeEvent, useEffect, useState } from 'react';
import { formatDate, formatMinor } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError, apiGet, apiPost } from '../lib/api';
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

export function ImportacionesScreen({ token, empresaId }: { token: string; empresaId: number }) {
  const { t } = useI18n();
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

  return <>
    <header className="ds-page-header"><div className="ds-page-header__text"><h1 className="ds-title">{t('Importaciones')}</h1><p className="ds-secondary">{t('Convertí documentos externos en registros financieros trazables.')}</p></div></header>
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
    <section className="ds-card"><div className="ds-card__header"><div><h2 className="ds-card__title">{t('Extractos bancarios')}</h2><p className="ds-card__subtitle">{t('Base preparada para CSV y OFX; falta registrar un archivo real del banco para mapear cada columna y evitar interpretaciones incorrectas.')}</p></div></div><div className="ds-card__body"><div className="ds-alert ds-alert--info"><div className="ds-alert__body"><p>{t('Cuando tengamos el primer extracto de cada banco, habilitamos su perfil de lectura, la conciliación asistida y la importación segura al Libro de Caja.')}</p></div></div></div></section>
  </>;
}
