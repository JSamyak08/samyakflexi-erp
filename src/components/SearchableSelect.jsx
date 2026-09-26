import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

/**
 * SearchableSelect
 * A universal, searchable dropdown select component for React.
 * Supports both `options` array prop AND standard `<option>` / `<optgroup>` children!
 */
const SearchableSelect = React.forwardRef(({
  value,
  onChange,
  options: optionsProp,
  children,
  placeholder = "Select an option...",
  searchPlaceholder = "Type to search...",
  name,
  id,
  className = "form-control",
  style,
  disabled = false,
  required = false,
  isClearable = false,
  noOptionsMessage = "No matching options found",
  renderOption,
  onBlur,
  onFocus
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionsListRef = useRef(null);

  // 1. Extract structured options list from either `options` prop or `children`
  const parsedOptions = useMemo(() => {
    if (optionsProp && Array.isArray(optionsProp)) {
      return optionsProp.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
          return {
            value: opt.value !== undefined ? String(opt.value) : String(opt.label || ''),
            label: opt.label !== undefined ? String(opt.label) : String(opt.value || ''),
            subtitle: opt.subtitle ? String(opt.subtitle) : null,
            group: opt.group ? String(opt.group) : null,
            disabled: !!opt.disabled,
            raw: opt
          };
        }
        return {
          value: String(opt),
          label: String(opt),
          subtitle: null,
          group: null,
          disabled: false,
          raw: opt
        };
      });
    }

    // Parse options from React children (<option> and <optgroup>)
    const extracted = [];
    const parseChildren = (childNodes, currentGroup = null) => {
      React.Children.forEach(childNodes, child => {
        if (!child || !React.isValidElement(child)) return;

        if (child.type === 'optgroup') {
          const groupLabel = child.props.label || 'Group';
          if (child.props.children) {
            parseChildren(child.props.children, groupLabel);
          }
        } else if (child.type === 'option') {
          const val = child.props.value !== undefined ? String(child.props.value) : String(child.props.children || '');
          let lbl = child.props.children;
          if (typeof lbl === 'object') {
            lbl = val; // fallback if children is complex element
          } else {
            lbl = String(lbl || val);
          }

          extracted.push({
            value: val,
            label: lbl,
            subtitle: child.props['data-subtitle'] ? String(child.props['data-subtitle']) : null,
            group: currentGroup,
            disabled: !!child.props.disabled,
            raw: child.props
          });
        }
      });
    };

    if (children) {
      parseChildren(children);
    }

    return extracted;
  }, [optionsProp, children]);

  // 2. Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return parsedOptions;
    const query = searchTerm.toLowerCase().trim();
    return parsedOptions.filter(opt => {
      const matchLabel = opt.label.toLowerCase().includes(query);
      const matchValue = opt.value.toLowerCase().includes(query);
      const matchSubtitle = opt.subtitle ? opt.subtitle.toLowerCase().includes(query) : false;
      const matchGroup = opt.group ? opt.group.toLowerCase().includes(query) : false;
      return matchLabel || matchValue || matchSubtitle || matchGroup;
    });
  }, [parsedOptions, searchTerm]);

  // Find currently selected option label
  const selectedOption = useMemo(() => {
    const stringVal = value !== undefined && value !== null ? String(value) : "";
    return parsedOptions.find(opt => opt.value === stringVal);
  }, [parsedOptions, value]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm("");
        if (onBlur) onBlur(e);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [onBlur]);

  // Auto-focus search box on dropdown open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      if (onFocus) onFocus();
    }
  }, [isOpen, onFocus]);

  // Handle Option Selection
  const handleSelectOption = (opt, e) => {
    if (e) e.stopPropagation();
    if (opt.disabled) return;

    setIsOpen(false);
    setSearchTerm("");

    if (onChange) {
      // Create a synthetic-like event object compatible with standard HTML select onChange
      const syntheticEvent = {
        target: {
          name: name || id || "",
          value: opt.value,
          id: id || "",
          label: opt.label,
          rawOption: opt.raw
        },
        currentTarget: {
          name: name || id || "",
          value: opt.value
        },
        stopPropagation: () => {},
        preventDefault: () => {}
      };
      onChange(syntheticEvent, opt);
    }
  };

  // Handle Clear Selection
  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    setSearchTerm("");
    if (onChange) {
      const syntheticEvent = {
        target: {
          name: name || id || "",
          value: "",
          id: id || ""
        },
        currentTarget: {
          name: name || id || "",
          value: ""
        }
      };
      onChange(syntheticEvent, null);
    }
  };

  // Keyboard navigation inside search/dropdown
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelectOption(filteredOptions[highlightedIndex], e);
      } else if (!isOpen) {
        setIsOpen(true);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm("");
      }
    }
  };

  // Ensure highlighted index scrolls into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionsListRef.current) {
      const highlightedEl = optionsListRef.current.children[highlightedIndex];
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Display Text logic
  const displayLabel = selectedOption ? selectedOption.label : (value ? String(value) : "");
  const showPlaceholder = !displayLabel;

  return (
    <div 
      ref={containerRef}
      className={`searchable-select-wrapper ${disabled ? 'disabled' : ''}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '100%',
        ...style
      }}
    >
      {/* Trigger Button replacing standard select */}
      <div
        ref={ref}
        id={id}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        className={`searchable-select-trigger ${className} ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          paddingRight: '32px',
          position: 'relative',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minHeight: '38px',
          opacity: disabled ? 0.6 : 1
        }}
      >
        <span 
          className="searchable-select-value"
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: showPlaceholder ? '#9ca3af' : 'inherit',
            fontWeight: showPlaceholder ? 'normal' : '500'
          }}
        >
          {showPlaceholder ? placeholder : displayLabel}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'absolute', right: '10px' }}>
          {isClearable && value && !disabled && (
            <button
              type="button"
              className="searchable-select-clear"
              onClick={handleClear}
              title="Clear selection"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: '#9ca3af',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown 
            size={16} 
            style={{
              transition: 'transform 0.2s ease',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              color: '#6b7280',
              pointerEvents: 'none'
            }} 
          />
        </div>
      </div>

      {/* Dropdown Panel with Floating Search Input */}
      {isOpen && (
        <div
          className="searchable-select-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: 'var(--card-bg, #1e293b)',
            background: 'var(--card-bg, #1e293b)',
            border: '1px solid var(--border-color, #334155)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            minWidth: '220px',
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeInSelect 0.15s ease-out'
          }}
        >
          {/* Sticky Search Field Header */}
          <div
            className="searchable-select-search-header"
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-color, #334155)',
              backgroundColor: 'var(--header-bg, #0f172a)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              position: 'sticky',
              top: 0,
              zIndex: 2
            }}
          >
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              className="searchable-select-input"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main, #f8fafc)',
                fontSize: '13px',
                padding: '4px 0'
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Scrollable Options List */}
          <div
            ref={optionsListRef}
            className="searchable-select-options"
            role="listbox"
            style={{
              overflowY: 'auto',
              maxHeight: '260px',
              padding: '4px 0'
            }}
          >
            {filteredOptions.length === 0 ? (
              <div 
                className="searchable-select-no-options"
                style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  color: '#94a3b8',
                  textAlign: 'center'
                }}
              >
                {noOptionsMessage}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = selectedOption && selectedOption.value === opt.value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`searchable-select-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${opt.disabled ? 'disabled' : ''}`}
                    onClick={(e) => handleSelectOption(opt, e)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isHighlighted 
                        ? 'rgba(59, 130, 246, 0.15)' 
                        : (isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent'),
                      color: isSelected ? '#60a5fa' : (opt.disabled ? '#64748b' : 'var(--text-main, #f8fafc)'),
                      fontWeight: isSelected ? '600' : 'normal',
                      transition: 'background-color 0.1s ease',
                      borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {renderOption ? renderOption(opt) : opt.label}
                      </span>
                      {opt.subtitle && (
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {opt.subtitle}
                        </span>
                      )}
                      {opt.group && (
                        <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {opt.group}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <Check size={15} style={{ color: '#3b82f6', flexShrink: 0, marginLeft: '8px' }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;
