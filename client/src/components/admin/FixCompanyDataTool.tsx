import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Wrench, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';

export function FixCompanyDataTool() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFixData = async () => {
    try {
      setIsLoading(true);
      setResult(null);
      
      const response = await api.post('/api/admin/fix-company-data');
      if (import.meta.env.DEV) { console.log('Fix company data response:', response.data); }
      
      setResult(response.data);
      
      toast({
        title: 'Company Data Fixed',
        description: response.data.message,
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error fixing company data:', error);
      
      setResult({
        success: false,
        message: error.response?.data?.error || 'Failed to fix company data'
      });
      
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fix company data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Wrench className="h-5 w-5 mr-2" />
          Fix Company Data Tool
        </CardTitle>
        <CardDescription>
          Fix verification status and usernames for existing companies
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          This tool will check and fix two common issues:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground mb-4 space-y-1">
          <li>Ensure all companies that have completed their profile are marked as verified</li>
          <li>Update usernames to match the contact person's name instead of auto-generated IDs (like user_j3lka4xx)</li>
        </ul>
        
        {result && (
          <div className={`p-3 rounded-md mt-4 flex items-start ${result.success ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
            {result.success ? (
              <CheckCircle2 className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium">{result.success ? 'Success' : 'Error'}</p>
              <p className="text-sm mt-1">{result.message}</p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleFixData} 
          disabled={isLoading}
          variant="outline"
          className="w-full"
        >
          {isLoading ? 'Fixing Data...' : 'Fix Company Data Issues'}
        </Button>
      </CardFooter>
    </Card>
  );
}