import { useEffect } from 'react';
import { registerModalCloser } from '../utils/modalDismiss';

/** Register the topmost-dialog Escape handler for an existing shell. */
export function useModalDismiss(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof onClose !== 'function') return undefined;
    const node = ref?.current;
    if (!node) return undefined;
    return registerModalCloser(node, onClose);
  }, [ref, onClose, enabled]);
}
