import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import EmployeeGridUploader from './EmployeeGridUploader';

interface BulkExecUploadDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const BulkExecUploadDialog: React.FC<BulkExecUploadDialogProps> = ({ 
  trigger, 
  open,
  onOpenChange
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  // Use controlled state if provided via props
  const dialogOpen = open !== undefined ? open : isOpen;
  const setDialogOpen = onOpenChange || setIsOpen;

  const handleClose = () => {
    setDialogOpen(false);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Employee Editor</DialogTitle>
          <DialogDescription>
            Copy data from Excel and paste directly into the grid below. Data format: First Name, Last Name, Email, Phone, Position. You can also edit cells individually.
          </DialogDescription>
        </DialogHeader>

        <EmployeeGridUploader onComplete={handleClose} />
      </DialogContent>
    </Dialog>
  );
};

export default BulkExecUploadDialog;