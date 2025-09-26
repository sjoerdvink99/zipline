import type { ValidationError } from '../../types/predicate';

interface ValidationErrorsProps {
  errors: ValidationError[];
}

export function ValidationErrors({ errors }: ValidationErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h4 className="text-sm font-medium text-red-800 mb-1">
            Expression Validation ({errors.length} issue{errors.length !== 1 ? 's' : ''})
          </h4>
          <ul className="space-y-1">
            {errors.map((error, index) => (
              <li key={index} className="text-xs text-red-700">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                  <span className="font-medium capitalize">{error.type}:</span>
                  {error.message}
                  {error.position && (
                    <span className="text-red-500 font-mono ml-1">(pos: {error.position})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}