/**
 * Renderer Process Application Entry.
 */

import './styles/theme.css';
import './styles/layout.css';
import { AppShell } from './components/app-shell.js';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    new AppShell(root);
  }
});
