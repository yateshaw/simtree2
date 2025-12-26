import React from "react";
import { ClientWithCompany } from "./ClientsTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Building,
  MapPin,
  Phone,
  Mail, 
  FileText as FileIcon,
  Users as ContactIcon,
  Globe,
  UserCircle,
  Briefcase
} from "lucide-react";

interface CompanyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ClientWithCompany | null;
}

export default function CompanyDetailsDialog({ open, onOpenChange, client }: CompanyDetailsDialogProps) {
  if (!client || !client.company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="p-6 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-primary">
              <Building className="h-6 w-6 text-primary" />
              Company Details
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              View detailed information about this company
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6">
          <div className="flex flex-col mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
                {client.company.companyName || client.company.name}
              </h2>
              {client.company.verified && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Verified
                </span>
              )}
              {client.company.active ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Inactive
                </span>
              )}
            </div>
            <div className="flex items-center mt-1 text-sm text-gray-600 dark:text-gray-400">
              <Briefcase className="h-4 w-4 mr-1 text-blue-600/80" />
              <span>{client.company.industry || 'Industry not specified'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {/* Company Information - 3/5 columns */}
            <div className="md:col-span-3">
              <div className="flex items-center mb-4">
                <FileIcon className="h-5 w-5 text-blue-600" />
                <h3 className="text-blue-600 font-medium ml-2">Company Information</h3>
              </div>
              
              <div className="space-y-5 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">COMPANY NAME</div>
                  <div className="font-medium">{client.company.companyName || client.company.name}</div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">COUNTRY</div>
                  <div className="flex items-center">
                    {(() => {
                      // Country code to full name mapping
                      const countryNames: Record<string, string> = {
                        'ar': 'Argentina',
                        'us': 'United States',
                        'br': 'Brazil',
                        'mx': 'Mexico',
                        'es': 'Spain',
                        'cl': 'Chile',
                        'co': 'Colombia',
                        'pe': 'Peru',
                        'uy': 'Uruguay',
                        'de': 'Germany',
                        'fr': 'France',
                        'it': 'Italy',
                        'uk': 'United Kingdom',
                        'gb': 'United Kingdom',
                        'ca': 'Canada',
                        'jp': 'Japan',
                        'cn': 'China',
                        'in': 'India',
                        'au': 'Australia',
                        'nz': 'New Zealand',
                        'za': 'South Africa'
                      };
                      
                      const countryCode = client.company.country?.toLowerCase();
                      if (countryCode && countryNames[countryCode]) {
                        return countryNames[countryCode];
                      }
                      return client.company.country || 'Not specified';
                    })()}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">ADDRESS</div>
                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{client.company.address || 'Not provided'}</span>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">TAX NUMBER</div>
                  <div className="flex items-center">
                    <FileIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <span>{client.company.taxNumber || 'Not provided'}</span>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">INDUSTRY</div>
                  <div className="flex items-center">
                    <Briefcase className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <span>{client.company.industry || 'Not specified'}</span>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">WEBSITE</div>
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    {client.company.website ? (
                      <a 
                        href={client.company.website.startsWith('http') ? 
                          client.company.website : 
                          `https://${client.company.website}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {client.company.website}
                      </a>
                    ) : 'Not provided'}
                  </div>
                </div>
                
                {client.company.description && (
                  <div>
                    <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">DESCRIPTION</div>
                    <div className="text-sm italic text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-slate-800/50 p-2 rounded border border-gray-100 dark:border-gray-800">
                      {client.company.description || 'Not provided'}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right column - Contact Information - 2/5 columns */}
            <div className="md:col-span-2">
              <div className="flex items-center mb-4">
                <ContactIcon className="h-5 w-5 text-blue-600" />
                <h3 className="text-blue-600 font-medium ml-2">Contact Information</h3>
              </div>
              
              <div className="space-y-5 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">CONTACT PERSON</div>
                  <div className="flex items-center">
                    <UserCircle className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <span className="font-medium">
                      {client.company.contactName || client.username || 'Not provided'}
                    </span>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">CONTACT PHONE</div>
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    {client.company.contactPhone ? (
                      <a 
                        href={`tel:${client.company.contactPhone}`} 
                        className="text-blue-600 hover:underline"
                      >
                        {client.company.contactPhone}
                      </a>
                    ) : (
                      <span className="text-gray-500">Not provided</span>
                    )}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs uppercase text-blue-600/80 font-medium mb-1">CONTACT EMAIL</div>
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    {client.company.contactEmail ? (
                      <a 
                        href={`mailto:${client.company.contactEmail}`} 
                        className="text-blue-600 hover:underline"
                      >
                        {client.company.contactEmail}
                      </a>
                    ) : (
                      <span className="text-gray-500">Not provided</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="mt-6 text-xs text-gray-500 dark:text-gray-400">
                <p className="mb-1">Account created: {new Date(client.createdAt).toLocaleDateString()}</p>
                <p className="mb-1">Admin: {client.username}</p>
                <p className="mb-1">
                  Last activity: {client.company.lastActivityDate 
                    ? new Date(client.company.lastActivityDate).toLocaleDateString() 
                    : 'No activity recorded'}
                </p>
                <p>
                  {client.company.active 
                    ? 'Active status: Active' 
                    : 'Active status: Inactive (Auto-deactivated after 2 months of inactivity)'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}