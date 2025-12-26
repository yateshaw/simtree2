import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button"; 
import EmployeeGridUploader from './EmployeeGridUploader';
import { UserPlus } from 'lucide-react';

interface EmployeeAddButtonProps {
  className?: string;
  variant?: "outline" | "default" | "secondary";
  size?: "sm" | "default" | "lg";
  icon?: boolean;
}

/**
 * EmployeeAddButton - A button that opens the employee management dialog
 * The dialog contains a grid for adding one or more employees
 */
const EmployeeAddButton: React.FC<EmployeeAddButtonProps> = ({ 
  className = "",
  variant = "outline",
  size = "sm",
  icon = true
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  
  // Handle dialog close
  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={variant} 
          size={size} 
          className={`text-xs sm:text-sm ${className}`}
        >
          {icon && <UserPlus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
          <span className="whitespace-nowrap">Add Employee</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Employees</DialogTitle>
          <DialogDescription>
            Add one or more employees easily. You can paste data directly from Excel or add them manually.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <EmployeeGridUploader onComplete={handleClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeAddButton;