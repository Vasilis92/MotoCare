import { createRoot } from 'react-dom/client';
import App from './ui/App'; // <-- matches your folder

createRoot(document.getElementById('root')!).render(<App />);
