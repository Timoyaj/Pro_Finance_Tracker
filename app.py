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
        'Regular Income': ['Salary/Wages', 'Business Income', 'Freelance Income'],
        'Passive Income': ['Investments', 'Rental Income', 'Interest/Dividends'],
        'Other Income': ['Gifts', 'Bonuses', 'Miscellaneous Income']
    },
    'expense': {
        'Housing & Utilities': ['Rent/Mortgage', 'Utilities', 'Maintenance'],
        'Transportation': ['Fuel', 'Public Transit', 'Vehicle Expenses'],
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
    notes = db.Column(db.Text, nullable=True)
    is_recurring = db.Column(db.Boolean, default=False)
    recurring_frequency = db.Column(db.String(20), nullable=True)  # 'weekly', 'monthly', 'yearly'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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

        total_spent = db.session.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.category == self.category,
            Transaction.date >= month_start,
            Transaction.amount < 0
        ).scalar() or 0

        return abs(total_spent)

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

@app.route('/api/categories')
@handle_errors
def get_categories():
    """Get all available categories"""
    return jsonify(CATEGORY_STRUCTURE)

@app.route('/api/transactions', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_transactions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.json
            required_fields = ['description', 'amount', 'category_type', 'category_group', 'category']
            if not all(field in data for field in required_fields):
                return jsonify({'error': 'Missing required fields'}), 400

            transaction = Transaction(
                description=data['description'],
                amount=float(data['amount']),
                category_type=data['category_type'],
                category_group=data['category_group'],
                category=data['category'],
                notes=data.get('notes', ''),
                is_recurring=data.get('is_recurring', False),
                recurring_frequency=data.get('recurring_frequency'),
                user_id=session['user_id']
            )
            db.session.add(transaction)
            db.session.commit()

            return jsonify({
                'message': 'Transaction added successfully',
                'id': transaction.id
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

@app.route('/api/budget-status')
@handle_errors
def get_budget_status():
    """Get real-time budget status"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    budgets = Budget.query.filter_by(user_id=session['user_id']).all()
    status = []

    for budget in budgets:
        current_usage = budget.get_current_usage()
        percentage_used = (current_usage / budget.monthly_limit) * 100 if budget.monthly_limit > 0 else 0
        
        status.append({
            'category_group': budget.category_group,
            'category': budget.category,
            'monthly_limit': budget.monthly_limit,
            'current_usage': current_usage,
            'percentage_used': percentage_used,
            'status': 'danger' if percentage_used >= 100 else 
                     'warning' if percentage_used >= budget.alert_threshold * 100 else 'good',
            'remaining': budget.monthly_limit - current_usage,
            'alert_threshold': budget.alert_threshold * 100
        })

    return jsonify({
        'budgets': status,
        'last_updated': datetime.now().isoformat()
    })

@app.route('/api/analytics')
@handle_errors
def get_analytics():
    """Get comprehensive financial analytics"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    # Get date ranges
    today = datetime.now()
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)
    
    # Query all user transactions within relevant timeframes
    transactions = Transaction.query.filter(
        Transaction.user_id == session['user_id']
    ).all()

    # Calculate various metrics
    monthly_summary = {
        'income': sum(t.amount for t in transactions 
                     if t.date >= month_start and t.category_type == 'income'),
        'expenses': abs(sum(t.amount for t in transactions 
                          if t.date >= month_start and t.category_type == 'expense')),
        'savings_rate': 0  # Will be calculated below
    }
    
    # Calculate savings rate
    if monthly_summary['income'] > 0:
        monthly_summary['savings_rate'] = ((monthly_summary['income'] - 
                                          monthly_summary['expenses']) / 
                                         monthly_summary['income']) * 100

    # Category breakdown
    category_breakdown = {}
    for t in transactions:
        if t.date >= month_start:
            key = t.category_group
            if key not in category_breakdown:
                category_breakdown[key] = 0
            category_breakdown[key] += abs(t.amount)

    # Monthly trends (last 6 months)
    six_months_ago = today - timedelta(days=180)
    monthly_trends = {}
    for t in transactions:
        if t.date >= six_months_ago:
            month_key = t.date.strftime('%Y-%m')
            if month_key not in monthly_trends:
                monthly_trends[month_key] = {'income': 0, 'expenses': 0}
            if t.category_type == 'income':
                monthly_trends[month_key]['income'] += t.amount
            else:
                monthly_trends[month_key]['expenses'] += abs(t.amount)

    return jsonify({
        'summary': monthly_summary,
        'category_breakdown': category_breakdown,
        'monthly_trends': monthly_trends,
        'budgets': get_budget_status().json,
        'last_updated': datetime.now().isoformat()
    })

@app.route('/api/budgets', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_budgets():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.json
            budget = Budget(
                category_group=data['category_group'],
                category=data['category'],
                monthly_limit=float(data['monthly_limit']),
                alert_threshold=float(data.get('alert_threshold', 0.8)),
                reset_day=int(data.get('reset_day', 1)),
                user_id=session['user_id']
            )
            db.session.add(budget)
            db.session.commit()
            return jsonify({'message': 'Budget created successfully', 'id': budget.id})
        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

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

@app.route('/api/savings-goals', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_savings_goals():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.json
            goal = SavingsGoal(
                name=data['name'],
                target_amount=float(data['target_amount']),
                current_amount=float(data.get('current_amount', 0)),
                target_date=datetime.strptime(data['target_date'], '%Y-%m-%d'),
                category=data['category'],
                priority=int(data.get('priority', 1)),
                user_id=session['user_id']
            )
            db.session.add(goal)
            db.session.commit()
            return jsonify({'message': 'Savings goal created successfully', 'id': goal.id})
        except (KeyError, ValueError) as e:
            return jsonify({'error': str(e)}), 400

    elif request.method == 'PUT':
        try:
            data = request.json
            goal = SavingsGoal.query.get_or_404(data['id'])
            if goal.user_id != session['user_id']:
                return jsonify({'error': 'Unauthorized'}), 401

            # Update fields if provided
            for field in ['name', 'target_amount', 'current_amount', 'target_date', 'category', 'priority']:
                if field in data:
                    setattr(goal, field, data[field])
            
            db.session.commit()
            return jsonify({'message': 'Savings goal updated successfully'})
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
    return jsonify([{
        'id': g.id,
        'name': g.name,
        'target_amount': g.target_amount,
        'current_amount': g.current_amount,
        'target_date': g.target_date.strftime('%Y-%m-%d'),
        'category': g.category,
        'priority': g.priority,
        'progress': (g.current_amount / g.target_amount * 100) if g.target_amount > 0 else 0
    } for g in goals])

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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)