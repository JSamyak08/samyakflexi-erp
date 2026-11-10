import React, { useRef } from 'react';
import { useModalDismiss } from './useModalDismiss';

/**
 * Shared dialog shell. Backdrop clicks are ignored. Escape closes this
 * dialog through onClose when it is the topmost one.
 */
export default function ModalOverlay({
  onClose,
  closeOnEscape = true,
  className = 'modal-overlay',
  children,
  ...rest
}) {
  const ref = useRef(null);
  const domProps = { ...rest };
  delete domProps.onClick;
  useModalDismiss(ref, onClose, closeOnEscape);

  return (
    <div
      ref={ref}
      className={className}
      data-modal-root=""
      data-modal-backdrop=""
      {...domProps}
    >
      {children}
    </div>
  );
}
