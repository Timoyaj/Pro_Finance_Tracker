class ThemeManager {
    constructor() {
        this.isDark = false;
        this.init();
    }

    init() {
        // Check saved preference
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        this.setTheme(savedTheme === 'dark' || (!savedTheme && prefersDark));
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('theme')) {
                this.setTheme(e.matches);
            }
        });
    }

    setTheme(isDark) {
        this.isDark = isDark;
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        // Update charts if they exist
        if (window.updateChartsTheme) {
            window.updateChartsTheme();
        }
    }

    toggle() {
        this.setTheme(!this.isDark);
    }
}

// Initialize theme manager
window.themeManager = new ThemeManager();
