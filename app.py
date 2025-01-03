from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
import json
import pandas as pd
import io
import csv
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import os
from sqlalchemy import func

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///finance_tracker.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Category Structure
CATEGORY_STRUCTURE = {
    'income': {
        'Regular Income': {
            'Salary/Wages': ['Full-time', 'Part-time', 'Contract'],
            'Business Income': ['Sales', 'Services', 'Other'],
            'Freelance Income': ['Projects', 'Consulting', 'Other']
        },
        'Passive Income': {
            'Investments': ['Dividends', 'Interest', 'Capital Gains'],
            'Rental Income': ['Residential', 'Commercial', 'Other'],
            'Royalties': ['Books', 'Music', 'Patents']
        }
    },
    'expense': {
        'Housing & Utilities': {
            'Housing': ['Rent', 'Mortgage', 'Property Tax'],
            'Utilities': ['Electricity', 'Water', 'Gas', 'Internet'],
            'Maintenance': ['Repairs', 'Insurance', 'HOA']
        },
        'Transportation': {
            'Vehicle': ['Car Payment', 'Insurance', 'Maintenance'],
            'Fuel': ['Gas', 'Charging', 'Other'],
            'Public Transit': ['Bus', 'Train', 'Rideshare']
        },
        'Living Expenses': ['Groceries', 'Healthcare', 'Personal Care'],
        'Lifestyle': ['Dining Out', 'Entertainment', 'Shopping'],
        'Bills & Insurance': ['Insurance', 'Phone/Internet', 'Subscriptions'],
        'Savings & Investments': ['Emergency Fund', 'Investments', 'Retirement'],
        'Education': ['Tuition', 'Books', 'Training'],
        'Others': ['Gifts', 'Miscellaneous', 'Unexpected Expenses']
    }
}

# Enhanced User Model
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    currency = db.Column(db.String(3), default='USD')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    transactions = db.relationship('Transaction', backref='user', lazy=True)
    budgets = db.relationship('Budget', backref='user', lazy=True)
    savings_goals = db.relationship('SavingsGoal', backref='user', lazy=True)

