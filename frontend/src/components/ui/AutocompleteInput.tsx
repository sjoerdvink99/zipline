import { useState, useRef, useEffect } from 'react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  type?: 'text' | 'number';
  onBlur?: () => void;
  onFocus?: () => void;
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className = '',
  disabled = false,
  type = 'text',
  onBlur,
  onFocus
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!value.trim() || !suggestions.length) {
      setFilteredSuggestions([]);
      return;
    }

    const filtered = suggestions
      .filter(suggestion =>
        suggestion.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 10); // Limit to 10 suggestions

    setFilteredSuggestions(filtered);
  }, [value, suggestions]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(newValue.length > 0);
  };

  const handleInputFocus = () => {
    setIsOpen(value.length > 0 && filteredSuggestions.length > 0);
    onFocus?.();
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    if (listRef.current && listRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsOpen(false);
    onBlur?.();
  };

  const selectSuggestion = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
          selectSuggestion(filteredSuggestions[selectedIndex]);
        }
        break;

      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full ${className}`}
      />

      {isOpen && filteredSuggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredSuggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              onClick={() => selectSuggestion(suggestion)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                index === selectedIndex ? 'bg-blue-50 text-blue-600' : ''
              }`}
            >
              <span dangerouslySetInnerHTML={{
                __html: suggestion.replace(
                  new RegExp(`(${value})`, 'gi'),
                  '<mark class="bg-yellow-200">$1</mark>'
                )
              }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}