// client/src/pages/complete-profile-enhanced.tsx

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Building2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { companyInfoSchema as baseCompanyInfoSchema, type Company } from '@/../../shared/schema';
import { config } from '@/lib/config';
import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';
import ReactCountryFlag from 'react-country-flag';

// Enhanced schema with proper phone validation (global + país seleccionado)
const companyInfoSchema = baseCompanyInfoSchema.extend({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  industry: z.string().optional(),
  phoneCountryCode: z.string().min(1, 'Country code is required'),
  phoneNumber: z.string().min(5, 'Phone number is too short'),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "You must accept the terms and conditions"
  }),
}).superRefine((data, ctx) => {
  if (data.phoneCountryCode && data.phoneNumber) {
    try {
      const selectedCountry =
        COUNTRIES.find(c => c.name === data.country) ??
        COUNTRIES.find(c => c.phone === data.phoneCountryCode);

      const cleanPhoneNumber = data.phoneNumber.replace(/[^\d]/g, '');
      if (!cleanPhoneNumber || cleanPhoneNumber.length < 3) return;

      const candidate = `${data.phoneCountryCode}${cleanPhoneNumber}`.replace(/^\+?/, '+');
      const valid = isValidPhoneNumber(candidate, selectedCountry?.code as any);

      if (!valid) {
        try {
          const parsed = parsePhoneNumberFromString(candidate, selectedCountry?.code as any);
          if (!parsed || !parsed.isValid()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['phoneNumber'],
              message: selectedCountry
                ? `Please enter a valid phone number for ${selectedCountry.name}`
                : 'Please enter a valid phone number',
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['phoneNumber'],
            message: selectedCountry
              ? `Please enter a valid phone number for ${selectedCountry.name}`
              : 'Please enter a valid phone number',
          });
        }
      }
    } catch {
      if (data.phoneNumber && data.phoneNumber.replace(/[^\d]/g, '').length >= 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phoneNumber'],
          message: 'Please enter a valid phone number',
        });
      }
    }
  }
});

type CompanyInfoFormValues = z.infer<typeof companyInfoSchema>;

// Common industries list for the dropdown
const commonIndustries = [
  { value: 'technology', label: 'Technology' },
  { value: 'telecommunications', label: 'Telecommunications' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'hospitality', label: 'Hospitality & Tourism' },
  { value: 'transportation', label: 'Transportation & Logistics' },
  { value: 'energy', label: 'Energy & Utilities' },
  { value: 'consulting', label: 'Consulting & Professional Services' },
  { value: 'other', label: 'Other' },
];

// Common entity types for business registration
const entityTypes = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'llc', label: 'LLC (Limited Liability Company)' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'nonprofit', label: 'Non-Profit Organization' },
  { value: 'other', label: 'Other' },
];

