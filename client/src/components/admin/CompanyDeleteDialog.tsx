import { useState } from 'react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface CompanyDeleteDialogProps {
  company: {
    id: number;
    name: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CompanyDeleteDialog({ 
  company, 
  isOpen, 
  onClose,
  onSuccess
}: CompanyDeleteDialogProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [hasCheckedBalance, setHasCheckedBalance] = useState(false);

  const handleClose = () => {
    // Reset state
    setPassword('');
    setError(null);
    setWalletBalance(null);
    setHasCheckedBalance(false);
    onClose();
  };

  const checkWalletBalance = async () => {
    if (!company) return;
    
    setIsCheckingBalance(true);
    setError(null);
    
    try {
      const response = await api.get(`/api/admin/companies/${company.id}/wallet`);
      const data = response.data;
      
      if (data.success) {
        setWalletBalance(data.balance);
        setHasCheckedBalance(true);
        
        if (data.balance > 0) {
          setError(`Company wallet has a balance of $${data.balance.toFixed(2)}. The balance must be zero before deletion.`);
        }
      } else {
        setError('Failed to check wallet balance. Please try again.');
      }
    } catch (err) {
      console.error('Error checking wallet balance:', err);
      setError('An error occurred while checking the wallet balance.');
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }
    
    setIsDeleting(true);
    setError(null);
    
    try {
      const response = await api.delete(`/api/admin/companies/${company.id}`, {
        data: {
          password,
          forceDelete: true // Always force delete to ensure complete removal
        }
      });
      
      const data = response.data;
      
      if (data.success) {
        toast({
          title: 'Company Deleted',
          description: `${company.name} has been successfully deleted.`,
        });
        handleClose();
        onSuccess();
      } else {
        setError(data.message || 'Failed to delete company. Please try again.');
      }
    } catch (err: any) {
      console.error('Error deleting company:', err);
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'An error occurred while deleting the company.';
      setError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // When the dialog is opened, automatically check the wallet balance
  if (isOpen && company && !hasCheckedBalance && !isCheckingBalance) {
    checkWalletBalance();
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center text-red-600">
            <Trash2 className="mr-2 h-5 w-5" /> Delete Company
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            This action <strong>permanently deletes</strong> {company?.name} and all associated data:
            
            <ul className="list-disc ml-4 mt-2 space-y-1">
              <li>All employees and user accounts</li>
              <li>Wallet balance and transaction history</li>
              <li>eSIM purchase and usage history</li>
              <li>Any pending eSIM plans will be cancelled</li>
            </ul>
            
            {isCheckingBalance ? (
              <div className="flex items-center justify-center mt-4">
                <Spinner className="mr-2" /> Checking wallet balance...
              </div>
            ) : walletBalance !== null && (
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                <div className="font-semibold flex items-center">
                  Wallet Balance: 
                  <Badge variant={walletBalance > 0 ? "destructive" : "default"} className={walletBalance > 0 ? "ml-2" : "ml-2 bg-green-100 text-green-800"}>
                    ${walletBalance.toFixed(2)}
                  </Badge>
                </div>
                {walletBalance > 0 && (
                  <div className="text-sm text-red-500 mt-1 flex items-center">
                    <CircleAlert className="h-4 w-4 mr-1" /> 
                    Balance must be zero before deletion
                  </div>
                )}
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <Label htmlFor="password" className="block mb-2">
            Enter your password to confirm deletion
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full"
            disabled={isDeleting || (walletBalance !== null && walletBalance > 0)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || !password || (walletBalance !== null && walletBalance > 0) || isCheckingBalance}
            className="gap-2"
          >
            {isDeleting ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            {isDeleting ? 'Deleting...' : 'Delete Company'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}