export default function Button({
  children,
  onClick,
  primary = false,
  danger = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean }) {
  return (
    <button
      className={danger ? "button danger" : primary ? "button primary" : "button"}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
