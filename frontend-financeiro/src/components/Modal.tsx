import type { ReactNode } from 'react';
import { useI18n } from '../i18n/useI18n';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="ds-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ds-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="ds-modal__header">
          <h2 className="ds-modal__title">{title}</h2>
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--icon ds-modal__close" aria-label={t('Cerrar')} onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}
