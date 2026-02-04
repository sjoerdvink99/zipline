import type { ReactNode } from "react";

interface PanelHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function PanelHeader({
  icon,
  title,
  subtitle,
  children,
}: PanelHeaderProps) {
  return (
    <div className="shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100 shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-2xs text-gray-500 truncate">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </div>
  );
}
