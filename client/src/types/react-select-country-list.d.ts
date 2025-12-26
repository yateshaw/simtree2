declare module 'react-select-country-list' {
  export interface CountryData {
    label: string;
    value: string;
    flag?: string;
    phoneCode?: string;
  }

  export default function countryList(): {
    getData: () => CountryData[];
    getLabel: (value: string) => string;
    getValue: (label: string) => string;
  };
}