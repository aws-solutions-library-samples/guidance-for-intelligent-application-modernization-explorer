import React from 'react';

/**
 * A simple input component for weight values that ensures editability
 */
const EditableWeightInput = ({ value, onChange, placeholder = "0" }) => {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: '14px',
        border: '2px solid #adb5bd',
        borderRadius: '4px',
        boxSizing: 'border-box'
      }}
    />
  );
};

export default EditableWeightInput;
