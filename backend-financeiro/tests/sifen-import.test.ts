import { describe, expect, it } from 'vitest';
import { parseSifenPurchaseXml } from '../src/domain/sifen-import.js';

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd"><DE Id="01800123456789012345678901234567890123456789">
  <gDatGralOpe><dFeEmi>2026-08-10T09:30:00</dFeEmi><gEmis><dRucEm>80012345</dRucEm><dDVEmi>2</dDVEmi><dNomEmi>Proveedor S.A.</dNomEmi></gEmis></gDatGralOpe>
  <gDtipDE><dEst>1</dEst><dPunExp>2</dPunExp><dNumDoc>34</dNumDoc><gCamItem><dDesProSer>Insumo importado</dDesProSer><dCantProSer>2</dCantProSer><dTotOpeItem>1000000</dTotOpeItem></gCamItem></gDtipDE>
  <gTotSub><cMoneOpe>PYG</cMoneOpe><dTotGralOpe>1000000</dTotGralOpe><dTotIVA>90909</dTotIVA><cTasaIVA>10</cTasaIVA></gTotSub>
</DE><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo /></Signature></rDE>`;

describe('importación XML SIFEN', () => {
  it('extrae el resumen financiero sin convertir PYG a decimales', () => {
    const parsed = parseSifenPurchaseXml(sample);
    expect(parsed.documentId).toBe('01800123456789012345678901234567890123456789');
    expect(parsed.issuer).toEqual({ ruc: '80012345-2', razonSocial: 'Proveedor S.A.' });
    expect(parsed.invoiceNumber).toBe('001-002-0000034');
    expect(parsed.moneda).toBe('PYG');
    expect(parsed.totalMinor).toBe('1000000');
    expect(parsed.ivaMinor).toBe('90909');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.signed).toBe(true);
  });
});
