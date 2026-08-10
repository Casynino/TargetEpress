/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Cargo photo uploads and bulk batch actions travel through server actions.
    serverActions: {
      // Vercel refuses a serverless request body over 4.5 MB and no setting
      // raises it, so anything above this was a promise the platform breaks —
      // the request dies at the edge and the action never runs, which is why
      // the failure surfaced as "Something went wrong" with nothing saved.
      // Photos are shrunk in the browser before they get here; see PhotoCapture.
      bodySizeLimit: "4mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // Cargo photos and proof-of-delivery images live in Vercel Blob.
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
