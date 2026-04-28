import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import commonEn from '../locales/en/common.json';
import pagesEn from '../locales/en/pages.json';
import componentsEn from '../locales/en/components.json';
import infoEn from '../locales/en/info.json';

// Debug: Log the techStack keys to verify they're loaded
console.log('i18n Debug: techStack keys loaded:', Object.keys(pagesEn.techStack || {}));
console.log('i18n Debug: Has clear key:', 'clear' in (pagesEn.techStack || {}));
console.log('i18n Debug: Has frameworks key:', 'frameworks' in (pagesEn.techStack || {}));

// Translation resources
const resources = {
  en: {
    common: commonEn,
    pages: pagesEn,
    components: componentsEn,
    info: infoEn
  }
};

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    
    // Default namespace
    defaultNS: 'common',
    
    // Namespace separator
    nsSeparator: ':',
    
    // Key separator
    keySeparator: '.',
    
    interpolation: {
      escapeValue: false // react already does escaping
    },
    
    // Development options
    debug: true, // Enable debug mode to see what's happening
    
    // React options
    react: {
      useSuspense: false // disable suspense for now
    }
  });

export default i18n;