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
    },
    budgets: {
        currentPage: 1,
        perPage: 6,
        total: 0,
        items: []
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
        const [transactionsRes, analyticsRes, goalsRes] = await Promise.allSettled([
            fetch('/api/transactions'),
            fetch('/api/analytics'),
            fetch('/api/savings-goals')
        ]);

        // Handle individual request failures
        const results = {
            transactions: transactionsRes.status === 'fulfilled' ? await transactionsRes.value.json() : null,
            analytics: analyticsRes.status === 'fulfilled' ? await analyticsRes.value.json() : null,
            goals: goalsRes.status === 'fulfilled' ? await goalsRes.value.json() : null
        };

        if (results.transactions) {
            state.transactions = results.transactions;
            updateTransactions(results.transactions);
        }

        if (results.analytics) {
            updateMetrics(results.analytics.summary);
            updateCharts(results.analytics);
        }

        if (results.goals) {
            updateGoals(results.goals);
        }

        await loadBudgets();

    } catch (error) {
        console.error('Dashboard load error:', error);
        showNotification('Error loading dashboard data', 'error');
        throw error; // Re-throw for retry mechanism
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

// Add new function to load budgets
async function loadBudgets(page = 1) {
    try {
        const response = await fetch(`/api/budgets?page=${page}&per_page=${state.budgets.perPage}`);
        if (!response.ok) throw new Error('Failed to fetch budgets');
        
        const data = await response.json();
        
        // Update state
        state.budgets = {
            ...state.budgets,
            currentPage: data.current_page,
            total: data.total,
            totalPages: data.pages,
            items: data.budgets,
            hasNext: data.has_next,
            hasPrev: data.has_prev
        };
        
        updateBudgets();
    } catch (error) {
        console.error('Error loading budgets:', error);
        showNotification('Failed to load budgets', 'error');
    }
}

// Update Functions
function updateTransactions(transactions) {
    const tableBody = document.getElementById('transactions-table');
    const emptyMessage = document.getElementById('transactions-empty');
    if (!tableBody || !emptyMessage) return;

    if (!transactions.length) {
        tableBody.innerHTML = '';
        emptyMessage.classList.remove('hidden');
        return;
    }

    emptyMessage.classList.add('hidden');
    tableBody.innerHTML = transactions.map(t => {
        const amount = parseFloat(t.amount);
        const amountClass = amount >= 0 ? 'text-green-600' : 'text-red-600';
        const formattedDate = new Date(t.date).toLocaleDateString();

        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${formattedDate}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${t.description}</div>
                    ${t.notes ? `<div class="text-xs text-gray-500">${t.notes}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${t.category}</div>
                    <div class="text-xs text-gray-500">${t.category_group}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${amountClass} font-medium">
                    ${formatCurrency(Math.abs(amount))}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button class="text-blue-600 hover:text-blue-900 mr-3 edit-transaction-btn" data-id="${t.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-600 hover:text-red-900 delete-transaction-btn" data-id="${t.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Add event listeners for transaction actions
    addTransactionEventListeners();
}

function addTransactionEventListeners() {
    document.querySelectorAll('.edit-transaction-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const transactionId = btn.dataset.id;
            openTransactionEditModal(transactionId);
        });
    });

    document.querySelectorAll('.delete-transaction-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const transactionId = btn.dataset.id;
            if (confirm('Are you sure you want to delete this transaction?')) {
                deleteTransaction(transactionId);
            }
        });
    });
}

function updateMetrics(summary) {
    if (!summary) return;

    // Update income
    const monthlyIncome = document.getElementById('monthly-income');
    if (monthlyIncome) {
        monthlyIncome.textContent = formatCurrency(summary.income || 0);
    }

    // Update expenses
    const monthlyExpenses = document.getElementById('monthly-expenses');
    if (monthlyExpenses) {
        monthlyExpenses.textContent = formatCurrency(summary.expenses || 0);
    }

    // Update savings rate
    const savingsRate = document.getElementById('savings-rate');
    if (savingsRate) {
        savingsRate.textContent = formatPercentage(summary.savings_rate || 0);
    }

    // Update net worth (income - expenses)
    const netWorth = document.getElementById('net-worth');
    if (netWorth) {
        const worth = (summary.income || 0) - (summary.expenses || 0);
        netWorth.textContent = formatCurrency(worth);
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

function updateBudgets() {
    const budgetContainer = document.getElementById('budget-cards');
    const paginationContainer = document.getElementById('budget-pagination');
    if (!budgetContainer) return;

    // Show empty state if no budgets
    if (!state.budgets.items?.length) {
        budgetContainer.innerHTML = `
            <div class="col-span-full text-center py-8 text-gray-500">
                No budgets set. Click "Set Budget" to create one.
            </div>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    // Render budget cards
    budgetContainer.innerHTML = state.budgets.items.map(budget => {
        const statusClasses = {
            'good': 'bg-green-500',
            'warning': 'bg-yellow-500',
            'danger': 'bg-red-500'
        };

        const statusClass = statusClasses[budget.status] || statusClasses.good;
        
        return `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-medium text-gray-900 dark:text-gray-100">${budget.category}</h4>
                        <p class="text-sm text-gray-500 dark:text-gray-400">${budget.category_group}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-medium ${budget.status === 'danger' ? 'text-red-500' : 'text-gray-500'}">
                            ${formatCurrency(budget.current_usage)} / ${formatCurrency(budget.monthly_limit)}
                        </p>
                        <p class="text-xs text-gray-400">
                            ${formatCurrency(budget.remaining)} remaining
                        </p>
                    </div>
                </div>
                
                <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full ${statusClass} transition-all duration-500"
                         style="width: ${Math.min(budget.percentage_used, 100)}%">
                    </div>
                </div>
                
                <div class="mt-2 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>${budget.percentage_used.toFixed(1)}% used</span>
                    <div class="space-x-2">
                        <button class="edit-budget-btn hover:text-blue-500" data-id="${budget.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-budget-btn hover:text-red-500" data-id="${budget.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Update pagination
    if (paginationContainer) {
        paginationContainer.innerHTML = `
            <div class="flex items-center justify-between mt-4">
                <p class="text-sm text-gray-500">
                    Showing ${((state.budgets.currentPage - 1) * state.budgets.perPage) + 1} to 
                    ${Math.min(state.budgets.currentPage * state.budgets.perPage, state.budgets.total)} 
                    of ${state.budgets.total} budgets
                </p>
                <div class="flex space-x-2">
                    <button class="px-3 py-1 border rounded text-sm ${!state.budgets.hasPrev ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}"
                            onclick="changeBudgetPage(${state.budgets.currentPage - 1})"
                            ${!state.budgets.hasPrev ? 'disabled' : ''}>
                        Previous
                    </button>
                    <button class="px-3 py-1 border rounded text-sm ${!state.budgets.hasNext ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}"
                            onclick="changeBudgetPage(${state.budgets.currentPage + 1})"
                            ${!state.budgets.hasNext ? 'disabled' : ''}>
                        Next
                    </button>
                </div>
            </div>
        `;
    }

    // Add event listeners for budget actions
    addBudgetEventListeners();
}

// Add pagination change handler
async function changeBudgetPage(page) {
    if (page < 1 || page > state.budgets.totalPages) return;
    await loadBudgets(page);
}

function addBudgetEventListeners() {
    document.querySelectorAll('.edit-budget-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const budgetId = btn.dataset.id;
            openBudgetEditModal(budgetId);
        });
    });

    document.querySelectorAll('.delete-budget-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const budgetId = btn.dataset.id;
            if (confirm('Are you sure you want to delete this budget?')) {
                await deleteBudget(budgetId);
            }
        });
    });
}

async function deleteBudget(budgetId) {
    try {
        const response = await fetch(`/api/budgets?id=${budgetId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete budget');
        }
        
        showNotification('Budget deleted successfully');
        loadDashboardData();
    } catch (error) {
        console.error('Error deleting budget:', error);
        showNotification('Failed to delete budget', 'error');
    }
}

async function openBudgetEditModal(budgetId) {
    try {
        const response = await fetch(`/api/budgets/${budgetId}`);
        if (!response.ok) throw new Error('Failed to fetch budget details');
        
        const budget = await response.json();
        const form = document.getElementById('budget-form');
        
        // Populate form fields
        form.querySelector('[name="category_group"]').value = budget.category_group;
        form.querySelector('[name="category"]').value = budget.category;
        form.querySelector('[name="monthly_limit"]').value = budget.monthly_limit;
        form.querySelector('[name="alert_threshold"]').value = budget.alert_threshold * 100;
        
        // Set form mode to edit
        form.dataset.mode = 'edit';
        form.dataset.budgetId = budgetId;
        
        openModal('budget-modal');
    } catch (error) {
        console.error('Error opening budget edit modal:', error);
        showNotification('Failed to load budget details', 'error');
    }
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
function updateSpendingTrendsChart(analytics) {
    const ctx1 = document.getElementById('spending-overview')?.getContext('2d');
    if (!ctx1) return;

    try {
        if (state.charts.spending) {
            state.charts.spending.destroy();
        }

        const labels = Object.keys(analytics.monthly_trends || {});
        const incomeData = labels.map(month => analytics.monthly_trends[month].income || 0);
        const expenseData = labels.map(month => analytics.monthly_trends[month].expenses || 0);

        state.charts.spending = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Expenses',
                        data: expenseData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating spending trends chart:', error);
        showNotification('Failed to create spending chart', 'error');
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
        });
    }, 250);

    debouncedChartUpdate();
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
    try {
        const isDark = document.documentElement.classList.contains('dark');
        const theme = {
            backgroundColor: isDark ? '#1f2937' : 'white',
            textColor: isDark ? '#e5e7eb' : '#374151',
            gridColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb'
        };

        // Update spending chart
        if (state.charts.spending) {
            state.charts.spending.options.scales.x.grid.color = theme.gridColor;
            state.charts.spending.options.scales.y.grid.color = theme.gridColor;
            state.charts.spending.options.scales.x.ticks.color = theme.textColor;
            state.charts.spending.options.scales.y.ticks.color = theme.textColor;
            state.charts.spending.update('none');
        }

        // Update category chart
        if (state.charts.category) {
            state.charts.category.options.plugins.legend.labels.color = theme.textColor;
            state.charts.category.update('none');
        }
    } catch (error) {
        console.error('Error updating chart themes:', error);
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
    const type = e.target.value;

    clearCategorySelects(categoryGroupSelect, categorySelect);

    if (!type) return;

    try {
        const response = await fetch(`/api/categories/${type}`);
        if (!response.ok) throw new Error('Failed to fetch categories');
        const groups = await response.json();

        Object.keys(groups).forEach(group => {
            const option = new Option(group, group);
            categoryGroupSelect.add(option);
        });
    } catch (error) {
        console.error('Error loading category groups:', error);
        showNotification('Failed to load category groups', 'error');
    }
}

function clearCategorySelects(...selects) {
    selects.forEach(select => {
        select.innerHTML = '';
        select.add(new Option('Select...', ''));
    });
}

async function handleCategoryGroupChange(e) {
    const categoryTypeSelect = document.getElementById('category-type');
    const categorySelect = document.getElementById('category');
    const type = categoryTypeSelect.value;
    const group = e.target.value;
    
    categorySelect.innerHTML = '<option value="">Select Category</option>';

    if (type && group) {
        try {
            const response = await fetch(`/api/categories/${type}/${group}`);
            if (!response.ok) throw new Error('Failed to fetch subcategories');
            const categories = await response.json();
            
            categories.forEach(category => {
                const option = new Option(category, category);
                categorySelect.add(option);
            });
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

async function populateCategorySelects(type = '', group = '', category = '') {
    const groupSelect = document.getElementById('category-group');
    const categorySelect = document.getElementById('category');
    const subcategorySelect = document.getElementById('subcategory');
    
    try {
        // Reset selections
        groupSelect.innerHTML = '<option value="">Select Group</option>';
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        subcategorySelect.innerHTML = '<option value="">Select Subcategory</option>';
        
        if (!type) return;
        
        // Fetch category structure
        const response = await fetch(`/api/categories/${type}`);
        if (!response.ok) throw new Error('Failed to fetch categories');
        const groups = await response.json();
        
        // Populate groups
        Object.keys(groups).forEach(groupName => {
            const option = new Option(groupName, groupName);
            option.selected = groupName === group;
            groupSelect.add(option);
        });
        
        // If group is selected, populate categories
        if (group && groups[group]) {
            const categories = Object.keys(groups[group]);
            categories.forEach(cat => {
                const option = new Option(cat, cat);
                option.selected = cat === category;
                categorySelect.add(option);
            });
            
            // If category is selected, populate subcategories
            if (category && groups[group][category]) {
                const subcategories = groups[group][category];
                subcategories.forEach(subcat => {
                    subcategorySelect.add(new Option(subcat, subcat));
                });
            }
        }
        
    } catch (error) {
        console.error('Error populating categories:', error);
        showNotification('Failed to load categories', 'error');
    }
}

function initializeCategorySelects() {
    const typeSelect = document.getElementById('category-type');
    const groupSelect = document.getElementById('category-group');
    const categorySelect = document.getElementById('category');
    
    typeSelect?.addEventListener('change', (e) => {
        populateCategorySelects(e.target.value);
    });
    
    groupSelect?.addEventListener('change', (e) => {
        const type = typeSelect.value;
        populateCategorySelects(type, e.target.value);
    });
    
    categorySelect?.addEventListener('change', (e) => {
        const type = typeSelect.value;
        const group = groupSelect.value;
        populateCategorySelects(type, group, e.target.value);
    });
}

async function handleTransactionEdit(transactionId) {
    try {
        const response = await fetch(`/api/transactions/${transactionId}`);
        if (!response.ok) throw new Error('Failed to fetch transaction');
        const transaction = await response.json();
        
        // Populate form
        const form = document.getElementById('transaction-form');
        form.dataset.editId = transactionId;
        
        // Populate fields
        ['description', 'amount', 'notes'].forEach(field => {
            form[field].value = transaction[field] || '';
        });
        
        // Handle categories
        await populateCategorySelects(transaction.category_type, transaction.category_group);
        document.getElementById('category-type').value = transaction.category_type;
        document.getElementById('category-group').value = transaction.category_group;
        document.getElementById('category').value = transaction.category;
        
        openModal('transaction-modal');
        
    } catch (error) {
        console.error('Error editing transaction:', error);
        showNotification('Failed to load transaction details', 'error');
    }
}

function applyTransactionFilters() {
    const filters = {
        type: document.getElementById('transaction-filter').value,
        date: document.getElementById('date-filter').value,
        category: document.getElementById('category-filter')?.value
    };
    
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') queryParams.append(key, value);
    });
    
    loadTransactions(queryParams);
}

async function loadTransactions(queryParams = new URLSearchParams()) {
    try {
        const response = await fetch(`/api/transactions?${queryParams}`);
        if (!response.ok) throw new Error('Failed to fetch transactions');
        const transactions = await response.json();
        updateTransactions(transactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
        showNotification('Failed to load transactions', 'error');
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
            initializeCategorySelects();
            initializeBudgetCategorySelects(); // Add this line
            loadDashboardWithRetry();
        } catch (e) {
            console.error('App initialization failed:', e);
            showNotification('Error initializing application', 'error');
        }
    });
}

// Add this after the existing initialization functions
function initializeBudgetCategorySelects() {
    const groupSelect = document.querySelector('#budget-form [name="category_group"]');
    const categorySelect = document.querySelector('#budget-form [name="category"]');
    
    if (!groupSelect || !categorySelect) return;

    // Reset and populate category group on modal open
    document.getElementById('set-budget-btn')?.addEventListener('click', async () => {
        try {
            groupSelect.innerHTML = '<option value="">Select Category Group</option>';
            categorySelect.innerHTML = '<option value="">Select Category</option>';
            
            const response = await fetch('/api/categories/expense');
            if (!response.ok) throw new Error('Failed to fetch category groups');
            
            const groups = await response.json();
            Object.keys(groups).forEach(group => {
                const option = new Option(group, group);
                groupSelect.add(option);
            });
        } catch (error) {
            console.error('Error loading budget categories:', error);
            showNotification('Failed to load categories', 'error');
        }
    });

    // Handle category group change
    groupSelect.addEventListener('change', async (e) => {
        const selectedGroup = e.target.value;
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        
        if (!selectedGroup) return;
        
        try {
            const response = await fetch(`/api/categories/expense/${selectedGroup}`);
            if (!response.ok) throw new Error('Failed to fetch categories');
            
            const categories = await response.json();
            if (Array.isArray(categories)) {
                categories.forEach(category => {
                    const option = new Option(category, category);
                    categorySelect.add(option);
                });
            } else {
                Object.keys(categories).forEach(category => {
                    const option = new Option(category, category);
                    categorySelect.add(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            showNotification('Failed to load categories', 'error');
        }
    });
}

// Start the application
initializeApp();