import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../shared/i18n';

interface ModalProps {
  /** Already translated. */
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned under the scrolling body. */
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Popup on the native `<dialog>` (focus trap, Esc, page behind made inert).
 * Closes on Esc, ✕ or a click on the dimmed backdrop.
 */
export default function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', cancel);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      // A click on the dialog element itself (not its content) is the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('Đóng')} title={t('Đóng')}>✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
