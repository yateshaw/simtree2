import { EsimDetails } from "../company/EsimDetails";

interface EsimDetailsWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  esim: any;
  planName?: string;
  employeeName: string;
  employeeId: number;
}

// This is just a wrapper around the original EsimDetails component
// to ensure we have the right imports
export default function EsimDetailsWrapper(props: EsimDetailsWrapperProps) {
  return (
    <EsimDetails
      isOpen={props.isOpen}
      onClose={props.onClose}
      esim={props.esim}
      planName={props.planName}
      employeeName={props.employeeName}
      employeeId={props.employeeId}
    />
  );
}