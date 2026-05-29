/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "staticmap.openstreetmap.de",
        pathname: "/**",
      },
    ],
  },
};

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      // CORRECTED: Use a RegExp for the urlPattern to avoid build errors.
      {
        urlPattern: /^\/api\/manifest$/,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts",
          expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /^https:\/\/.*\.googleapis\.com\/(?!.*firestore).*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "google-apis",
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
    ],
  },
});

module.exports = withPWA(nextConfig);
