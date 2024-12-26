// =============== 1. Error Handlers and Utilities ===============
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showNotification('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showNotification('An unexpected error occurred', 'error');
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function batchDOMUpdates(updates) {
    return new Promise(resolve => {
        requestIdleCallback(() => {
            requestAnimationFrame(() => {
                updates();
                resolve();
            });
        });
    });
}

// =============== 2. Modal Helper Functions ===============
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        modal.dispatchEvent(new Event('hidden'));
    }
}

// =============== 3. Initialize UI Components ===============
function initializeModals() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        // Get elements
        const overlay = modal.querySelector('.modal-overlay');
        const container = modal.querySelector('.modal-container');
        const closeButtons = modal.querySelectorAll('.modal-close');
        const form = modal.querySelector('form');

        // Close on overlay click
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(modal.id);
            }
        });

        // Prevent modal close when clicking modal content
        container?.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Close button handlers
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                closeModal(modal.id);
            });
        });

        // Reset form on close
        if (form) {
            modal.addEventListener('hidden', () => {
                form.reset();
            });
        }
    });

    // Open modal triggers
    document.getElementById('add-transaction-btn')?.addEventListener('click', () => {
        openModal('transaction-modal');
    });

    document.getElementById('set-budget-btn')?.addEventListener('click', () => {
        openModal('budget-modal');
    });

    document.getElementById('savings-goals-btn')?.addEventListener('click', () => {
        openModal('goal-modal');
    });
}

function initializeSidebar() {
    const sidebarButton = document.getElementById('mobile-menu-button');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    sidebarButton?.addEventListener('click', () => {
        sidebar?.classList.remove('-translate-x-full');
        sidebarOverlay?.classList.remove('hidden');
    });

    sidebarOverlay?.addEventListener('click', () => {
        sidebar?.classList.add('-translate-x-full');
        sidebarOverlay?.classList.add('hidden');
    });
}

// =============== 4. State and DOM Elements ===============
const state = {
    transactions: [],
    filters: {
        category: '',
        dateFrom: '',
        dateTo: ''
    },
    analytics: null,
    isDarkMode: false,
    chartPeriod: 'monthly',
    charts: {
        spending: null,
        category: null
    }
};

const elements = {
    addTransactionBtn: document.getElementById('add-transaction-btn'),
    transactionModal: document.getElementById('transaction-modal'),
    cancelTransactionBtn: document.getElementById('cancel-transaction'),
    transactionForm: document.getElementById('transaction-form'),
    transactionsList: document.getElementById('transactions-list'),
    userMenu: document.getElementById('user-menu'),
    userDropdown: document.getElementById('user-dropdown'),
    themeToggle: document.getElementById('theme-toggle'),
    filterForm: document.getElementById('filter-form'),
    exportBtn: document.getElementById('export-btn'),
    exportFormatSelect: document.getElementById('export-format'),
    analyticsContainer: document.getElementById('analytics-container')
};