# Enhanced Transaction Model
class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    description = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category_type = db.Column(db.String(20), nullable=False)  # 'income' or 'expense'
    category_group = db.Column(db.String(50), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    savings_goal_id = db.Column(db.Integer, db.ForeignKey('savings_goal.id'), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    is_recurring = db.Column(db.Boolean, default=False)
    recurring_frequency = db.Column(db.String(20), nullable=True)  # 'weekly', 'monthly', 'yearly'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def update_savings_goal(self):
        """Update associated savings goal if this is a contribution"""
        if not self.savings_goal_id:
            return
            
        goal = SavingsGoal.query.get(self.savings_goal_id)
        if not goal:
            return
            
        if self.category_type == 'expense':
            # Handle withdrawal from goal
            goal.withdraw(abs(self.amount))
        else:
            # Handle contribution to goal
            goal.contribute(self.amount)

# Enhanced Budget Model
class Budget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category_group = db.Column(db.String(50), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    monthly_limit = db.Column(db.Float, nullable=False)
    alert_threshold = db.Column(db.Float, nullable=False, default=0.8)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reset_day = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_current_usage(self):
        today = datetime.now()
        month_start = today.replace(day=self.reset_day)
        if today.day < self.reset_day:
            month_start = (month_start - timedelta(days=32)).replace(day=self.reset_day)

        # Only consider expense transactions for budget calculations
        total_spent = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_group == self.category_group,  # Added group check
            Transaction.category == self.category,
            Transaction.category_type == 'expense',  # Added type check
            Transaction.date >= month_start
        ).scalar() or 0

        return abs(total_spent)

    def get_status(self):
        current_usage = self.get_current_usage()
        percentage_used = (current_usage / self.monthly_limit * 100) if self.monthly_limit > 0 else 0
        
        return {
            'id': self.id,
            'category_group': self.category_group,
            'category': self.category,
            'monthly_limit': self.monthly_limit,
            'current_usage': current_usage,
            'percentage_used': percentage_used,
            'remaining': self.monthly_limit - current_usage,
            'alert_threshold': self.alert_threshold,
            'status': 'danger' if percentage_used >= 100 else 
                     'warning' if percentage_used >= (self.alert_threshold * 100) else 
                     'good'
        }

# Enhanced Savings Goal Model
class SavingsGoal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    target_amount = db.Column(db.Float, nullable=False)
    current_amount = db.Column(db.Float, default=0)
    target_date = db.Column(db.DateTime, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    priority = db.Column(db.Integer, default=1)  # 1 (highest) to 5 (lowest)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_progress(self):
        """Calculate progress percentage"""
        if self.target_amount <= 0:
            return 0
        return min((self.current_amount / self.target_amount) * 100, 100)

    def add_contribution(self, amount):
        """Add a contribution to the goal"""
        if amount <= 0:
            raise ValueError("Contribution amount must be positive")
        self.current_amount = min(self.current_amount + amount, self.target_amount)
        db.session.commit()

    def contribute(self, amount):
        """Add a contribution to the goal with validation"""
        if amount <= 0:
            raise ValueError("Contribution amount must be positive")
            
        self.current_amount = min(self.current_amount + amount, self.target_amount)
        db.session.commit()
        return self.current_amount >= self.target_amount
        
    def withdraw(self, amount):
        """Withdraw from the goal with validation"""
        if amount <= 0:
            raise ValueError("Withdrawal amount must be positive")
            
        self.current_amount = max(self.current_amount - amount, 0)
        db.session.commit()
        
    def get_status(self):
        """Get enhanced goal status information"""
        progress = self.get_progress()
        remaining = max(self.target_amount - self.current_amount, 0)
        days_left = (self.target_date - datetime.now()).days
        
        monthly_needed = remaining / max(days_left / 30, 1) if days_left > 0 else 0
        
        status = {
            'completed': progress >= 100,
            'on_track': False,
            'at_risk': False,
            'behind': False
        }
        
        # Calculate if goal is on track
        if not status['completed']:
            if days_left <= 0:
                status['behind'] = True
            else:
                expected_progress = ((datetime.now() - self.created_at).days /
                                  (self.target_date - self.created_at).days) * 100
                variance = progress - expected_progress
                
                if variance >= -5:  # Within 5% of target
                    status['on_track'] = True
                elif variance >= -15:  # Within 15% of target
                    status['at_risk'] = True
                else:
                    status['behind'] = True
        
        return {
            'id': self.id,
            'name': self.name,
            'target_amount': self.target_amount,
            'current_amount': self.current_amount,
            'remaining': remaining,
            'target_date': self.target_date.strftime('%Y-%m-%d'),
            'days_left': max(days_left, 0),
            'progress': progress,
            'monthly_needed': monthly_needed,
            'category': self.category,
            'priority': self.priority,
            'status': status,
            'created_at': self.created_at.strftime('%Y-%m-%d')
        }

# Error Handler Decorator
def handle_errors(f):
    def wrapped(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    wrapped.__name__ = f.__name__
    return wrapped

# Routes

# Route for all categories
@app.route('/api/categories')
@handle_errors
def get_categories():
    """Get all available categories"""
    return jsonify(CATEGORY_STRUCTURE)

# Route for category groups by type
@app.route('/api/categories/<category_type>')
@handle_errors
def get_category_groups(category_type):
    """Get category groups for a specific type"""
    if category_type not in CATEGORY_STRUCTURE:
        return jsonify({'error': 'Invalid category type'}), 400
    return jsonify(CATEGORY_STRUCTURE[category_type])

@app.route('/api/categories/<category_type>/<category_group>')
@handle_errors
def get_category_details(category_type, category_group):
    """Get categories for a specific type and group"""
    try:
        if category_type not in CATEGORY_STRUCTURE:
            return jsonify({'error': 'Invalid category type'}), 400
        if category_group not in CATEGORY_STRUCTURE[category_type]:
            return jsonify({'error': 'Invalid category group'}), 400
            
        categories = CATEGORY_STRUCTURE[category_type][category_group]
        return jsonify(categories)
        
    except Exception as e:
        return jsonify({'error': f'Error getting categories: {str(e)}'}), 500

@app.route('/api/categories/<category_type>/<category_group>/<category>')
@handle_errors
def get_subcategories(category_type, category_group, category):
    """Get subcategories for a specific category"""
    try:
        if (category_type not in CATEGORY_STRUCTURE or
            category_group not in CATEGORY_STRUCTURE[category_type] or
            category not in CATEGORY_STRUCTURE[category_type][category_group]):
            return jsonify({'error': 'Invalid category path'}), 400
            
        subcategories = CATEGORY_STRUCTURE[category_type][category_group][category]
        return jsonify(subcategories)
        
    except Exception as e:
        return jsonify({'error': f'Error getting subcategories: {str(e)}'}), 500

@app.route('/api/transactions', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_transactions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            print("Received transaction request:", request.data)  # Log raw request data
            
            if not request.is_json:
                return jsonify({'error': 'Request must be JSON'}), 400
                
            data = request.get_json()
            print("Parsed JSON data:", data)  # Log parsed JSON
            
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            required_fields = ['description', 'amount', 'category_type', 'category_group', 'category']
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                return jsonify({
                    'error': 'Missing required fields',
                    'missing_fields': missing_fields
                }), 400

            # Validate amount is a number
            try:
                amount = float(data['amount'])
                if amount <= 0:
                    return jsonify({'error': 'Amount must be greater than 0'}), 400
            except (ValueError, TypeError) as e:
                print(f"Amount validation error: {str(e)}")
                return jsonify({'error': 'Invalid amount format'}), 400

            # Validate category type
            if data['category_type'] not in ['income', 'expense']:
                print(f"Invalid category type: {data['category_type']}")
                return jsonify({'error': 'Invalid category type'}), 400

            # Validate category exists in structure
            if data['category_type'] not in CATEGORY_STRUCTURE:
                print(f"Invalid category type in structure: {data['category_type']}")
                return jsonify({'error': 'Invalid category type'}), 400
                
            if data['category_group'] not in CATEGORY_STRUCTURE[data['category_type']]:
                print(f"Invalid category group: {data['category_group']}")
                return jsonify({'error': 'Invalid category group'}), 400
                
            group_data = CATEGORY_STRUCTURE[data['category_type']][data['category_group']]
            valid_categories = group_data if isinstance(group_data, list) else list(group_data.keys())
            
            if data['category'] not in valid_categories:
                print(f"Invalid category: {data['category']}")
                return jsonify({'error': 'Invalid category'}), 400

            transaction = Transaction(
                description=data['description'],
                amount=amount,
                category_type=data['category_type'],
                category_group=data['category_group'],
                category=data['category'],
                notes=data.get('notes', ''),
                is_recurring=data.get('is_recurring', False),
                recurring_frequency=data.get('recurring_frequency'),
                user_id=session['user_id']
            )
            
            print("Creating transaction:", transaction.__dict__)
            
            # Check if this transaction matches any savings goal
            if data['category_type'] == 'income':
                savings_goal = SavingsGoal.query.filter_by(
                    user_id=session['user_id'],
                    category=data['category']
                ).first()
                
                if savings_goal:
                    transaction.savings_goal_id = savings_goal.id
                    savings_goal.current_amount = min(
                        savings_goal.current_amount + float(data['amount']),
                        savings_goal.target_amount
                    )
                    db.session.add(savings_goal)
            
            # Check if transaction should be linked to a goal
            goal_id = data.get('savings_goal_id')
            if goal_id:
                goal = SavingsGoal.query.get(goal_id)
                if not goal or goal.user_id != session['user_id']:
                    return jsonify({'error': 'Invalid savings goal'}), 400
                transaction.savings_goal_id = goal_id
            
            db.session.add(transaction)
            db.session.commit()
            
            # Update goal progress if linked
            transaction.update_savings_goal()

            return jsonify({
                'message': 'Transaction added successfully',
                'id': transaction.id,
                'goal_updated': bool(goal_id)
            })

        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

    elif request.method == 'PUT':
        data = request.json
        transaction = Transaction.query.get_or_404(data['id'])
        if transaction.user_id != session['user_id']:
            return jsonify({'error': 'Unauthorized'}), 401

        # Update transaction fields
        for field in ['description', 'amount', 'category_type', 'category_group', 'category', 'notes', 'is_recurring', 'recurring_frequency']:
            if field in data:
                setattr(transaction, field, data[field])

        db.session.commit()
        return jsonify({'message': 'Transaction updated successfully'})

    elif request.method == 'DELETE':
        transaction_id = request.args.get('id')
        transaction = Transaction.query.get_or_404(transaction_id)
        if transaction.user_id != session['user_id']:
            return jsonify({'error': 'Unauthorized'}), 401

        db.session.delete(transaction)
        db.session.commit()
        return jsonify({'message': 'Transaction deleted successfully'})

    # GET request with enhanced filtering
    filter_params = {
        'category_type': request.args.get('category_type'),
        'category_group': request.args.get('category_group'),
        'category': request.args.get('category'),
        'date_from': request.args.get('from'),
        'date_to': request.args.get('to'),
        'min_amount': request.args.get('min_amount'),
        'max_amount': request.args.get('max_amount')
    }

    query = Transaction.query.filter_by(user_id=session['user_id'])

    # Apply filters
    if filter_params['category_type']:
        query = query.filter_by(category_type=filter_params['category_type'])
    if filter_params['category_group']:
        query = query.filter_by(category_group=filter_params['category_group'])
    if filter_params['category']:
        query = query.filter_by(category=filter_params['category'])
    if filter_params['date_from']:
        query = query.filter(Transaction.date >= datetime.strptime(filter_params['date_from'], '%Y-%m-%d'))
    if filter_params['date_to']:
        query = query.filter(Transaction.date <= datetime.strptime(filter_params['date_to'], '%Y-%m-%d'))
    if filter_params['min_amount']:
        query = query.filter(Transaction.amount >= float(filter_params['min_amount']))
    if filter_params['max_amount']:
        query = query.filter(Transaction.amount <= float(filter_params['max_amount']))

    transactions = query.order_by(Transaction.date.desc()).all()
    return jsonify([{
        'id': t.id,
        'date': t.date.strftime('%Y-%m-%d'),
        'description': t.description,
        'amount': t.amount,
        'category_type': t.category_type,
        'category_group': t.category_group,
        'category': t.category,
        'notes': t.notes,
        'is_recurring': t.is_recurring,
        'recurring_frequency': t.recurring_frequency
    } for t in transactions])

@app.route('/api/transactions/<int:transaction_id>', methods=['GET'])
@handle_errors
def get_transaction(transaction_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    transaction = Transaction.query.get_or_404(transaction_id)
    if transaction.user_id != session['user_id']:
        return jsonify({'error': 'Unauthorized'}), 401
        
    return jsonify({
        'id': transaction.id,
        'date': transaction.date.strftime('%Y-%m-%d'),
        'description': transaction.description,
        'amount': transaction.amount,
        'category_type': transaction.category_type,
        'category_group': transaction.category_group,
        'category': transaction.category,
        'notes': transaction.notes,
        'is_recurring': transaction.is_recurring,
        'recurring_frequency': transaction.recurring_frequency
    })

@app.route('/api/budget-status')
@handle_errors
def get_budget_status():
    """Get real-time budget status"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        budgets = Budget.query.filter_by(user_id=session['user_id']).all()
        status = []

        for budget in budgets:
            current_usage = budget.get_current_usage()
            percentage_used = (current_usage / budget.monthly_limit) * 100 if budget.monthly_limit > 0 else 0
            
            status.append({
                'category': budget.category,
                'category_group': budget.category_group,
                'limit': budget.monthly_limit,
                'spent': current_usage,
                'percentage': percentage_used,
                'remaining': budget.monthly_limit - current_usage,
                'status': 'danger' if percentage_used >= 100 else 
                         'warning' if percentage_used >= budget.alert_threshold * 100 else 'good'
            })

        return jsonify({
            'budgets': status,
            'last_updated': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({'error': f'Error getting budget status: {str(e)}'}), 500

@app.route('/api/analytics')
@handle_errors
def get_analytics():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        # Get date ranges
        today = datetime.now()
        month_start = today.replace(day=1)
        six_months_ago = today - timedelta(days=180)
        
        # Query all transactions for analysis
        transactions = Transaction.query.filter(
            Transaction.user_id == session['user_id'],
            Transaction.date >= six_months_ago
        ).all()

        # Calculate monthly summary
        current_month_transactions = [t for t in transactions if t.date >= month_start]
        monthly_income = sum(t.amount for t in current_month_transactions if t.category_type == 'income')
        monthly_expenses = abs(sum(t.amount for t in current_month_transactions if t.category_type == 'expense'))
        
        # Calculate savings rate
        savings_rate = 0
        if monthly_income > 0:
            savings_rate = ((monthly_income - monthly_expenses) / monthly_income) * 100

        summary = {
            'income': monthly_income,
            'expenses': monthly_expenses,
            'savings_rate': savings_rate
        }

        # Calculate category breakdown for current month
        category_breakdown = {}
        for t in current_month_transactions:
            if t.category_type == 'expense':  # Only track expenses in breakdown
                if t.category_group not in category_breakdown:
                    category_breakdown[t.category_group] = 0
                category_breakdown[t.category_group] += abs(t.amount)

        # Calculate monthly trends (last 6 months)
        monthly_trends = {}
        for t in transactions:
            month_key = t.date.strftime('%Y-%m')
            if month_key not in monthly_trends:
                monthly_trends[month_key] = {'income': 0, 'expenses': 0}
            if t.category_type == 'income':
                monthly_trends[month_key]['income'] += t.amount
            else:
                monthly_trends[month_key]['expenses'] += abs(t.amount)

        # Sort monthly trends by date
        monthly_trends = dict(sorted(monthly_trends.items()))

        return jsonify({
            'summary': summary,
            'category_breakdown': category_breakdown,
            'monthly_trends': monthly_trends,
            'last_updated': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({'error': f'Error calculating analytics: {str(e)}'}), 500

# ...existing code...

@app.route('/api/categories/expense/<category_group>/budget-categories')
@handle_errors
def get_budget_categories(category_group):
    """Get available categories for budgeting from a specific group"""
    try:
        if category_group not in CATEGORY_STRUCTURE['expense']:
            return jsonify({'error': 'Invalid category group'}), 400
            
        group_data = CATEGORY_STRUCTURE['expense'][category_group]
        if isinstance(group_data, list):
            # If the group directly contains categories
            categories = group_data
        else:
            # If the group contains subcategories
            categories = list(group_data.keys())
            
        return jsonify(categories)
        
    except Exception as e:
        return jsonify({'error': f'Error getting budget categories: {str(e)}'}), 500

# Update the handle_budgets route to include category validation
@app.route('/api/budgets', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_budgets():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.json
            
            # Validate category exists
            category_group = data.get('category_group')
            category = data.get('category')
            
            if not category_group or category_group not in CATEGORY_STRUCTURE['expense']:
                return jsonify({'error': 'Invalid category group'}), 400
                
            group_data = CATEGORY_STRUCTURE['expense'][category_group]
            valid_categories = (
                group_data if isinstance(group_data, list)
                else list(group_data.keys())
            )
            
            if not category or category not in valid_categories:
                return jsonify({'error': 'Invalid category'}), 400

            # Check for existing budget
            existing_budget = Budget.query.filter_by(
                user_id=session['user_id'],
                category_group=data['category_group'],
                category=data['category']
            ).first()

            if existing_budget:
                return jsonify({'error': 'Budget already exists for this category'}), 400

            budget = Budget(
                category_group=data['category_group'],
                category=data['category'],
                monthly_limit=float(data['monthly_limit']),
                alert_threshold=float(data.get('alert_threshold', 0.8)),
                reset_day=int(data.get('reset_day', 1)),
                user_id=session['user_id']
            )
            
            # Validate monthly limit
            if budget.monthly_limit <= 0:
                return jsonify({'error': 'Monthly limit must be greater than 0'}), 400

            db.session.add(budget)
            db.session.commit()
            
            return jsonify({
                'message': 'Budget created successfully',
                'budget': budget.get_status()
            })

        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

    elif request.method == 'GET':
        budgets = Budget.query.filter_by(user_id=session['user_id']).all()
        return jsonify({
            'budgets': [budget.get_status() for budget in budgets],
            'last_updated': datetime.now().isoformat()
        })

    elif request.method == 'PUT':
        try:
            data = request.json
            budget = Budget.query.get_or_404(data['id'])
            if budget.user_id != session['user_id']:
                return jsonify({'error': 'Unauthorized'}), 401

            budget.monthly_limit = float(data.get('monthly_limit', budget.monthly_limit))
            budget.alert_threshold = float(data.get('alert_threshold', budget.alert_threshold))
            budget.reset_day = int(data.get('reset_day', budget.reset_day))
            db.session.commit()
            return jsonify({'message': 'Budget updated successfully'})
        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

    elif request.method == 'DELETE':
        budget_id = request.args.get('id')
        budget = Budget.query.get_or_404(budget_id)
        if budget.user_id != session['user_id']:
            return jsonify({'error': 'Unauthorized'}), 401

        db.session.delete(budget)
        db.session.commit()
        return jsonify({'message': 'Budget deleted successfully'})

    # GET request
    budgets = Budget.query.filter_by(user_id=session['user_id']).all()
    return jsonify([{
        'id': b.id,
        'category_group': b.category_group,
        'category': b.category,
        'monthly_limit': b.monthly_limit,
        'alert_threshold': b.alert_threshold,
        'reset_day': b.reset_day,
        'current_usage': b.get_current_usage()
    } for b in budgets])

def validate_category_path(type, group, category, subcategory):
    """Validate that a category path exists in the CATEGORY_STRUCTURE"""
    try:
        return (subcategory in CATEGORY_STRUCTURE[type][group][category])
    except (KeyError, TypeError):
        return False

@app.route('/api/savings-goals', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_savings_goals():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.json
            
            # Validate required fields
            required_fields = ['name', 'target_amount', 'target_date', 'category']
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                return jsonify({
                    'error': 'Missing required fields',
                    'missing_fields': missing_fields
                }), 400

            # Validate target amount
            try:
                target_amount = float(data['target_amount'])
                if target_amount <= 0:
                    return jsonify({'error': 'Target amount must be greater than 0'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid target amount format'}), 400

            # Validate target date
            try:
                target_date = datetime.strptime(data['target_date'], '%Y-%m-%d')
                if target_date < datetime.now():
                    return jsonify({'error': 'Target date cannot be in the past'}), 400
            except ValueError:
                return jsonify({'error': 'Invalid target date format (expected YYYY-MM-DD)'}), 400

            goal = SavingsGoal(
                name=data['name'],
                target_amount=target_amount,
                current_amount=float(data.get('current_amount', 0)),
                target_date=target_date,
                category=data['category'],
                priority=int(data.get('priority', 1)),
                user_id=session['user_id']
            )
            
            db.session.add(goal)
            db.session.commit()
            return jsonify({
                'message': 'Savings goal created successfully',
                'goal': goal.get_status()
            })

        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

    elif request.method == 'PUT':
        try:
            data = request.json
            goal = SavingsGoal.query.get_or_404(data['id'])
            if goal.user_id != session['user_id']:
                return jsonify({'error': 'Unauthorized'}), 401

            # Update fields with validation
            if 'name' in data:
                goal.name = data['name']
                
            if 'target_amount' in data:
                try:
                    target_amount = float(data['target_amount'])
                    if target_amount <= 0:
                        return jsonify({'error': 'Target amount must be greater than 0'}), 400
                    goal.target_amount = target_amount
                except (ValueError, TypeError):
                    return jsonify({'error': 'Invalid target amount format'}), 400
                    
            if 'current_amount' in data:
                try:
                    current_amount = float(data['current_amount'])
                    if current_amount < 0:
                        return jsonify({'error': 'Current amount cannot be negative'}), 400
                    goal.current_amount = min(current_amount, goal.target_amount)
                except (ValueError, TypeError):
                    return jsonify({'error': 'Invalid current amount format'}), 400
                    
            if 'target_date' in data:
                try:
                    target_date = datetime.strptime(data['target_date'], '%Y-%m-%d')
                    if target_date < datetime.now():
                        return jsonify({'error': 'Target date cannot be in the past'}), 400
                    goal.target_date = target_date
                except ValueError:
                    return jsonify({'error': 'Invalid target date format (expected YYYY-MM-DD)'}), 400
                    
            if 'category' in data:
                goal.category = data['category']
                
            if 'priority' in data:
                try:
                    priority = int(data['priority'])
                    if priority < 1 or priority > 5:
                        return jsonify({'error': 'Priority must be between 1 and 5'}), 400
                    goal.priority = priority
                except (ValueError, TypeError):
                    return jsonify({'error': 'Invalid priority format'}), 400

            db.session.commit()
            return jsonify({
                'message': 'Savings goal updated successfully',
                'goal': goal.get_status()
            })

        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

    elif request.method == 'DELETE':
        goal_id = request.args.get('id')
        goal = SavingsGoal.query.get_or_404(goal_id)
        if goal.user_id != session['user_id']:
            return jsonify({'error': 'Unauthorized'}), 401

        db.session.delete(goal)
        db.session.commit()
        return jsonify({'message': 'Savings goal deleted successfully'})

    # GET request
    goals = SavingsGoal.query.filter_by(user_id=session['user_id']).all()
    return jsonify([goal.get_status() for goal in goals])

@app.route('/api/savings-goals/<int:goal_id>/transactions')
@handle_errors
def get_goal_transactions(goal_id):
    """Get all transactions associated with a specific goal"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    goal = SavingsGoal.query.get_or_404(goal_id)
    if goal.user_id != session['user_id']:
        return jsonify({'error': 'Unauthorized'}), 401
        
    transactions = Transaction.query.filter_by(
        savings_goal_id=goal_id
    ).order_by(Transaction.date.desc()).all()
    
    return jsonify([{
        'id': t.id,
        'date': t.date.strftime('%Y-%m-%d'),
        'description': t.description,
        'amount': t.amount,
        'category_type': t.category_type
    } for t in transactions])

@app.route('/api/export')
@handle_errors
def export_data():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    export_type = request.args.get('type', 'transactions')
    format_type = request.args.get('format', 'csv')

    if export_type == 'transactions':
        data = Transaction.query.filter_by(user_id=session['user_id']).all()
        fields = ['date', 'description', 'amount', 'category_type', 'category_group', 'category', 'notes']
    elif export_type == 'budgets':
        data = Budget.query.filter_by(user_id=session['user_id']).all()
        fields = ['category_group', 'category', 'monthly_limit', 'alert_threshold', 'reset_day']
    else:
        return jsonify({'error': 'Invalid export type'}), 400

    if format_type == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(fields)

        for item in data:
            row = [getattr(item, field) for field in fields]
            writer.writerow(row)

        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'{export_type}.csv'
        )
    elif format_type == 'json':
        result = [{field: getattr(item, field) for field in fields} for item in data]
        return send_file(
            io.BytesIO(json.dumps(result, indent=2).encode('utf-8')),
            mimetype='application/json',
            as_attachment=True,
            download_name=f'{export_type}.json'
        )

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html', 
                         username=session.get('username'),
                         categories=CATEGORY_STRUCTURE)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            session['user_id'] = user.id
            session['username'] = user.username
            return redirect(url_for('index'))
        return render_template('login.html', error='Invalid username or password')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        email = request.form.get('email')
        
        if User.query.filter_by(username=username).first():
            return render_template('register.html', error='Username already exists')
            
        user = User(
            username=username,
            password_hash=generate_password_hash(password),
            email=email
        )
        db.session.add(user)
        db.session.commit()
        
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/api/budgets', methods=['GET'])
@handle_errors
def get_budgets():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 6, type=int)  # 6 cards per page

    # Get all budgets with pagination
    pagination = Budget.query.filter_by(user_id=session['user_id']).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        'budgets': [budget.get_status() for budget in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
        'last_updated': datetime.now().isoformat()
    })

@app.route('/api/budgets/<int:budget_id>', methods=['GET'])
@handle_errors
def get_budget(budget_id):
    """Get a specific budget by ID"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    budget = Budget.query.get_or_404(budget_id)
    if budget.user_id != session['user_id']:
        return jsonify({'error': 'Unauthorized'}), 401

    return jsonify(budget.get_status())

if __name__ == '__main__':
    try:
        with app.app_context():
            db.create_all()
            print("Database tables created successfully")
        app.run(debug=True)
    except Exception as e:
        print(f"Error initializing database: {str(e)}")
        raise
