import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { X } from 'lucide-react';
import SimpleStripeForm from './SimpleStripeForm';
import StripeElementsForm from './StripeElementsForm';

interface CreditTopUpDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (data: any) => void;
}

const CREDIT_OPTIONS = [
  { credits: 100, amount: 100.00 },
  { credits: 300, amount: 300.00 },
  { credits: 500, amount: 500.00 },
  { credits: 1000, amount: 1000.00 },
  { credits: 3000, amount: 3000.00 },
  { credits: 5000, amount: 5000.00 },
];

export default function CreditTopUpDialog({ 
  isOpen, 
  onOpenChange, 
  onSuccess 
}: CreditTopUpDialogProps) {
  const [selectedOption, setSelectedOption] = useState<typeof CREDIT_OPTIONS[0] | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const handleCreditSelect = (option: typeof CREDIT_OPTIONS[0]) => {
    setSelectedOption(option);
    setShowPaymentForm(true);
  };

  const handlePaymentSuccess = (data: any) => {
    setShowPaymentForm(false);
    setSelectedOption(null);
    onSuccess?.(data);
    onOpenChange(false);
  };

  const handleBack = () => {
    setShowPaymentForm(false);
    setSelectedOption(null);
  };

  const handleClose = () => {
    setShowPaymentForm(false);
    setSelectedOption(null);
    onOpenChange(false);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when dialog is closed by any means
      setShowPaymentForm(false);
      setSelectedOption(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {showPaymentForm ? 'Complete Payment' : 'Top up'}
          </DialogTitle>
        </DialogHeader>

        {!showPaymentForm ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Select top-up amount:
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {CREDIT_OPTIONS.map((option, index) => {
                  // Using your color palette: light teal, coral, emerald, pink, blue, yellow
                  const colors = [
                    { border: 'border-teal-400', hover: 'hover:border-teal-500', bg: 'hover:bg-teal-50', text: 'text-teal-600' },
                    { border: 'border-orange-400', hover: 'hover:border-orange-500', bg: 'hover:bg-orange-50', text: 'text-orange-600' },
                    { border: 'border-emerald-400', hover: 'hover:border-emerald-500', bg: 'hover:bg-emerald-50', text: 'text-emerald-600' },
                    { border: 'border-pink-400', hover: 'hover:border-pink-500', bg: 'hover:bg-pink-50', text: 'text-pink-600' },
                    { border: 'border-blue-400', hover: 'hover:border-blue-500', bg: 'hover:bg-blue-50', text: 'text-blue-600' },
                    { border: 'border-yellow-400', hover: 'hover:border-yellow-500', bg: 'hover:bg-yellow-50', text: 'text-yellow-600' },
                  ];
                  const colorSet = colors[index % colors.length];
                  
                  return (
                    <Card 
                      key={option.credits}
                      className={`cursor-pointer transition-all duration-200 border-2 ${colorSet.border} ${colorSet.hover} ${colorSet.bg} hover:scale-105 hover:shadow-lg`}
                      onClick={() => handleCreditSelect(option)}
                    >
                      <CardContent className="p-4 text-center">
                        <div className={`text-xl font-bold mb-1 ${colorSet.text}`}>
                          {option.credits}
                        </div>
                        <div className="text-xs text-gray-500 mb-2">credits</div>
                        <div className="text-sm font-semibold text-gray-700">
                          ${option.amount.toFixed(2)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          selectedOption && (
            <div className="space-y-4">
              <Card className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-teal-700">Item</span>
                    <span className="text-sm font-medium text-teal-700">Total</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-800">{selectedOption.credits} Credits</span>
                    <span className="font-bold text-2xl text-emerald-600">
                      ${selectedOption.amount.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <StripeElementsForm
                amount={selectedOption.amount}
                onSuccess={handlePaymentSuccess}
                onCancel={handleBack}
                title="Complete Payment"
                description={`Pay $${selectedOption.amount.toFixed(2)} for ${selectedOption.credits} credits`}
              />
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}