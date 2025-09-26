interface ToggleOption {
  value: string;
  label: string;
}

interface ToggleButtonGroupProps {
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
}

export function ToggleButtonGroup({
  options,
  value,
  onChange,
  size = "sm"
}: ToggleButtonGroupProps) {
  const sizeClasses = {
    sm: "px-2 py-1 text-[10px]",
    md: "px-3 py-2 text-xs"
  };

  return (
    <div className="flex border border-gray-200 rounded p-0.5 bg-gray-50">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`${sizeClasses[size]} font-medium rounded transition-all duration-150 ${
            value === option.value
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}