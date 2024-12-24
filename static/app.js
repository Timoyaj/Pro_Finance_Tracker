// static/app.js

// DOM Elements
const addTransactionBtn = document.getElementById('add-transaction');
const transactionModal = document.getElementById('transaction-modal');
const cancelTransactionBtn = document.getElementById('cancel-transaction');
const transactionForm = document.getElementById('transaction-form');
const transactionsList = document.getElementById('transactions-list');
const userMenu = document.getElementById('user-menu');
const userDropdown = document.getElementById('user-dropdown');
const themeToggle = document.getElementById('theme-toggle');
// Additional DOM Elements
const filterForm = document.getElementById('filter-form');
const exportBtn = document.getElementById('export-btn');
const exportFormatSelect = document.getElementById('export-format');
const analyticsContainer = document.getElementById('analytics-container');
// Additional Charts
let monthlyTrendsChart;
let dailySpendingChart;
let categoryComparisonChart;

// Enhanced State Management
const state = {
    transactions: [],
    filters: {
        category: '',
        dateFrom: '',
        dateTo: ''
    },
    analytics: null,
    isDarkMode: false
};

// Enhanced Event Listeners
filterForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.filters = {
        category: filterForm.category.value,
        dateFrom: filterForm.dateFrom.value,
        dateTo: filterForm.dateTo.value
    };
    loadTransactions();
});

exportBtn?.addEventListener('click', async () => {
    const format = exportFormatSelect.value;
    const response = await fetch(`/api/export?format=${format}`);
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }
});

