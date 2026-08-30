import type { ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ResponsiveListShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("space-y-3", className)}>{children}</div>;
}

export function DesktopTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function MobileCardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("md:hidden space-y-3", className)}>{children}</div>;
}

export function RecordCard({ children, className, onClick }: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const classes = cx(
    "bg-white rounded-xl border border-gray-200 p-4 shadow-sm",
    onClick && "cursor-pointer active:bg-gray-50",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(classes, "w-full text-left")}>
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}

export function RecordMeta({ label, value, className }: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5 text-sm text-gray-700 break-words">{value}</div>
    </div>
  );
}

export function EmptyList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400", className)}>
      {children}
    </div>
  );
}
