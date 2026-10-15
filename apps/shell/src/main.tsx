import { initDevModules } from '@/dev/hmr';
import { setDevModules } from '@/stores/tabs';
import { applyTheme, useTheme } from '@/stores/theme';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, initApp } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

initApp();
setDevModules(initDevModules());
applyTheme(useTheme.getState().mode);

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>
);
console.log('[shell] booted, env:', import.meta.env.MODE);
