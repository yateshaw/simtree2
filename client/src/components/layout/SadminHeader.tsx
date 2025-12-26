import React from 'react';

interface SadminHeaderProps {
  title: string;
}

export default function SadminHeader({ title }: SadminHeaderProps) {
  return (
    <header className="bg-white shadow-sm z-10">
      <div className="px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      </div>
    </header>
  );
}