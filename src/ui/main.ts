import { mountApp } from './mountApp';

// Single entry: the converter runs in the persistent window opened by the
// background worker (app.html).
document.body.classList.add('is-tab');
mountApp(document.getElementById('app')!);
