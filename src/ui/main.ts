import { initI18n } from '../i18n';
import { mountApp } from './mountApp';

// Single entry: the converter runs in the persistent window opened by the
// background worker (app.html). Strings follow the browser language.
document.body.classList.add('is-tab');
void initI18n().then(() => mountApp(document.getElementById('app')!));
