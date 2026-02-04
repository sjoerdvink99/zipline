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
  size = "sm",
}: ToggleButtonGroupProps) {
  const sizeClasses = {
    sm: "px-2.5 py-1 text-2xs",
    md: "px-3 py-1.5 text-xs",
  };

  return (
    <div className="flex border border-gray-200 rounded-lg p-0.5 bg-gray-50">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`${sizeClasses[size]} font-medium rounded-md transition-base ${
            value === option.value
              ? "bg-white text-gray-900 shadow-subtle"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
