import type { ReactNode } from "react";

interface PanelHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function PanelHeader({ icon, title, subtitle, children }: PanelHeaderProps) {
  return (
    <div className="shrink-0 px-4 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-100 rounded-lg">{icon}</div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
            <p className="text-[10px] text-gray-500">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}