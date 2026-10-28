// Instellingen voor accounts. Kies één backend:
//
//  'geen'       = geen accounts (standaard): voortgang blijft op het apparaat; meenemen via Gist of overdraag-code onder Meer.
//  'pocketbase' = zelf hosten (Docker op bijv. Unraid). De container serveert ook de site, dus PB_URL mag leeg blijven.
//                 Staat de site elders (bijv. GitHub Pages), vul dan het https-adres van je server in bij PB_URL.
//  'supabase'   = gehoste database van Supabase (zie README).
//
// Alle waarden hieronder zijn bedoeld om openbaar te zijn. Zet hier nooit wachtwoorden of 'service_role'-sleutels in.
export const BACKEND = 'geen';           // de Docker-image zet dit zelf op 'pocketbase'

export const PB_URL = '';                                   // leeg = dezelfde server als de website

export const SUPABASE_URL = 'https://JOUW-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'JOUW-ANON-PUBLIC-KEY';

// Contactadres dat in de privacyverklaring staat (voor vragen en verzoeken om gegevens te verwijderen).
export const CONTACT_EMAIL = 'jouw@emailadres.nl';
