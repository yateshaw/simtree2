import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CreditCard } from 'lucide-react';
import StripeElements from './StripeElements';

interface StripePaymentButtonProps {
  className?: string;
  defaultAmount?: number;
  buttonText?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  onSuccess?: (transactionId: string) => void;
}

const StripePaymentButton: React.FC<StripePaymentButtonProps> = ({
  className = '',
  defaultAmount = 100,
  buttonText = "Add Credit",
  dialogTitle = "Add Credit to Your Wallet",
  dialogDescription = "Enter your payment details to add credit to your wallet",
  onSuccess,
}) => {
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    setOpen(false);
  };

  const handleSuccess = (transactionId: string) => {
    if (onSuccess) {
      onSuccess(transactionId);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className} variant="default">
          <CreditCard className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-lg border border-gray-200 shadow-xl p-0 overflow-hidden max-h-[95vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4 pt-5 px-4 sm:px-6 bg-gradient-to-r from-indigo-50 to-violet-50">
          <DialogTitle className="flex items-center text-xl font-bold text-indigo-700">
            <CreditCard className="h-5 w-5 mr-2 text-indigo-600" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 px-4 sm:px-6 mb-4">
          <StripeElements
            defaultAmount={defaultAmount}
            onCancel={handleClose}
            onSuccess={handleSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StripePaymentButton;