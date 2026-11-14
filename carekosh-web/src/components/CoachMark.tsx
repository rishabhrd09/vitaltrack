/** A shared, scalable mark for CareKosh. Labels live on its containing control. */
export function CoachMark({ className = "" }: { className?: string }) {
  return (
    <span className={`coach-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" focusable="false">
        <path
          d="M23 11v10a5 5 0 0 1-5 5H8l-5 3V11a5 5 0 0 1 5-5h9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 12v8m-4-4h8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="m25 2 1.5 4.5L31 8l-4.5 1.5L25 14l-1.5-4.5L19 8l4.5-1.5L25 2Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
