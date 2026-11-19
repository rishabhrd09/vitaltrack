try { document.documentElement.dataset.theme = localStorage.getItem('carekosh-theme') === 'light' ? 'light' : 'dark'; } catch { /* Private browsing retains the dark default. */ }
