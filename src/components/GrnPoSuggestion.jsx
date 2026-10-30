import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

function SuggestionFacts({ suggestion }) {
  return (
    <div>
      <p className="grn-po-suggestion-po">{suggestion.poNumber}</p>
      <dl className="grn-po-suggestion-facts">
        <div>
          <dt>Status</dt>
          <dd>{suggestion.statusText}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{suggestion.category}</dd>
        </div>
        <div>
          <dt>Items</dt>
          <dd>{suggestion.itemsSummary}</dd>
        </div>
        <div>
          <dt>Still to receive</dt>
          <dd>{suggestion.qtyText}</dd>
        </div>
        {suggestion.rateText ? (
          <div>
            <dt>Rate</dt>
            <dd>{suggestion.rateText}</dd>
          </div>
        ) : null}
        {suggestion.promisedText ? (
          <div>
            <dt>Delivery</dt>
            <dd>{suggestion.promisedText}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/**
 * Prominent callout at the top of Create GRN. Suggests the vendor's open
 * POs and does not write into the receipt until "Use this PO".
 */
export default function GrnPoSuggestion({
  vendorName,
  suggestions,
  onUsePo,
  onEnterManually,
  onDismiss
}) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (!suggestions || suggestions.length === 0) return null;

  const one = suggestions.length === 1;
  const heading = one ? 'Suggested purchase order' : 'Suggested purchase orders';
  const lead = one
    ? `${vendorName} has an open purchase order. The receipt below stays empty until you use it.`
    : `${vendorName} has ${suggestions.length} open purchase orders. The receipt below stays empty until you use one.`;

  return (
    <section
      className="grn-po-suggestion"
      aria-labelledby="grn-po-suggestion-heading"
    >
      <div className="grn-po-suggestion-head">
        <div>
          <h4
            id="grn-po-suggestion-heading"
            className="grn-po-suggestion-title"
            tabIndex={-1}
            ref={headingRef}
          >
            {heading}
          </h4>
          <p className="grn-po-suggestion-lead">{lead}</p>
        </div>
        <button
          type="button"
          className="grn-po-suggestion-dismiss"
          aria-label="Dismiss purchase order suggestion"
          onClick={onDismiss}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <ul className="grn-po-suggestion-list">
        {suggestions.map((suggestion) => (
          <li key={suggestion.poNumber} className="grn-po-suggestion-card">
            <SuggestionFacts suggestion={suggestion} />
            {!one && (
              <button
                type="button"
                className="btn-primary grn-po-suggestion-use"
                onClick={() => onUsePo(suggestion.poNumber)}
              >
                Use this PO
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="grn-po-suggestion-actions">
        {one && (
          <button
            type="button"
            className="btn-primary grn-po-suggestion-use"
            onClick={() => onUsePo(suggestions[0].poNumber)}
          >
            Use this PO
          </button>
        )}
        <button
          type="button"
          className="btn-secondary grn-po-suggestion-manual"
          onClick={onEnterManually}
        >
          Enter manually
        </button>
      </div>
    </section>
  );
}