// =============== 5. Core Functions ===============
// Utility Functions
function formatCurrency(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatPercentage(value, decimals = 1) {
    if (typeof value !== 'number' || isNaN(value)) {
        return '0%';
    }
    return `${value.toFixed(decimals)}%`;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.style.transform = 'translateY(100%)';
    notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white notification-slide ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    notification.textContent = message;

    batchDOMUpdates(() => {
        container.appendChild(notification);
        requestAnimationFrame(() => {
            notification.style.transform = 'translateY(0)';
        });
    });

    const timeoutId = setTimeout(() => {
        requestIdleCallback(() => {
            notification.style.transform = 'translateY(100%)';
            notification.addEventListener('transitionend', () => {
                notification.remove();
            }, { once: true });
        });
    }, 3000);

    return () => {
        clearTimeout(timeoutId);
        notification.remove();
    };
}

const style = document.createElement('style');
style.textContent = `
    .notification-slide {
        transition: transform 0.3s ease-out;
        will-change: transform;
    }
`;
document.head.appendChild(style);

// Data Loading Functions
async function loadDashboardData() {
    try {
        console.log('Starting dashboard data load...');

        const [transactionsRes, analyticsRes, budgetsRes, goalsRes] = await Promise.all([
            fetch('/api/transactions'),
            fetch('/api/analytics'),
            fetch('/api/budgets'),
            fetch('/api/savings-goals')
        ]);

        const transactions = await transactionsRes.json();
        const analytics = await analyticsRes.json();

        if (transactionsRes.ok) {
            updateTransactions(transactions);
        }

        if (analyticsRes.ok) {
            state.analytics = analytics; // Store analytics data
            updateMetrics(analytics);
            updateCharts(analytics);
        }

        if (budgetsRes.ok) {
            const budgets = await budgetsRes.json();
            updateBudgets(budgets);
        }

        if (goalsRes.ok) {
            const goals = await goalsRes.json();
            updateGoals(goals);
        }

    } catch (error) {
        console.error('Dashboard load error:', error);
        showNotification('Error loading dashboard data: ' + error.message, 'error');
        throw error; // Re-throw the error for retry logic
    }
}

async function loadDashboardWithRetry(retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            await loadDashboardData();
            return; // Success, exit the retry loop
        } catch (error) {
            console.error(`Dashboard load attempt ${i + 1} failed.`, error);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5; // Exponential backoff
            }
        }
    }
    showNotification('Failed to load dashboard data after multiple retries.', 'error');
}

// Update Functions
function updateTransactions(transactions) {
    if (!transactions?.length) return;

    const list = document.getElementById('transactions-list');
    if (!list) return;

    const fragment = document.createDocumentFragment();
    const template = document.createElement('template');

    const html = transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6)
        .map(t => `
            <div class="transaction-item flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-3">
                    <div class="transaction-icon ${t.amount > 0 ? 'income' : 'expense'}"></div>
                    <div class="transaction-details">
                        <h4 class="font-semibold">${t.description}</h4>
                        <span class="text-sm text-gray-500">
                            ${new Date(t.date).toLocaleDateString()} · ${t.category}
                        </span>
                    </div>
                </div>
                <span class="transaction-amount ${t.amount > 0 ? 'text-green-500' : 'text-red-500'}">
                    ${formatCurrency(t.amount)}
                </span>
            </div>
        `).join('');

    batchDOMUpdates(() => {
        template.innerHTML = html;
        fragment.appendChild(template.content);
        list.innerHTML = '';
        list.appendChild(fragment);
    });
}

function updateMetrics(analytics) {
    if (!analytics?.monthly_trends) {
        setDefaultMetrics();
        return;
    }

    const currentMonth = Object.keys(analytics.monthly_trends).pop();
    const monthData = analytics.monthly_trends[currentMonth] || { income: 0, expenses: 0 };

    const totalIncome = Number(monthData.income) || 0;
    const totalExpenses = Number(monthData.expenses) || 0;
    const balance = totalIncome - totalExpenses;

    updateMetricValue('total-balance', balance);
    updateMetricValue('total-income', totalIncome);
    updateMetricValue('total-expenses', totalExpenses);

    const prevMonth = Object.keys(analytics.monthly_trends)[Object.keys(analytics.monthly_trends).length - 2];
    if (prevMonth) {
        const prevData = analytics.monthly_trends[prevMonth] || { income: 0, expenses: 0 };
        const prevBalance = (Number(prevData.income) || 0) - (Number(prevData.expenses) || 0);
        const changePercent = prevBalance !== 0 ? ((balance - prevBalance) / Math.abs(prevBalance)) * 100 : 0;

        const balanceChange = document.getElementById('balance-change');
        if (balanceChange) {
            balanceChange.textContent = `${changePercent > 0 ? '+' : ''}${formatPercentage(changePercent)} from last month`;
            balanceChange.className = `text-sm ${changePercent > 0 ? 'text-green-500' : 'text-red-500'}`;
        }
    }
}

