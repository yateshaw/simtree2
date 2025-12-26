import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Globe } from "lucide-react";
import type { EsimPlan } from "@shared/schema";

interface GeographicAnalysisCardProps {
  purchasedEsims: any[];
  plans: EsimPlan[];
  title?: string;
}

export default function GeographicAnalysisCard({ purchasedEsims = [], plans = [], title }: GeographicAnalysisCardProps) {
  // Define the country mapping - comprehensive list of countries by ISO code
  const countryMap: Record<string, string> = {
    // Europe
    'AD': 'Andorra',
    'AL': 'Albania',
    'AT': 'Austria',
    'BA': 'Bosnia and Herzegovina',
    'BE': 'Belgium',
    'BG': 'Bulgaria',
    'BY': 'Belarus',
    'CH': 'Switzerland',
    'CY': 'Cyprus',
    'CZ': 'Czech Republic',
    'DE': 'Germany',
    'DK': 'Denmark',
    'EE': 'Estonia',
    'ES': 'Spain',
    'FI': 'Finland',
    'FR': 'France',
    'GB': 'United Kingdom',
    'UK': 'United Kingdom',
    'GR': 'Greece',
    'HR': 'Croatia',
    'HU': 'Hungary',
    'IE': 'Ireland',
    'IS': 'Iceland',
    'IT': 'Italy',
    'LI': 'Liechtenstein',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'LV': 'Latvia',
    'MC': 'Monaco',
    'MD': 'Moldova',
    'ME': 'Montenegro',
    'MK': 'North Macedonia',
    'MT': 'Malta',
    'NL': 'Netherlands',
    'NO': 'Norway',
    'PL': 'Poland',
    'PT': 'Portugal',
    'RO': 'Romania',
    'RS': 'Serbia',
    'RU': 'Russia',
    'SE': 'Sweden',
    'SI': 'Slovenia',
    'SK': 'Slovakia',
    'SM': 'San Marino',
    'UA': 'Ukraine',
    'VA': 'Vatican City',
    
    // Asia
    'AE': 'United Arab Emirates',
    'AF': 'Afghanistan',
    'AM': 'Armenia',
    'AZ': 'Azerbaijan',
    'BD': 'Bangladesh',
    'BH': 'Bahrain',
    'BN': 'Brunei',
    'BT': 'Bhutan',
    'CN': 'China',
    'GE': 'Georgia',
    'HK': 'Hong Kong',
    'ID': 'Indonesia',
    'IL': 'Israel',
    'IN': 'India',
    'IQ': 'Iraq',
    'IR': 'Iran',
    'JO': 'Jordan',
    'JP': 'Japan',
    'KG': 'Kyrgyzstan',
    'KH': 'Cambodia',
    'KP': 'North Korea',
    'KR': 'South Korea',
    'KW': 'Kuwait',
    'KZ': 'Kazakhstan',
    'LA': 'Laos',
    'LB': 'Lebanon',
    'LK': 'Sri Lanka',
    'MM': 'Myanmar',
    'MN': 'Mongolia',
    'MO': 'Macao',
    'MV': 'Maldives',
    'MY': 'Malaysia',
    'NP': 'Nepal',
    'OM': 'Oman',
    'PH': 'Philippines',
    'PK': 'Pakistan',
    'PS': 'Palestine',
    'QA': 'Qatar',
    'SA': 'Saudi Arabia',
    'SG': 'Singapore',
    'SY': 'Syria',
    'TH': 'Thailand',
    'TJ': 'Tajikistan',
    'TL': 'Timor-Leste',
    'TM': 'Turkmenistan',
    'TR': 'Turkey',
    'TW': 'Taiwan',
    'UZ': 'Uzbekistan',
    'VN': 'Vietnam',
    'YE': 'Yemen',
    
    // North America
    'AG': 'Antigua and Barbuda',
    'BB': 'Barbados',
    'BS': 'Bahamas',
    'BZ': 'Belize',
    'CA': 'Canada',
    'CR': 'Costa Rica',
    'CU': 'Cuba',
    'DM': 'Dominica',
    'DO': 'Dominican Republic',
    'GD': 'Grenada',
    'GT': 'Guatemala',
    'HN': 'Honduras',
    'HT': 'Haiti',
    'JM': 'Jamaica',
    'KN': 'Saint Kitts and Nevis',
    'LC': 'Saint Lucia',
    'MX': 'Mexico',
    'NI': 'Nicaragua',
    'PA': 'Panama',
    'PR': 'Puerto Rico',
    'SV': 'El Salvador',
    'TT': 'Trinidad and Tobago',
    'US': 'United States',
    'VC': 'Saint Vincent and the Grenadines',
    
    // South America
    'AR': 'Argentina',
    'BO': 'Bolivia',
    'BR': 'Brazil',
    'CL': 'Chile',
    'CO': 'Colombia',
    'EC': 'Ecuador',
    'GY': 'Guyana',
    'PE': 'Peru',
    'PY': 'Paraguay',
    'SR': 'Suriname',
    'UY': 'Uruguay',
    'VE': 'Venezuela',
    
    // Africa
    'AO': 'Angola',
    'BF': 'Burkina Faso',
    'BI': 'Burundi',
    'BJ': 'Benin',
    'BW': 'Botswana',
    'CD': 'Democratic Republic of the Congo',
    'CF': 'Central African Republic',
    'CG': 'Republic of the Congo',
    'CI': 'Ivory Coast',
    'CM': 'Cameroon',
    'CV': 'Cape Verde',
    'DJ': 'Djibouti',
    'DZ': 'Algeria',
    'EG': 'Egypt',
    'ER': 'Eritrea',
    'ET': 'Ethiopia',
    'GA': 'Gabon',
    'GH': 'Ghana',
    'GM': 'Gambia',
    'GN': 'Guinea',
    'GQ': 'Equatorial Guinea',
    'GW': 'Guinea-Bissau',
    'KE': 'Kenya',
    'LR': 'Liberia',
    'LS': 'Lesotho',
    'LY': 'Libya',
    'MA': 'Morocco',
    'MG': 'Madagascar',
    'ML': 'Mali',
    'MR': 'Mauritania',
    'MU': 'Mauritius',
    'MW': 'Malawi',
    'MZ': 'Mozambique',
    'NA': 'Namibia',
    'NE': 'Niger',
    'NG': 'Nigeria',
    'RW': 'Rwanda',
    'SC': 'Seychelles',
    'SD': 'Sudan',
    'SL': 'Sierra Leone',
    'SN': 'Senegal',
    'SO': 'Somalia',
    'SS': 'South Sudan',
    'ST': 'Sao Tome and Principe',
    'SZ': 'Eswatini',
    'TD': 'Chad',
    'TG': 'Togo',
    'TN': 'Tunisia',
    'TZ': 'Tanzania',
    'UG': 'Uganda',
    'ZA': 'South Africa',
    'ZM': 'Zambia',
    'ZW': 'Zimbabwe',
    
    // Oceania
    'AU': 'Australia',
    'FJ': 'Fiji',
    'FM': 'Micronesia',
    'KI': 'Kiribati',
    'MH': 'Marshall Islands',
    'NR': 'Nauru',
    'NZ': 'New Zealand',
    'PG': 'Papua New Guinea',
    'PW': 'Palau',
    'SB': 'Solomon Islands',
    'TO': 'Tonga',
    'TV': 'Tuvalu',
    'VU': 'Vanuatu',
    'WS': 'Samoa'
  };

  // Extract country codes from purchased eSIMs
  const countryRegionMap: Record<string, string> = {
    // Europe
    'AD': 'Europe', 'AL': 'Europe', 'AT': 'Europe', 'BA': 'Europe', 'BE': 'Europe',
    'BG': 'Europe', 'BY': 'Europe', 'CH': 'Europe', 'CY': 'Europe', 'CZ': 'Europe',
    'DE': 'Europe', 'DK': 'Europe', 'EE': 'Europe', 'ES': 'Europe', 'FI': 'Europe',
    'FR': 'Europe', 'GB': 'Europe', 'UK': 'Europe', 'GR': 'Europe', 'HR': 'Europe',
    'HU': 'Europe', 'IE': 'Europe', 'IS': 'Europe', 'IT': 'Europe', 'LI': 'Europe',
    'LT': 'Europe', 'LU': 'Europe', 'LV': 'Europe', 'MC': 'Europe', 'MD': 'Europe',
    'ME': 'Europe', 'MK': 'Europe', 'MT': 'Europe', 'NL': 'Europe', 'NO': 'Europe',
    'PL': 'Europe', 'PT': 'Europe', 'RO': 'Europe', 'RS': 'Europe', 'RU': 'Europe',
    'SE': 'Europe', 'SI': 'Europe', 'SK': 'Europe', 'SM': 'Europe', 'UA': 'Europe',
    'VA': 'Europe',
    
    // Asia
    'AE': 'Asia', 'AF': 'Asia', 'AM': 'Asia', 'AZ': 'Asia', 'BD': 'Asia',
    'BH': 'Asia', 'BN': 'Asia', 'BT': 'Asia', 'CN': 'Asia', 'GE': 'Asia',
    'HK': 'Asia', 'ID': 'Asia', 'IL': 'Asia', 'IN': 'Asia', 'IQ': 'Asia',
    'IR': 'Asia', 'JO': 'Asia', 'JP': 'Asia', 'KG': 'Asia', 'KH': 'Asia',
    'KP': 'Asia', 'KR': 'Asia', 'KW': 'Asia', 'KZ': 'Asia', 'LA': 'Asia',
    'LB': 'Asia', 'LK': 'Asia', 'MM': 'Asia', 'MN': 'Asia', 'MO': 'Asia',
    'MV': 'Asia', 'MY': 'Asia', 'NP': 'Asia', 'OM': 'Asia', 'PH': 'Asia',
    'PK': 'Asia', 'PS': 'Asia', 'QA': 'Asia', 'SA': 'Asia', 'SG': 'Asia',
    'SY': 'Asia', 'TH': 'Asia', 'TJ': 'Asia', 'TL': 'Asia', 'TM': 'Asia',
    'TR': 'Asia', 'TW': 'Asia', 'UZ': 'Asia', 'VN': 'Asia', 'YE': 'Asia',
    
    // North America
    'AG': 'North America', 'BB': 'North America', 'BS': 'North America', 'BZ': 'North America',
    'CA': 'North America', 'CR': 'North America', 'CU': 'North America', 'DM': 'North America',
    'DO': 'North America', 'GD': 'North America', 'GT': 'North America', 'HN': 'North America',
    'HT': 'North America', 'JM': 'North America', 'KN': 'North America', 'LC': 'North America',
    'MX': 'North America', 'NI': 'North America', 'PA': 'North America', 'PR': 'North America',
    'SV': 'North America', 'TT': 'North America', 'US': 'North America', 'VC': 'North America',
    
    // South America
    'AR': 'South America', 'BO': 'South America', 'BR': 'South America', 'CL': 'South America',
    'CO': 'South America', 'EC': 'South America', 'GY': 'South America', 'PE': 'South America',
    'PY': 'South America', 'SR': 'South America', 'UY': 'South America', 'VE': 'South America',
    
    // Africa
    'AO': 'Africa', 'BF': 'Africa', 'BI': 'Africa', 'BJ': 'Africa', 'BW': 'Africa',
    'CD': 'Africa', 'CF': 'Africa', 'CG': 'Africa', 'CI': 'Africa', 'CM': 'Africa',
    'CV': 'Africa', 'DJ': 'Africa', 'DZ': 'Africa', 'EG': 'Africa', 'ER': 'Africa',
    'ET': 'Africa', 'GA': 'Africa', 'GH': 'Africa', 'GM': 'Africa', 'GN': 'Africa',
    'GQ': 'Africa', 'GW': 'Africa', 'KE': 'Africa', 'LR': 'Africa', 'LS': 'Africa',
    'LY': 'Africa', 'MA': 'Africa', 'MG': 'Africa', 'ML': 'Africa', 'MR': 'Africa',
    'MU': 'Africa', 'MW': 'Africa', 'MZ': 'Africa', 'NA': 'Africa', 'NE': 'Africa',
    'NG': 'Africa', 'RW': 'Africa', 'SC': 'Africa', 'SD': 'Africa', 'SL': 'Africa',
    'SN': 'Africa', 'SO': 'Africa', 'SS': 'Africa', 'ST': 'Africa', 'SZ': 'Africa',
    'TD': 'Africa', 'TG': 'Africa', 'TN': 'Africa', 'TZ': 'Africa', 'UG': 'Africa',
    'ZA': 'Africa', 'ZM': 'Africa', 'ZW': 'Africa',
    
    // Oceania
    'AU': 'Oceania', 'FJ': 'Oceania', 'FM': 'Oceania', 'KI': 'Oceania', 'MH': 'Oceania',
    'NR': 'Oceania', 'NZ': 'Oceania', 'PG': 'Oceania', 'PW': 'Oceania', 'SB': 'Oceania',
    'TO': 'Oceania', 'TV': 'Oceania', 'VU': 'Oceania', 'WS': 'Oceania'
  };
  
  // Get active eSIMs only
  const activeEsims = purchasedEsims.filter((esim: any) => 
    esim.status !== 'cancelled' && esim.status !== 'refunded'
  );
  
  // Extract region data
  const regionData: Record<string, number> = {
    'Europe': 0,
    'North America': 0,
    'Asia': 0,
    'South America': 0,
    'Africa': 0,
    'Oceania': 0,
    'Other': 0
  };
  
  // Extract country data
  const countriesData: Record<string, { count: number, name: string }> = {};
  
  // Using the metadata for each eSIM to get country information
  activeEsims.forEach((esim: any) => {
    // Get country code from the plan or metadata
    let countryCode = '';
    
    // First check if there's package metadata with location code
    const locationCode = esim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.locationCode;
    if (locationCode) {
      // Convert lowercase country codes to uppercase for consistent mapping
      countryCode = locationCode.toUpperCase();
      
      // Special handling for common lowercase codes in data
      if (locationCode === 'no') countryCode = 'NO'; 
      if (locationCode === 'gr') countryCode = 'GR';
      if (locationCode === 'hk') countryCode = 'HK';
    }
    
    // If no country from metadata package, try from the plan
    if (!countryCode && esim && esim.planId) {
      const plan = plans.find(p => p.id === esim.planId);
      if (plan && plan.countries && plan.countries.length > 0) {
        countryCode = plan.countries[0].toUpperCase(); // Use first country
      }
    }
    
    // As a fallback, try to extract from package name if available
    if (!countryCode) {
      let packageName = esim.metadata?.rawData?.obj?.esimList?.[0]?.packageList?.[0]?.packageName || '';
      
      if (packageName) {
        // Special handling for common package name formats
        if (packageName.startsWith('Norway')) countryCode = 'NO';
        else if (packageName.startsWith('Greece')) countryCode = 'GR';
        else if (packageName.startsWith('Hong Kong')) countryCode = 'HK';
        else {
          // General pattern match
          const countryMatch = packageName.match(/^([A-Za-z\s]+)\s[\d\.]+[A-Za-z]+/);
          if (countryMatch && countryMatch[1]) {
            const foundCountry = countryMatch[1].trim();
            
            // Use the country name from the package name if it's a known country
            const countryEntry = Object.entries(countryMap).find(([code, name]) => 
              name.toLowerCase() === foundCountry.toLowerCase()
            );
            
            if (countryEntry) {
              countryCode = countryEntry[0];
            }
          }
        }
      }
    }
    
    // Check for country code patterns in other fields
    if (!countryCode && esim.metadata?.rawData?.obj?.esimList?.[0]?.ipExport) {
      const ipExport = esim.metadata.rawData.obj.esimList[0].ipExport;
      
      // Handle compound codes like "UK/NO"
      if (ipExport.includes('/')) {
        // Just use the first country in the list
        countryCode = ipExport.split('/')[0];
      } else {
        countryCode = ipExport;
      }
    }
    
    // If we found a valid country code, add it to our data
    if (countryCode) {
      const region = countryRegionMap[countryCode] || 'Other';
      regionData[region] = (regionData[region] || 0) + 1;
      
      // Ensure we have a proper country name (not lowercase code)
      const countryName = countryMap[countryCode] || countryCode;
      
      if (!countriesData[countryCode]) {
        countriesData[countryCode] = { count: 0, name: countryName };
      }
      
      countriesData[countryCode].count += 1;
    }
  });
  
  // Calculate percentages for each region
  const regions = ['Europe', 'Asia', 'North America', 'South America', 'Africa', 'Oceania', 'Other'];
  const regionTotal = Object.values(regionData).reduce((sum, count) => sum + count, 0);
  
  // Create regional distribution, showing zeros when all plans are cancelled
  let regionalDistribution = regions.map(region => ({
    name: region,
    count: regionData[region] || 0,
    percentage: activeEsims.length > 0 && regionTotal > 0 ? 
      Math.round(((regionData[region] || 0) / regionTotal) * 100) : 0
  }));
      
  // Only adjust percentages if we have active eSIMs
  if (activeEsims.length > 0 && regionTotal > 0) {
    // Calculate the sum of all percentages
    const totalPercentage = regionalDistribution.reduce((sum, region) => sum + region.percentage, 0);
    
    // If not 100%, adjust the largest region to make it add up to 100%
    if (totalPercentage !== 100 && totalPercentage > 0) {
      // Find the region with highest count to adjust
      const largestRegionIndex = regionalDistribution
        .map((r, index) => ({ index, count: r.count }))
        .sort((a, b) => b.count - a.count)[0].index;
      
      // Adjust the percentage of the largest region
      const adjustment = 100 - totalPercentage;
      regionalDistribution[largestRegionIndex].percentage += adjustment;
    }
  }
  
  // Sort and take top 6 countries
  const topCountries = Object.values(countriesData)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  
  // Post-processing to fix any country names that might not be properly mapped
  const processedCountries = topCountries.map(country => {
    // Special handling for any problematic country codes that might appear
    if (country.name === 'no') return { ...country, name: 'Norway' };
    if (country.name === 'gr') return { ...country, name: 'Greece' };
    if (country.name === 'hk') return { ...country, name: 'Hong Kong' };
    
    return country;
  });
  
  // If we have active eSIMs, show actual countries, otherwise leave empty
  const displayCountries = activeEsims.length > 0 ? processedCountries : [];
  
  // Always zero when all eSIMs are cancelled
  const countryTotal = displayCountries.reduce((sum, country) => sum + country.count, 0);
  
  return (
    <Card className="shadow-md overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-gray-50 to-blue-50 pb-3">
        <CardTitle className="flex items-center gap-2 text-gray-800">
          <Globe className="h-5 w-5 text-blue-600" />
          {title || "eSIM Geographic Analysis"}
        </CardTitle>
        <p className="text-sm text-gray-500">Based on purchased eSIMs data</p>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="space-y-4">
          {/* Regional Distribution Visualization */}
          <div className="grid grid-cols-3 gap-4">
            {regionalDistribution.slice(0, 6).map((region, idx) => (
              <div key={region.name} className="flex flex-col">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{region.name}</span>
                  <span className="text-gray-500">{region.percentage}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className={idx === 0 ? "h-2 rounded-full bg-blue-500" : 
                              idx === 1 ? "h-2 rounded-full bg-indigo-500" : 
                              idx === 2 ? "h-2 rounded-full bg-cyan-500" : 
                              idx === 3 ? "h-2 rounded-full bg-emerald-500" : 
                              idx === 4 ? "h-2 rounded-full bg-amber-500" : 
                                        "h-2 rounded-full bg-purple-500"}
                    style={{ width: `${region.percentage || 0}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
          
          {/* Top Countries - only show when there are active plans */}
          <div className="mt-8">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Top Countries</h4>
            {displayCountries.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {displayCountries.map((country, idx) => (
                  <div key={country.name} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="flex-shrink-0 h-3 w-3 rounded-full mr-2 bg-gradient-to-r from-blue-300 to-indigo-400"></span>
                      <span className="text-sm text-gray-700">{country.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {countryTotal > 0 ? Math.round((country.count / countryTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                <Globe className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No active eSIMs to analyze</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}