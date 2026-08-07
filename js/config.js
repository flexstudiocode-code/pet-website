/* ==========================================================================
   Paw & Glow — Site configuration
   ==========================================================================
   This is the ONLY file you need to edit when setting up the site for a
   new client. Fill in the business details below, upload the site, done.
   ========================================================================== */

var SITE_CONFIG = {

  /* Business name (used in booking messages) */
  name: "Paw & Glow",

  /* Short tagline shown in the footer */
  tagline: "Gentle, modern grooming for dogs and cats in Kochi, Kerala.",

  /* City used in the footer line "Made with care in Kochi." */
  city: "Kochi",

  /* ---------- Contact details ---------- */

  /* WhatsApp number for bookings — digits only, with country code.
     Booking form reservations arrive here as a WhatsApp chat. */
  whatsappNumber: "919847001234",

  /* Phone number displayed on the site (any format) */
  phoneDisplay: "+91 98470 01234",

  /* Email displayed on the site and used for enquiry buttons */
  email: "hello@pawandglow.co",

  /* Address lines displayed in the Visit section and footer */
  addressLine: "Shop 4, Pearl Plaza, MG Road",
  cityLine: "Kochi, Kerala 682016",

  /* ---------- Schema.org details (for Google search results) ---------- */
  schema: {
    streetAddress: "Shop 4, Pearl Plaza, MG Road",
    addressLocality: "Kochi",
    addressRegion: "Kerala",
    postalCode: "682016"
  },

  /* ---------- Demo Base/Pro website toggle ----------
     Set demoMode to false when going live to hide the Base/Pro
     floating toggle. */
  demoMode: true,

  /* Initial website tier shown to visitors: "base" or "pro" */
  tier: "base"
};
