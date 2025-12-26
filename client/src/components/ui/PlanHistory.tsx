import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Plan {
  planName: string;
  planData: string | number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  dataUsed: string | number;
}

interface PlanHistoryProps {
  plans: Plan[];
}

export default function PlanHistory({ plans }: PlanHistoryProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plan</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans?.length > 0 ? (
            plans.map((plan, idx) => (
              <TableRow key={idx}>
                <TableCell>{plan.planName || '-'}</TableCell>
                <TableCell>{plan.planData ? `${plan.planData} GB` : '-'}</TableCell>
                <TableCell>{formatDate(plan.startDate)}</TableCell>
                <TableCell>{formatDate(plan.endDate)}</TableCell>
                <TableCell>
                  <Badge 
                    variant={plan.status === 'active' ? 'default' : 
                      plan.status === 'cancelled' ? 'secondary' : 'outline'}
                  >
                    {plan.status || '-'}
                  </Badge>
                </TableCell>
                <TableCell>{plan.dataUsed ? `${plan.dataUsed} GB` : '-'}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No plan history available
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}