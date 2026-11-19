export const BRAND = {
  name: "CareKosh",
  descriptor: "Home ICU Inventory",
  fullName: "CareKosh — Home ICU Inventory",
  browserTitle: "CareKosh — Home ICU Inventory",
  tagline: "Your home care supplies, organized.",
  siteOrigin:
    import.meta.env.VITE_APP_ENV === "production"
      ? "https://carekosh.com"
      : import.meta.env.VITE_APP_ENV === "staging"
        ? "https://staging.carekosh.com"
        : "http://127.0.0.1:5175",
} as const;
