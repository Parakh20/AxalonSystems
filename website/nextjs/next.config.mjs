/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  output: 'standalone',
  // TEMPORARY: serve the static landing page (public/site/index.html) at "/".
  // To restore the 3D scroll site, delete this rewrites() block and public/site/.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/site/index.html' },
      ],
    }
  },
}

export default nextConfig