function setDefaultMetrics() {
    updateMetricValue('total-balance', 0);
    updateMetricValue('total-income', 0);
    updateMetricValue('total-expenses', 0);

    const balanceChange = document.getElementById('balance-change');
    if (balanceChange) {
        balanceChange.textContent = 'No previous data';
        balanceChange.className = 'text-sm text-gray-500';
    }
}

function updateMetricValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = Number(element.getAttribute('data-value') || 0);
    const endValue = Number(value) || 0;

    element.setAttribute('data-value', endValue);

    animateValue(element, startValue, endValue, 500);
}

function animateValue(element, start, end, duration) {
    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const currentValue = start + (range * progress);
        element.textContent = formatCurrency(currentValue);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function updateBudgets(budgets) {
    const budgetContainer = document.getElementById('budget-categories');
    if (!budgetContainer) return;

    budgetContainer.innerHTML = budgets.map(budget => {
        const percentage = (budget.spent / budget.limit * 100);
        const progressClass = percentage >= 90 ? 'budget-danger' :
                            percentage >= 75 ? 'budget-warning' :
                            'budget-progress-bar';
        const statusColor = percentage >= 90 ? 'text-red-500' :
                          percentage >= 75 ? 'text-yellow-500' :
                          'text-blue-500';

        return `
            <div class="budget-card bg-white p-4 rounded-lg shadow">
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-semibold text-gray-700">${budget.category}</h4>
                    <span class="text-sm font-medium ${statusColor}">${percentage.toFixed(1)}%</span>
                </div>
                <div class="flex justify-between text-sm text-gray-600 mb-2">
                    <span class="formatted-value">${formatCurrency(budget.spent)}</span>
                    <span class="formatted-value">of ${formatCurrency(budget.limit)}</span>
                </div>
                <div class="budget-progress">
                    <div class="${progressClass}" style="width: ${percentage}%"></div>
                </div>
                <p class="text-sm text-gray-500 mt-2">
                    ${getRemainingBudgetText(budget)}
                </p>
            </div>
        `;
    }).join('');
}

function getRemainingBudgetText(budget) {
    const remaining = budget.limit - budget.spent;
    const isOverBudget = remaining < 0;
    const absoluteRemaining = Math.abs(remaining);

    return isOverBudget
        ? `Over budget by ${formatCurrency(absoluteRemaining)}`
        : `${formatCurrency(absoluteRemaining)} remaining`;
}

function updateGoals(goals) {
    const goalsContainer = document.getElementById('savings-goals');
    if (!goalsContainer) return;

    goalsContainer.innerHTML = goals.map(goal => {
        const percentage = (goal.current / goal.target * 100);
        const daysLeft = Math.ceil((new Date(goal.target_date) - new Date()) / (1000 * 60 * 60 * 24));

        return `
            <div class="goal-card">
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-semibold text-gray-700">${goal.name}</h4>
                    <span class="text-sm font-medium text-purple-500">${percentage.toFixed(1)}%</span>
                </div>
                <div class="flex justify-between text-sm text-gray-600">
                    <span class="formatted-value">${formatCurrency(goal.current)}</span>
                    <span class="formatted-value">of ${formatCurrency(goal.target)}</span>
                </div>
                <div class="goal-progress">
                    <div class="goal-progress-bar" style="width: ${percentage}%"></div>
                </div>
                <p class="text-sm text-gray-500 mt-2">
                    ${daysLeft > 0 ? `${daysLeft} days left` : 'Goal deadline passed'} •
                    Target: ${formatDate(goal.target_date)}
                </p>
            </div>
        `;
    }).join('');
}

// Chart Functions
function updateCharts(analytics) {
    if (!analytics) return;

    const debouncedChartUpdate = debounce(() => {
        requestIdleCallback(() => {
            try {
                updateSpendingTrendsChart(analytics);
                updateCategoryDistributionChart(analytics);
            } catch (error) {
                console.error('Error updating charts:', error);
                showNotification('Failed to update charts', 'error');
            }
        }, { timeout: 2000 });
    }, 150);

    debouncedChartUpdate();
}

function updateSpendingTrendsChart(analytics) {
    const ctx1 = document.getElementById('spending-chart')?.getContext('2d');
    if (!ctx1) return;

    try {
        if (state.charts.spending) {
            state.charts.spending.destroy();
        }

        const months = Object.keys(analytics.monthly_trends || {});
        const income = months.map(m => analytics.monthly_trends[m].income || 0);
        const expenses = months.map(m => analytics.monthly_trends[m].expenses || 0);

        const gradientIncome = ctx1.createLinearGradient(0, 0, 0, 400);
        gradientIncome.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
        gradientIncome.addColorStop(1, 'rgba(16, 185, 129, 0)');

        const gradientExpenses = ctx1.createLinearGradient(0, 0, 0, 400);
        gradientExpenses.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
        gradientExpenses.addColorStop(1, 'rgba(239, 68, 68, 0)');

        state.charts.spending = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Income',
                        data: income,
                        borderColor: '#10b981',
                        backgroundColor: gradientIncome,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#10b981',
                        borderWidth: 3,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Expenses',
                        data: expenses,
                        borderColor: '#ef4444',
                        backgroundColor: gradientExpenses,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#ef4444',
                        borderWidth: 3,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 20,
                        right: 20,
                        bottom: 20,
                        left: 20
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#000',
                        bodyColor: '#666',
                        bodySpacing: 4,
                        padding: 12,
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        usePointStyle: true,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: 'USD'
                                    }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 12
                            },
                            color: '#6b7280'
                        }
                    },
                    y: {
                        grid: {
                            borderDash: [2, 2],
                            color: '#e5e7eb'
                        },
                        ticks: {
                            font: {
                                size: 12
                            },
                            color: '#6b7280',
                            callback: function(value) {
                                return new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD',
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0
                                }).format(value);
                            }
                        }
                    }
                }
            }
        });

        const legendContainer = document.createElement('div');
        legendContainer.className = 'chart-legend';
        legendContainer.innerHTML = `
            <div class="legend-item">
                <div class="legend-dot" style="background: #10b981"></div>
                <span>Income</span>
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background: #ef4444"></div>
                <span>Expenses</span>
            </div>
        `;
        ctx1.canvas.parentNode.appendChild(legendContainer);

    } catch (error) {
        console.error('Error creating spending trends chart:', error);
    }
}

