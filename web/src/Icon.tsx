// Material Symbols icon. `name` is the ligature (e.g. "payments", "history").
export default function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}