// Comprehensive country data
const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', phone: '+93' },
  { code: 'AL', name: 'Albania', flag: '🇦🇱', phone: '+355' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿', phone: '+213' },
  { code: 'AD', name: 'Andorra', flag: '🇦🇩', phone: '+376' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴', phone: '+244' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', phone: '+54' },
  { code: 'AM', name: 'Armenia', flag: '🇦🇲', phone: '+374' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', phone: '+61' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', phone: '+43' },
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿', phone: '+994' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸', phone: '+1242' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭', phone: '+973' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', phone: '+880' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧', phone: '+1246' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾', phone: '+375' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', phone: '+32' },
  { code: 'BZ', name: 'Belize', flag: '🇧🇿', phone: '+501' },
  { code: 'BJ', name: 'Benin', flag: '🇧🇯', phone: '+229' },
  { code: 'BT', name: 'Bhutan', flag: '🇧🇹', phone: '+975' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', phone: '+591' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦', phone: '+387' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼', phone: '+267' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', phone: '+55' },
  { code: 'BN', name: 'Brunei', flag: '🇧🇳', phone: '+673' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', phone: '+359' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', phone: '+226' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮', phone: '+257' },
  { code: 'KH', name: 'Cambodia', flag: '🇰🇭', phone: '+855' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', phone: '+237' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', phone: '+1' },
  { code: 'CV', name: 'Cape Verde', flag: '🇨🇻', phone: '+238' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', phone: '+236' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩', phone: '+235' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', phone: '+56' },
  { code: 'CN', name: 'China', flag: '🇨🇳', phone: '+86' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', phone: '+57' },
  { code: 'KM', name: 'Comoros', flag: '🇰🇲', phone: '+269' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬', phone: '+242' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', phone: '+506' },
  { code: 'CI', name: 'Côte d\'Ivoire', flag: '🇨🇮', phone: '+225' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷', phone: '+385' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺', phone: '+53' },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾', phone: '+357' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', phone: '+420' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', phone: '+45' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯', phone: '+253' },
  { code: 'DM', name: 'Dominica', flag: '🇩🇲', phone: '+1767' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', phone: '+1809' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', phone: '+593' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', phone: '+20' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻', phone: '+503' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', phone: '+240' },
  { code: 'ER', name: 'Eritrea', flag: '🇪🇷', phone: '+291' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪', phone: '+372' },
  { code: 'SZ', name: 'Eswatini', flag: '🇸🇿', phone: '+268' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', phone: '+251' },
  { code: 'FJ', name: 'Fiji', flag: '🇫🇯', phone: '+679' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', phone: '+358' },
  { code: 'FR', name: 'France', flag: '🇫🇷', phone: '+33' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦', phone: '+241' },
  { code: 'GM', name: 'Gambia', flag: '🇬🇲', phone: '+220' },
  { code: 'GE', name: 'Georgia', flag: '🇬🇪', phone: '+995' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', phone: '+49' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', phone: '+233' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷', phone: '+30' },
  { code: 'GD', name: 'Grenada', flag: '🇬🇩', phone: '+1' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', phone: '+502' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳', phone: '+224' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', phone: '+245' },
  { code: 'GY', name: 'Guyana', flag: '🇬🇾', phone: '+592' },
  { code: 'HT', name: 'Haiti', flag: '🇭🇹', phone: '+509' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳', phone: '+504' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺', phone: '+36' },
  { code: 'IS', name: 'Iceland', flag: '🇮🇸', phone: '+354' },
  { code: 'IN', name: 'India', flag: '🇮🇳', phone: '+91' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', phone: '+62' },
  { code: 'IR', name: 'Iran', flag: '🇮🇷', phone: '+98' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶', phone: '+964' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', phone: '+353' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', phone: '+972' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', phone: '+39' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', phone: '+1' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', phone: '+81' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴', phone: '+962' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿', phone: '+7' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', phone: '+254' },
  { code: 'KI', name: 'Kiribati', flag: '🇰🇮', phone: '+686' },
  { code: 'KP', name: 'North Korea', flag: '🇰🇵', phone: '+850' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', phone: '+82' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', phone: '+965' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬', phone: '+996' },
  { code: 'LA', name: 'Laos', flag: '🇱🇦', phone: '+856' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻', phone: '+371' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧', phone: '+961' },
  { code: 'LS', name: 'Lesotho', flag: '🇱🇸', phone: '+266' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷', phone: '+231' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾', phone: '+218' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮', phone: '+423' },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹', phone: '+370' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', phone: '+352' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬', phone: '+261' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼', phone: '+265' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', phone: '+60' },
  { code: 'MV', name: 'Maldives', flag: '🇲🇻', phone: '+960' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', phone: '+223' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', phone: '+356' },
  { code: 'MH', name: 'Marshall Islands', flag: '🇲🇭', phone: '+692' },
  { code: 'MR', name: 'Mauritania', flag: '🇲🇷', phone: '+222' },
  { code: 'MU', name: 'Mauritius', flag: '🇲🇺', phone: '+230' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', phone: '+52' },
  { code: 'FM', name: 'Micronesia', flag: '🇫🇲', phone: '+691' },
  { code: 'MD', name: 'Moldova', flag: '🇲🇩', phone: '+373' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨', phone: '+377' },
  { code: 'MN', name: 'Mongolia', flag: '🇲🇳', phone: '+976' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪', phone: '+382' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', phone: '+212' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', phone: '+258' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲', phone: '+95' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦', phone: '+264' },
  { code: 'NR', name: 'Nauru', flag: '🇳🇷', phone: '+674' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', phone: '+977' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', phone: '+31' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', phone: '+64' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', phone: '+505' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', phone: '+227' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', phone: '+234' },
  { code: 'MK', name: 'North Macedonia', flag: '🇲🇰', phone: '+389' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', phone: '+47' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲', phone: '+968' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', phone: '+92' },
  { code: 'PW', name: 'Palau', flag: '🇵🇼', phone: '+680' },
  { code: 'PS', name: 'Palestine', flag: '🇵🇸', phone: '+970' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦', phone: '+507' },
  { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬', phone: '+675' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', phone: '+595' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', phone: '+51' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', phone: '+63' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', phone: '+48' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', phone: '+351' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', phone: '+974' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', phone: '+40' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', phone: '+7' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', phone: '+250' },
  { code: 'KN', name: 'Saint Kitts and Nevis', flag: '🇰🇳', phone: '+1' },
  { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨', phone: '+1' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', phone: '+1' },
  { code: 'WS', name: 'Samoa', flag: '🇼🇸', phone: '+685' },
  { code: 'SM', name: 'San Marino', flag: '🇸🇲', phone: '+378' },
  { code: 'ST', name: 'São Tomé and Príncipe', flag: '🇸🇹', phone: '+239' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', phone: '+966' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳', phone: '+221' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸', phone: '+381' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨', phone: '+248' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', phone: '+232' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', phone: '+65' },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰', phone: '+421' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮', phone: '+386' },
  { code: 'SB', name: 'Solomon Islands', flag: '🇸🇧', phone: '+677' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴', phone: '+252' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', phone: '+27' },
  { code: 'SS', name: 'South Sudan', flag: '🇸🇸', phone: '+211' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', phone: '+34' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', phone: '+94' },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩', phone: '+249' },
  { code: 'SR', name: 'Suriname', flag: '🇸🇷', phone: '+597' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', phone: '+46' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', phone: '+41' },
  { code: 'SY', name: 'Syria', flag: '🇸🇾', phone: '+963' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', phone: '+886' },
  { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯', phone: '+992' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', phone: '+255' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', phone: '+66' },
  { code: 'TL', name: 'Timor-Leste', flag: '🇹🇱', phone: '+670' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', phone: '+228' },
  { code: 'TO', name: 'Tonga', flag: '🇹🇴', phone: '+676' },
  { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹', phone: '+1' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳', phone: '+216' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', phone: '+90' },
  { code: 'TM', name: 'Turkmenistan', flag: '🇹🇲', phone: '+993' },
  { code: 'TV', name: 'Tuvalu', flag: '🇹🇻', phone: '+688' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', phone: '+256' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦', phone: '+380' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', phone: '+971' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', phone: '+44' },
  { code: 'US', name: 'United States', flag: '🇺🇸', phone: '+1' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', phone: '+598' },
  { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿', phone: '+998' },
  { code: 'VU', name: 'Vanuatu', flag: '🇻🇺', phone: '+678' },
  { code: 'VA', name: 'Vatican City', flag: '🇻🇦', phone: '+39' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪', phone: '+58' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', phone: '+84' },
  { code: 'YE', name: 'Yemen', flag: '🇾🇪', phone: '+967' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', phone: '+260' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', phone: '+263' },
];

export default function CompleteProfileEnhanced() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [userId, setUserId] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (user && user.id) {
      setUserId(user.id);
    } else {
      const params = new URLSearchParams(window.location.search);
      const userIdParam = params.get('userId');
      const verifiedParam = params.get('verified');
      if (userIdParam) setUserId(parseInt(userIdParam));
      if (verifiedParam === 'true') {
        setVerified(true);
        toast({
          title: 'Email Verified',
          description: 'Your email has been successfully verified. Please complete your company profile.',
        });
      }
    }
  }, [user, toast]);

  const { data: pendingCompanyData } = useQuery<Company>({
    queryKey: [`/api/companies/${user?.companyId}`],
    enabled: !!user?.companyId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const defaultContactEmail = user ? user.email : '';
  const defaultCompanyName = pendingCompanyData?.name || '';

  const form = useForm<CompanyInfoFormValues>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: {
      companyName: defaultCompanyName,
      country: '',
      address: '',
      taxNumber: '',
      entityType: '',
      contactName: '',
      phoneCountryCode: '+54',
      phoneNumber: '',
      contactEmail: defaultContactEmail,
      industry: '',
      description: '',
      website: '',
      acceptTerms: false,
    },
  });

  useEffect(() => {
    if (pendingCompanyData?.name && !form.getValues('companyName')) {
      form.setValue('companyName', pendingCompanyData.name);
    }
  }, [pendingCompanyData, form]);

  // Sincroniza SIEMPRE el código al cambiar "Country"
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'country' && value.country) {
        const selectedCountry = COUNTRIES.find(c => c.name === value.country);
        if (selectedCountry) {
          form.setValue('phoneCountryCode', selectedCountry.phone);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const companyProfileMutation = useMutation({
    mutationFn: async (data: Omit<CompanyInfoFormValues, 'acceptTerms'> & { userId: number }) => {
      const response = await api.post('/api/auth/company-info', data);
      return response.data;
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast({
        title: 'Profile Completed!',
        description: 'Your company profile has been successfully created. Welcome to your dashboard!',
        variant: 'default',
      });
      setTimeout(() => {
        window.location.href = config.getFullUrl('/dashboard');
      }, 2500);
    },
    onError: (error: any) => {
      console.error('Error completing profile:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to complete your profile. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const onSubmit = (data: CompanyInfoFormValues) => {
    if (!userId) {
      console.error('Missing userId in profile submission');
      toast({
        title: 'Error',
        description: 'User ID is missing. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Processing',
      description: 'Creating your company profile...',
    });

    try {
      const { acceptTerms, phoneNumber, phoneCountryCode, ...rest } = data;

      // Normalizamos a E.164
      const clean = (phoneNumber || '').replace(/[^\d]/g, '');
      const candidate = `${phoneCountryCode}${clean}`.replace(/^\+?/, '+');
      const parsed = parsePhoneNumberFromString(candidate);

      if (!parsed || !parsed.isValid()) {
        toast({
          title: 'Invalid phone',
          description: 'Please enter a valid phone number.',
          variant: 'destructive',
        });
        return;
      }

      companyProfileMutation.mutate({ 
        ...rest,
        phoneCountryCode,
        phoneNumber: parsed.number, // E.164
        userId
      });
    } catch (error) {
      console.error('Exception during company profile creation:', error);
      toast({
        title: 'Unexpected Error',
        description: 'An unexpected error occurred while submitting your data. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-teal-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Profile Complete!</h2>
            <p className="text-gray-600 mb-4">
              Your company profile has been successfully created. You will be redirected to the login page shortly.
            </p>
            <div className="flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm text-gray-500">Redirecting...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {verified && (
          <Alert className="mb-6 border-teal-200 bg-teal-50">
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
            <AlertDescription className="text-teal-800">
              Your email has been verified successfully. Please complete your company profile below.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center space-x-3">
            <Building2 className="h-8 w-8 text-teal-600" />
            <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
          </div>
        </div>

        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardHeader className="border-b border-gray-100 px-6 py-4">
            <CardTitle className="text-lg font-medium text-gray-900">Company Information</CardTitle>
            <CardDescription className="text-sm text-gray-500 mt-1">
              Please provide accurate business details for verification purposes.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* Company Name and Contact Person */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Company Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter company legal name" 
                            {...field} 
                            className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Contact Person *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Full name of primary contact" 
                            {...field} 
                            className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Industry and Phone Number */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Industry</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500">
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {commonIndustries.map((industry) => (
                              <SelectItem key={industry.value} value={industry.value}>
                                {industry.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Phone Number with Country Code */}
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-900">Phone Number *</FormLabel>
                    <div className="flex gap-2">
                      {/* Country Code Select con banderas SVG */}
                      <FormField
                        control={form.control}
                        name="phoneCountryCode"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-36 h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500">
                                {field.value ? (
                                  <div className="flex items-center gap-2 w-full">
                                    {(() => {
                                      const selected = COUNTRIES.find(c => c.phone === field.value);
                                      return selected ? (
                                        <>
                                          <ReactCountryFlag
                                            svg
                                            countryCode={selected.code}
                                            style={{ width: '1.1em', height: '1.1em' }}
                                            className="rounded-sm flex-shrink-0"
                                            title={selected.name}
                                          />
                                          <span className="font-medium text-sm">{selected.phone}</span>
                                        </>
                                      ) : (
                                        <span className="text-sm">{field.value}</span>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <SelectValue placeholder="Select code" />
                                )}
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-60">
                              {(() => {
                                const uniquePhoneCodes = new Map();
                                COUNTRIES.forEach((country) => {
                                  if (!uniquePhoneCodes.has(country.phone)) {
                                    uniquePhoneCodes.set(country.phone, country);
                                  }
                                });
                                return Array.from(uniquePhoneCodes.values())
                                  .sort((a, b) => a.phone.localeCompare(b.phone))
                                  .map((country) => (
                                  <SelectItem key={`phone-${country.code}`} value={country.phone}>
                                    <div className="flex items-center gap-2">
                                      <ReactCountryFlag
                                        svg
                                        countryCode={country.code}
                                        style={{ width: '1.1em', height: '1.1em' }}
                                        className="rounded-sm"
                                        title={country.name}
                                      />
                                      <span className="font-medium">{country.phone}</span>
                                      <span className="text-gray-500 text-sm truncate">{country.name}</span>
                                    </div>
                                  </SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                        )}
                      />

                      {/* Phone Number Input */}
                      <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => {
                          const selectedCountryCode = form.watch('phoneCountryCode');
                          const phoneExamples: { [key: string]: string } = {
                            '+54': '11 1234-5678',
                            '+1': '555-123-4567',
                            '+44': '20 7123 4567',
                            '+33': '01 42 12 34 56',
                            '+49': '30 12345678',
                            '+86': '138 0013 8000',
                            '+81': '90-1234-5678',
                            '+91': '98765 43210',
                            '+55': '11 98765-4321',
                            '+34': '612 34 56 78',
                            '+61': '0412 345 678',
                            '+7':  '495 123-45-67',
                            '+82': '02-1234-5678',
                            '+39': '06 1234 5678',
                            '+52': '55 1234 5678',
                          };
                          return (
                            <FormControl>
                              <Input
                                placeholder={phoneExamples[selectedCountryCode] || 'Enter phone number'}
                                className="flex-1 h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500"
                                {...field}
                              />
                            </FormControl>
                          );
                        }}
                      />
                    </div>
                    {/* Errores de validación */}
                    <div className="space-y-1">
                      {form.formState.errors.phoneCountryCode && (
                        <p className="text-sm text-red-500">{form.formState.errors.phoneCountryCode.message}</p>
                      )}
                      {form.formState.errors.phoneNumber && (
                        <p className="text-sm text-red-500">{form.formState.errors.phoneNumber.message}</p>
                      )}
                    </div>
                  </FormItem>
                </div>

                {/* Country */}
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-900">Country *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500">
                            <SelectValue placeholder="Select country">
                              {field.value && (() => {
                                const selectedCountry = COUNTRIES.find(c => c.name === field.value);
                                return selectedCountry ? (
                                  <div className="flex items-center gap-2">
                                    <ReactCountryFlag
                                      svg
                                      countryCode={selectedCountry.code}
                                      style={{ width: '1.1em', height: '1.1em' }}
                                      className="rounded-sm"
                                      title={selectedCountry.name}
                                    />
                                    <span>{selectedCountry.name}</span>
                                  </div>
                                ) : field.value;
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country.code} value={country.name}>
                              <div className="flex items-center gap-2">
                                <ReactCountryFlag
                                  svg
                                  countryCode={country.code}
                                  style={{ width: '1.1em', height: '1.1em' }}
                                  className="rounded-sm"
                                  title={country.name}
                                />
                                <span>{country.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Address */}
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-900">Address</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Full business address including postal/zip code" 
                          {...field} 
                          className="min-h-[80px] border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Contact Email and Company Website */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Contact Email *</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="contact@company.com" 
                            {...field} 
                            className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Company Website</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://www.example.com" 
                            {...field} 
                            className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Tax/VAT Number and Entity Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="taxNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Tax/VAT Number <span className="text-gray-400 font-normal">(Optional)</span></FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Tax identification number" 
                            {...field} 
                            className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="entityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-900">Entity Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500">
                              <SelectValue placeholder="Select entity type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {entityTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Company Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-900">Company Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief description of your business activities" 
                          {...field} 
                          className="min-h-[100px] border-gray-200 focus:border-teal-500 focus:ring-teal-500" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Terms and Conditions */}
                <FormField
                  control={form.control}
                  name="acceptTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm">
                          I accept the terms and conditions *
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          By checking this box, you agree to our{" "}
                          <a href="/legal" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                            terms of service and privacy policy
                          </a>
                          .
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Submit Button */}
                <div className="pt-4">
                  <Button 
                    type="submit" 
                    disabled={companyProfileMutation.isPending}
                    className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md transition-colors"
                  >
                    {companyProfileMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating Profile...
                      </>
                    ) : (
                      'Complete Registration'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}