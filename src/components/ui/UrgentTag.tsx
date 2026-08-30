import { AlertTriangle } from "lucide-react";

/** Red "Urgent" pill shown on tasks a technician has flagged for manager attention. */
export function UrgentTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5 ${className}`}>
      <AlertTriangle className="w-3 h-3" /> Urgent
    </span>
  );
}
