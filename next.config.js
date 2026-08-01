/** @type {import('next').NextConfig} */
module.exports = {
  basePath: process.env.BASE_PATH || '',
  output: 'standalone',
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || '',
  },
}
