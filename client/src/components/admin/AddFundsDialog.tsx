import React, { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Schema for coupon form validation
const couponSchema = z.object({
  couponCode: z.string().min(6, "Coupon code must be at least 6 characters"),
});

type CouponFormValues = z.infer<typeof couponSchema>;

export default function AddFundsDialog({
  isOpen,
  onOpenChange,
  companyId,
  companyName,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean, refreshNeeded?: boolean) => void;
  companyId: number;
  companyName: string;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with react-hook-form and zod validation
  const form = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      couponCode: "",
    },
  });

  // Handle form submission
  const onSubmit = async (data: CouponFormValues) => {
    setIsSubmitting(true);
    try {
      if (import.meta.env.DEV) { console.log(`Attempting to apply coupon ${data.couponCode} to company ${companyId}`); }
      
      // Call API to apply coupon to the company wallet using apiRequest (handles CSRF tokens)
      const result = await apiRequest('/api/admin/apply-coupon', {
        method: 'POST',
        body: JSON.stringify({
          companyId: companyId,
          couponCode: data.couponCode
        })
      });
      
      if (import.meta.env.DEV) { console.log('Coupon application result:', result); }

      // Show success message
      toast({
        title: "Coupon Applied Successfully",
        description: `Funds have been added to ${companyName}'s wallet.`,
        variant: "default",
      });

      // Invalidate queries to refresh wallet data
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/company-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/wallet-transactions'] });

      // Reset form and close dialog with refresh flag
      form.reset();
      onOpenChange(false, true); // Pass true to indicate data should be refreshed
    } catch (error: any) {
      // Show error message
      toast({
        title: "Error Applying Coupon",
        description: error?.message || "An error occurred while applying the coupon.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Funds to {companyName}</DialogTitle>
          <DialogDescription>
            Enter a valid coupon code to add funds to this company's wallet.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="couponCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coupon Code</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter coupon code" 
                      {...field} 
                      className="uppercase"
                      autoComplete="off"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Apply Coupon"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}