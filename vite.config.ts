import { defineConfig } from 'vite';

export default defineConfig({
  // The dot-slash ./ is the magic fix. 
  // It tells the browser "look for files in the current folder"
  // instead of "look at the root of the website".
  base: './' 
});