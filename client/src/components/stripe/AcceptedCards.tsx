import React from 'react';

const AcceptedCards: React.FC = () => {
  return (
    <div className="mt-4 flex items-center justify-center">
      <img
        src="/accepted-cards.png"
        alt="Powered by Stripe - Accepted payment methods: Visa, Mastercard, Maestro, American Express, Discover"
        className="h-12 object-contain"
      />
    </div>
  );
};

export default AcceptedCards;