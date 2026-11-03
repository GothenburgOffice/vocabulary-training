import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// The workspace's one modal dialog. It stays mounted and opens while there is content, so
// closing it returns focus to the button that opened it.
export default function Dialog({
  title,
  onClose,
  children,
}: {
  title: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Named by its heading, for screen readers.
  const titleId = useId();
  const open = title !== null;
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
