/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse reads files at import time; keep it out of the server bundle.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'nodemailer'],
  },
};

module.exports = nextConfig;
