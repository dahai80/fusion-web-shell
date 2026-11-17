import '@/styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

console.log('[review] booted');

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
