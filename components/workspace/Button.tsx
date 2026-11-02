export default function Button({
  children,
  onClick,
  primary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button className={primary ? "button primary" : "button"} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
