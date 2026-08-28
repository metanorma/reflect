/**
 * Bootstrap for the minimap test harness page (§15.3).
 *
 * Loads the harness styles and wires the page-global test API
 * (`window.__mnMount` etc. — see `page.tsx`). No auto-mount: every test
 * mounts its own configuration, so the page starts blank and each spec's
 * initial state is explicit in the test itself.
 */
import './styles.css';
import { initHarness } from './page.js';

initHarness(window);
