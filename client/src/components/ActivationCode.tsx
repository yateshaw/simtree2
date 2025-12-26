import React from 'react';

interface ActivationCodeProps {
  code: string[];
}

export const ActivationCodeDisplay: React.FC<ActivationCodeProps> = ({ code }) => {
  return (
    <div className="activation-code grid grid-cols-auto-fit gap-4 p-3 border border-gray-300 rounded-md">
      {code.map((part, index) => (
        <span key={index} className="text-center font-mono bg-gray-100 p-2 rounded">
          {part}
        </span>
      ))}
    </div>
  );
};

export default ActivationCodeDisplay;