function updateCategoryDistributionChart(analytics) {
    const ctx2 = document.getElementById('category-chart')?.getContext('2d');
    if (!ctx2) return;

    try {
        if (state.charts.category) {
            state.charts.category.destroy();
        }

        const categories = Object.keys(analytics.category_breakdown || {});
        const amounts = Object.values(analytics.category_breakdown || {});

        const categoryColors = [
            '#3b82f6', // Blue
            '#10b981', // Green
            '#f59e0b', // Yellow
            '#ef4444', // Red
            '#8b5cf6', // Purple
            '#ec4899', // Pink
            '#6366f1', // Indigo
            '#14b8a6', // Teal
            '#f97316', // Orange
            '#06b6d4'  // Cyan
        ];

        state.charts.category = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: categories,
                datasets: [{
                    data: amounts,
                    backgroundColor: categoryColors.slice(0, categories.length),
                    borderColor: 'white',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 20,
                        right: 20,
                        bottom: 20,
                        left: 20
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#000',
                        bodyColor: '#666',
                        bodySpacing: 4,
                        padding: 12,
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                const formattedValue = new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD'
                                }).format(value);
                                return `${label}: ${formattedValue} (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    } catch (error) {
        console.error('Error creating category distribution chart:', error);
    }
}

window.addEventListener('resize', debounce(() => {
    if (state.charts.spending) {
        state.charts.spending.resize();
    }
    if (state.charts.category) {
        state.charts.category.resize();
    }
}, 250));

function updateChartsTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const theme = {
        backgroundColor: isDark ? '#1f2937' : 'white',
        textColor: isDark ? '#e5e7eb' : '#374151',
        gridColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb',
        tooltipBg: isDark ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        tooltipText: isDark ? '#e5e7eb' : '#000000'
    };

    const chartOptions = {
        plugins: {
            legend: {
                labels: {
                    color: theme.textColor,
                    usePointStyle: true
                }
            },
            tooltip: {
                backgroundColor: theme.tooltipBg,
                titleColor: theme.tooltipText,
                bodyColor: theme.tooltipText,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb'
            }
        },
        scales: {
            x: {
                grid: {
                    color: theme.gridColor,
                    drawBorder: false
                },
                ticks: { color: theme.textColor }
            },
            y: {
                grid: {
                    color: theme.gridColor,
                    drawBorder: false
                },
                ticks: { color: theme.textColor }
            }
        }
    };

    if (state.charts.spending) {
        state.charts.spending.options = { ...state.charts.spending.options, ...chartOptions };
        state.charts.spending.update('none');
    }
    if (state.charts.category) {
        state.charts.category.options = { ...state.charts.category.options, ...chartOptions };
        state.charts.category.update('none');
    }
}

function initializeThemeSystem() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    function setTheme(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateChartsTheme();
        state.isDarkMode = isDark;
    }

    function updateUIForTheme(isDark) {
        const moonIcon = themeToggleBtn?.querySelector('.fa-moon');
        const sunIcon = themeToggleBtn?.querySelector('.fa-sun');
        if (moonIcon && sunIcon) {
            moonIcon.classList.toggle('hidden', isDark);
            sunIcon.classList.toggle('hidden', !isDark);
        }

        document.querySelectorAll('[data-theme-update]').forEach(element => {
            element.classList.toggle('dark-theme', isDark);
        });
    }

    const savedTheme = localStorage.getItem('theme');
    const systemTheme = prefersDark.matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && systemTheme);
    setTheme(isDark);

    themeToggleBtn?.addEventListener('click', () => {
        const isDark = !document.documentElement.classList.contains('dark');
        setTheme(isDark);
    });

    prefersDark.addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            setTheme(e.matches);
        }
    });
}

// =============== 6. Event Listeners ===============
function initializeEventListeners() {
    // User Menu
    elements.userMenu?.addEventListener('click', () => {
        elements.userDropdown?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('user-menu');
        const userDropdown = document.getElementById('user-dropdown');
        if (userMenu && userDropdown && !userMenu.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
    });

    // Form Submissions with improved error handling
    document.getElementById('transaction-form')?.addEventListener('submit', handleTransactionFormSubmit);
    document.getElementById('budget-form')?.addEventListener('submit', handleBudgetFormSubmit);
    document.getElementById('goal-form')?.addEventListener('submit', handleGoalFormSubmit);

    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        state.isDarkMode = document.body.classList.contains('dark');
        localStorage.setItem('theme', state.isDarkMode ? 'dark' : 'light');
        updateChartsTheme();
    });

    document.getElementById('export-transactions')?.addEventListener('click', handleExportTransactions);

    // Filter changes
    document.getElementById('category-filter')?.addEventListener('change', debounce(handleCategoryFilterChange, 250));
    document.getElementById('date-filter')?.addEventListener('change', handleDateFilterChange);

    // Sidebar toggle
    document.getElementById('mobile-menu-button')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('-translate-x-full');
    });

    // Close modal when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
                const form = modal.querySelector('form');
                form?.reset();
            }
        });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            document.body.classList.toggle('dark', e.matches);
            state.isDarkMode = e.matches;
            updateChartsTheme();
        }
    });

    // Enhanced Sidebar Handling
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuButton = document.getElementById('mobile-menu-button');

    function toggleSidebar(show) {
        sidebar?.classList.toggle('active', show);
        sidebarOverlay?.classList.toggle('active', show);
        document.body.style.overflow = show ? 'hidden' : '';
    }

    mobileMenuButton?.addEventListener('click', () => toggleSidebar(true));
    sidebarOverlay?.addEventListener('click', () => toggleSidebar(false));

    window.addEventListener('resize', debounce(() => {
        if (window.innerWidth > 1024 && sidebar?.classList.contains('active')) {
            toggleSidebar(false);
        }
    }, 250));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar?.classList.contains('active')) {
            toggleSidebar(false);
        }
    });

    // Category type and group change handlers
    document.getElementById('category-type')?.addEventListener('change', handleCategoryTypeChange);
    document.getElementById('category-group')?.addEventListener('change', handleCategoryGroupChange);

    // Export all data
    document.getElementById('export-btn')?.addEventListener('click', handleExportAllData);
}

// =============== 7. Event Handler Functions ===============
async function handleTransactionFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        if (response.ok) {
            showNotification('Transaction added successfully');
            form.closest('.modal').classList.add('hidden');
            form.reset();
            await loadDashboardData();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to add transaction');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleBudgetFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const response = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        if (response.ok) {
            showNotification('Budget updated successfully');
            form.closest('.modal').classList.add('hidden');
            form.reset();
            await loadDashboardData();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update budget');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleGoalFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const response = await fetch('/api/savings-goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        if (response.ok) {
            showNotification('Goal added successfully');
            form.closest('.modal').classList.add('hidden');
            form.reset();
            await loadDashboardData();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to add goal');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleExportTransactions() {
    try {
        const response = await fetch('/api/export/transactions');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'transactions.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showNotification('Transactions exported successfully');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to export transactions');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function handleCategoryFilterChange(e) {
    state.filters.category = e.target.value;
    // Assuming you have access to all transactions in `state.transactions`
    const filteredTransactions = state.transactions.filter(transaction =>
        state.filters.category === '' || transaction.category === state.filters.category
    );
    updateTransactions(filteredTransactions);
}

function handleDateFilterChange(e) {
    const selectedRange = e.target.value;
    const today = new Date();
    let startDate;

    switch (selectedRange) {
        case '7-days':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
            break;
        case '30-days':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
            break;
        case 'this-month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'last-month':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            break;
        default:
            startDate = null;
            break;
    }

    let filteredTransactions = state.transactions;
    if (startDate) {
        filteredTransactions = state.transactions.filter(transaction => new Date(transaction.date) >= startDate);
    }
    updateTransactions(filteredTransactions);
}

async function handleCategoryTypeChange(e) {
    const categoryGroupSelect = document.getElementById('category-group');
    const categorySelect = document.getElementById('category');
    
    // Clear existing options
    categoryGroupSelect.innerHTML = '<option value="">Select Group</option>';
    categorySelect.innerHTML = '<option value="">Select Category</option>';

    if (e.target.value) {
        try {
            const response = await fetch(`/api/categories/${e.target.value}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const groups = await response.json();
            if (Array.isArray(groups)) {
                groups.forEach(group => {
                    const option = new Option(group, group);
                    categoryGroupSelect.add(option);
                });
            }
        } catch (error) {
            console.error('Error loading category groups:', error);
            showNotification('Failed to load category groups', 'error');
        }
    }
}

async function handleCategoryGroupChange(e) {
    const categoryType = document.getElementById('category-type').value;
    const categorySelect = document.getElementById('category');
    
    // Clear existing options
    categorySelect.innerHTML = '<option value="">Select Category</option>';

    if (e.target.value && categoryType) {
        try {
            const response = await fetch(`/api/categories/${categoryType}/${e.target.value}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const categories = await response.json();
            if (Array.isArray(categories)) {
                categories.forEach(category => {
                    const option = new Option(category, category);
                    categorySelect.add(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            showNotification('Failed to load categories', 'error');
        }
    }
}

async function handleExportAllData() {
    try {
        const response = await fetch('/api/export');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'finance_data.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showNotification('All data exported successfully');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to export data');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// =============== 8. Initialization ===============
function initializeApp() {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initializeThemeSystem();
            initializeModals();
            initializeSidebar();
            initializeEventListeners();
            loadDashboardWithRetry();
        } catch (e) {
            console.error('App initialization failed:', e);
            showNotification('Error initializing application', 'error');
        }
    });
}

// Start the application
initializeApp();