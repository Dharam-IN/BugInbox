import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.tsx';
import { AuthProvider } from './auth.tsx';
import { ThemeProvider } from './theme.tsx';
import './styles.css';
import './site.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
