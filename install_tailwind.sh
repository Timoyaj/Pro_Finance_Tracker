#!/bin/bash

# Install Tailwind CSS
npm install -D tailwindcss
npx tailwindcss init

# Create the input CSS file
echo "@tailwind base;
@tailwind components;
@tailwind utilities;" > static/src/input.css

# Create the Tailwind config
echo "module.exports = {
  content: ['./templates/**/*.html'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}" > tailwind.config.js

# Build the CSS
npx tailwindcss -i static/src/input.css -o static/tailwind.css --minify
