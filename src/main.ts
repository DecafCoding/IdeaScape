/**
 * Front-end entry. The token layer loads before any component style, and the vendored
 * fonts and icons load before either, so nothing paints in a fallback face.
 */
import './lib/fonts.css';
import './lib/icons.css';
import './lib/tokens.css';
import './lib/theme.css';
import './app.css';

import { mount } from 'svelte';
import App from './app.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('the application root element is missing from index.html');

export default mount(App, { target });