// Enhanced Transaction Management
async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
        const response = await fetch(`/api/transactions?id=${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadTransactions();
            updateDashboard();
            showToast('Transaction deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        showToast('Error deleting transaction', 'error');
    }
}

async function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    if (!transaction) return;
    
    // Fill the form with transaction data
    transactionForm.description.value = transaction.description;
    transactionForm.amount.value = transaction.amount;
    transactionForm.category.value = transaction.category;
    transactionForm.notes.value = transaction.notes || '';
    
    // Update form for edit mode
    transactionForm.dataset.mode = 'edit';
    transactionForm.dataset.editId = id;
    transactionModal.classList.remove('hidden');
}

// Enhanced Analytics
async function loadAnalytics() {
    try {
        const response = await fetch('/api/analytics');
        if (response.ok) {
            state.analytics = await response.json();
            updateAnalyticsCharts();
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function updateAnalyticsCharts() {
    // Monthly Income vs Expenses
    const monthlyData = state.analytics.monthly_trends;
    const labels = Object.keys(monthlyData);
    
    if (monthlyTrendsChart) {
        monthlyTrendsChart.destroy();
    }
    
    monthlyTrendsChart = new Chart(document.getElementById('monthly-trends-chart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Income',
                    data: labels.map(month => monthlyData[month].income),
                    backgroundColor: '#10b981'
                },
                {
                    label: 'Expenses',
                    data: labels.map(month => monthlyData[month].expenses),
                    backgroundColor: '#ef4444'
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true },
                y: { stacked: true }
            }
        }
    });
    
    // Daily Spending Pattern
    if (dailySpendingChart) {
        dailySpendingChart.destroy();
    }
    
    const dailyData = getDailySpendingData();
    dailySpendingChart = new Chart(document.getElementById('daily-spending-chart'), {
        type: 'line',
        data: {
            labels: dailyData.labels,
            datasets: [{
                label: 'Daily Spending',
                data: dailyData.values,
                borderColor: '#3b82f6',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
    
    // Update category comparison
    updateCategoryComparisonChart();
}

function getDailySpendingData() {
    const dailySpending = {};
    const today = new Date();
    const thirtyDaysAgo = new Date(today - 30 * 24 * 60 * 60 * 1000);
    
    state.transactions
        .filter(t => new Date(t.date) >= thirtyDaysAgo && t.amount < 0)
        .forEach(t => {
            const date = t.date.substring(0, 10);
            dailySpending[date] = (dailySpending[date] || 0) + Math.abs(t.amount);
        });
    
    return {
        labels: Object.keys(dailySpending),
        values: Object.values(dailySpending)
    };
}

// Enhanced UI Feedback
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Error Handling
function handleError(error, context) {
    console.error(`Error in ${context}:`, error);
    showToast(`Error: ${error.message || 'Something went wrong'}`, 'error');
}


// Charts
let spendingChart;
let categoryChart;

// State
let transactions = [];
let isDarkMode = false;

// Event Listeners
addTransactionBtn.addEventListener('click', () => {
    transactionModal.classList.remove('hidden');
});

cancelTransactionBtn.addEventListener('click', () => {
    transactionModal.classList.add('hidden');
    transactionForm.reset();
});

transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(transactionForm);
    const transaction = {
        description: formData.get('description'),
        amount: parseFloat(formData.get('amount')),
        category: formData.get('category')
    };
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transaction)
        });
        
        if (response.ok) {
            transactionModal.classList.add('hidden');
            transactionForm.reset();
            loadDashboardData();
        }
    } catch (error) {
        console.error('Error adding transaction:', error);
    }
});

// Toggle user dropdown
userMenu.addEventListener('click', () => {
    userDropdown.classList.toggle('hidden');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target)) {
        userDropdown.classList.add('hidden');
    }
});

// Theme toggle
themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    updateTheme();
});

// Functions
async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions');
        if (response.ok) {
            transactions = await response.json();
            renderTransactions();
            updateCharts();
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function renderTransactions() {
    transactionsList.innerHTML = transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(transaction => `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-medium">${transaction.description}</p>
                    <p class="text-sm text-gray-500">${formatDate(transaction.date)}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold ${transaction.amount > 0 ? 'text-green-500' : 'text-red-500'}">
                        ${transaction.amount > 0 ? '+' : ''}$${Math.abs(transaction.amount).toFixed(2)}
                    </p>
                    <p class="text-sm text-gray-500">${transaction.category}</p>
                </div>
            </div>
        `)
        .join('');
}

function updateDashboard() {
    const totalBalance = transactions.reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));

    document.getElementById('total-balance').textContent = `$${totalBalance.toFixed(2)}`;
    document.getElementById('total-income').textContent = `$${totalIncome.toFixed(2)}`;
    document.getElementById('total-expenses').textContent = `-$${totalExpenses.toFixed(2)}`;
}

function updateCharts() {
    // Spending Trends Chart
    const monthlyData = getMonthlyData();
    if (spendingChart) {
        spendingChart.destroy();
    }
    spendingChart = new Chart(document.getElementById('spending-chart'), {
        type: 'line',
        data: {
            labels: monthlyData.labels,
            datasets: [{
                label: 'Net Cash Flow',
                data: monthlyData.values,
                borderColor: '#3b82f6',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    // Category Distribution Chart
    const categoryData = getCategoryData();
    if (categoryChart) {
        categoryChart.destroy();
    }
    categoryChart = new Chart(document.getElementById('category-chart'), {
        type: 'doughnut',
        data: {
            labels: categoryData.labels,
            datasets: [{
                data: categoryData.values,
                backgroundColor: [
                    '#3b82f6',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function getMonthlyData() {
    const months = {};
    transactions.forEach(t => {
        const month = t.date.substring(0, 7);
        months[month] = (months[month] || 0) + t.amount;
    });
    
    return {
        labels: Object.keys(months),
        values: Object.values(months)
    };
}

function getCategoryData() {
    const categories = {};
    transactions
        .filter(t => t.amount < 0)
        .forEach(t => {
            categories[t.category] = (categories[t.category] || 0) + Math.abs(t.amount);
        });
    
    return {
        labels: Object.keys(categories),
        values: Object.values(categories)
    };
}

function updateTheme() {
    document.body.classList.toggle('dark', isDarkMode);
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
    
    const chartOptions = {
        plugins: {
            legend: {
                labels: {
                    color: isDarkMode ? '#fff' : '#000'
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: isDarkMode ? '#fff' : '#000'
                }
            },
            y: {
                ticks: {
                    color: isDarkMode ? '#fff' : '#000'
                }
            }
        }
    };
    
    if (spendingChart) {
        spendingChart.options = { ...spendingChart.options, ...chartOptions };
        spendingChart.update();
    }
    if (categoryChart) {
        categoryChart.options = { ...categoryChart.options, ...chartOptions };
        categoryChart.update();
    }
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData().catch(error => {
        console.error('Failed to load dashboard:', error);
        showNotification('Error loading dashboard data', 'error');
    });
});

// Toggle user menu
userMenu?.addEventListener('click', () => {
    userDropdown.classList.toggle('hidden');
});

// Modal handling
addTransactionBtn?.addEventListener('click', () => {
    transactionModal.classList.remove('hidden');
});

cancelTransactionBtn?.addEventListener('click', () => {
    transactionModal.classList.add('hidden');
    transactionForm.reset();
});

// Form submission
transactionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(transactionForm);
    const data = {
        description: formData.get('description'),
        amount: parseFloat(formData.get('amount')),
        category: formData.get('category')
    };

    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            transactionModal.classList.add('hidden');
            transactionForm.reset();
            loadDashboardData();
        } else {
            console.error('Failed to add transaction');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

async function loadDashboardData() {
    try {
        const transactions = await fetch('/api/transactions').then(r => r.json());
        const analytics = await fetch('/api/analytics').then(r => r.json());
        
        // Load budgets and goals separately to handle potential failures
        try {
            const budgets = await fetch('/api/budgets').then(r => r.json());
            updateBudgets(budgets);
        } catch (error) {
            console.warn('Failed to load budgets:', error);
        }

        try {
            const goals = await fetch('/api/goals').then(r => r.json());
            updateGoals(goals);
        } catch (error) {
            console.warn('Failed to load goals:', error);
        }

        updateTransactions(transactions);
        updateMetrics(analytics);
        updateCharts(analytics);
    } catch (error) {
        throw new Error(`Failed to load dashboard data: ${error.message}`);
    }
}

// Add this function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Update the displayTransactions function to show only last 6 transactions
function displayTransactions(transactions) {
    const list = document.getElementById('transactions-list');
    if (!list) return;

    const recentTransactions = transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6); // Only take the last 6 transactions

    list.innerHTML = recentTransactions.map(t => `
        <div class="flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div class="flex items-center gap-3">
                <div class="p-2 rounded-full ${t.amount > 0 ? 'bg-green-100' : 'bg-red-100'}">
                    <svg class="w-4 h-4 ${t.amount > 0 ? 'text-green-500' : 'text-red-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${t.amount > 0 
                            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/>'
                            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/>'}
                    </svg>
                </div>
                <div>
                    <h4 class="font-semibold">${t.description}</h4>
                    <span class="text-sm text-gray-500">${new Date(t.date).toLocaleDateString()} · ${t.category}</span>
                </div>
            </div>
            <span class="font-bold ${t.amount > 0 ? 'text-green-500' : 'text-red-500'}">
                ${formatCurrency(t.amount)}
            </span>
        </div>
    `).join('');
}

// Update the charts
function updateCharts(analytics) {
    // Spending Trends Chart
    const ctx1 = document.getElementById('spending-chart')?.getContext('2d');
    if (ctx1 && analytics.monthly_trends) {
        const months = Object.keys(analytics.monthly_trends);
        const income = months.map(m => analytics.monthly_trends[m].income);
        const expenses = months.map(m => analytics.monthly_trends[m].expenses);

        if (window.spendingChart) window.spendingChart.destroy();
        window.spendingChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Income',
                        data: income,
                        borderColor: '#10b981',
                        tension: 0.4
                    },
                    {
                        label: 'Expenses',
                        data: expenses,
                        borderColor: '#ef4444',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // Category Distribution Chart
    const ctx2 = document.getElementById('category-chart')?.getContext('2d');
    if (ctx2 && analytics.category_breakdown) {
        const categories = Object.keys(analytics.category_breakdown);
        const amounts = Object.values(analytics.category_breakdown);

        if (window.categoryChart) window.categoryChart.destroy();
        window.categoryChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: categories,
                datasets: [{
                    data: amounts,
                    backgroundColor: [
                        '#3b82f6',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444',
                        '#8b5cf6',
                        '#ec4899'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

// Update metrics display
function updateMetrics(analytics) {
    const totalIncome = analytics.monthly_trends?.[Object.keys(analytics.monthly_trends).pop()]?.income || 0;
    const totalExpenses = analytics.monthly_trends?.[Object.keys(analytics.monthly_trends).pop()]?.expenses || 0;
    const balance = totalIncome - totalExpenses;

    document.getElementById('total-balance').textContent = formatCurrency(balance);
    document.getElementById('total-income').textContent = formatCurrency(totalIncome);
    document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses);

    // Calculate and display balance change percentage
    const prevMonth = Object.keys(analytics.monthly_trends)[Object.keys(analytics.monthly_trends).length - 2];
    if (prevMonth) {
        const prevBalance = analytics.monthly_trends[prevMonth].income - analytics.monthly_trends[prevMonth].expenses;
        const changePercent = ((balance - prevBalance) / Math.abs(prevBalance)) * 100;
        document.getElementById('balance-change').textContent = 
            `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}% from last month`;
    }
}
