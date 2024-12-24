# app.py - Updated with new features
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
import json  # Add this import
import pandas as pd
import io
import csv
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///finance_tracker.db'
db = SQLAlchemy(app)

# Verify templates directory
template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
if not os.path.exists(template_dir):
    os.makedirs(template_dir)

# Database Models remain the same
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    transactions = db.relationship('Transaction', backref='user', lazy=True)

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    description = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    notes = db.Column(db.Text, nullable=True)  # New field for additional notes

# Add this new model for budget tracking
class Budget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)
    limit = db.Column(db.Float, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# Add this new model for savings goals
class SavingsGoal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    target_amount = db.Column(db.Float, nullable=False)
    current_amount = db.Column(db.Float, default=0)
    target_date = db.Column(db.DateTime, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# Enhanced error handling decorator
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
@app.route('/api/transactions', methods=['GET', 'POST', 'PUT', 'DELETE'])
@handle_errors
def handle_transactions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if request.method == 'POST':
        try:
            data = request.json
            # Input validation
            if not all(key in data for key in ['description', 'amount', 'category']):
                return jsonify({'error': 'Missing required fields'}), 400
            
            transaction = Transaction(
                description=data['description'],
                amount=float(data['amount']),  # Convert amount to float
                category=data['category'],
                notes=data.get('notes', ''),
                user_id=session['user_id']
            )
            db.session.add(transaction)
            db.session.commit()
            return jsonify({
                'message': 'Transaction added successfully',
                'id': transaction.id
            })
        except (KeyError, ValueError) as e:
            return jsonify({
                'error': 'Invalid transaction data. Required fields: description, amount, category'
            }), 400
    
    elif request.method == 'PUT':
        data = request.json
        transaction = Transaction.query.get_or_404(data['id'])
        if transaction.user_id != session['user_id']:
            return jsonify({'error': 'Unauthorized'}), 401
            
        transaction.description = data.get('description', transaction.description)
        transaction.amount = data.get('amount', transaction.amount)
        transaction.category = data.get('category', transaction.category)
        transaction.notes = data.get('notes', transaction.notes)
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
    filter_category = request.args.get('category')
    date_from = request.args.get('from')
    date_to = request.args.get('to')
    
    query = Transaction.query.filter_by(user_id=session['user_id'])
    
    if filter_category:
        query = query.filter_by(category=filter_category)
    if date_from:
        query = query.filter(Transaction.date >= datetime.strptime(date_from, '%Y-%m-%d'))
    if date_to:
        query = query.filter(Transaction.date <= datetime.strptime(date_to, '%Y-%m-%d'))
    
    transactions = query.all()
    return jsonify([{
        'id': t.id,
        'date': t.date.strftime('%Y-%m-%d'),
        'description': t.description,
        'amount': t.amount,
        'category': t.category,
        'notes': t.notes
    } for t in transactions])

# Add budget usage calculation to analytics route
@app.route('/api/analytics')
@handle_errors
def get_analytics():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Get current month's start and end dates
    today = datetime.now()
    month_start = today.replace(day=1)
    
    transactions = Transaction.query.filter(
        Transaction.user_id == session['user_id'],
        Transaction.date >= month_start
    ).all()
    
    budgets = Budget.query.filter_by(user_id=session['user_id']).all()
    
    # Calculate budget usage
    budget_usage = {}
    for budget in budgets:
        spent = sum(t.amount for t in transactions 
                   if t.category == budget.category and t.amount < 0)
        budget_usage[budget.category] = {
            'limit': budget.limit,
            'used': abs(spent),
            'remaining': budget.limit + spent
        }

    # Monthly trends
    monthly_data = {}
    for t in transactions:
        month = t.date.strftime('%Y-%m')
        if month not in monthly_data:
            monthly_data[month] = {'income': 0, 'expenses': 0}
        if t.amount > 0:
            monthly_data[month]['income'] += t.amount
        else:
            monthly_data[month]['expenses'] += abs(t.amount)
    
    # Category breakdown
    category_data = {}
    for t in transactions:
        if t.category not in category_data:
            category_data[t.category] = 0
        category_data[t.category] += t.amount
    
    # Daily average spending
    daily_avg = sum(t.amount for t in transactions if t.amount < 0) / 30
    
    return jsonify({
        'monthly_trends': monthly_data,
        'category_breakdown': category_data,
        'daily_average': abs(daily_avg),
        'top_categories': sorted(category_data.items(), key=lambda x: abs(x[1]), reverse=True)[:5],
        'budget_usage': budget_usage
    })

@app.route('/api/export')
@handle_errors
def export_data():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    format_type = request.args.get('format', 'csv')
    transactions = Transaction.query.filter_by(user_id=session['user_id']).all()
    
    if format_type == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Date', 'Description', 'Amount', 'Category', 'Notes'])
        
        for t in transactions:
            writer.writerow([
                t.date.strftime('%Y-%m-%d'),
                t.description,
                t.amount,
                t.category,
                t.notes
            ])
            
        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name='transactions.csv'
        )
    
    elif format_type == 'json':
        data = [{
            'date': t.date.strftime('%Y-%m-%d'),
            'description': t.description,
            'amount': t.amount,
            'category': t.category,
            'notes': t.notes
        } for t in transactions]
        
        return send_file(
            io.BytesIO(json.dumps(data, indent=2).encode('utf-8')),
            mimetype='application/json',
            as_attachment=True,
            download_name='transactions.json'
        )

@app.route('/api/budgets', methods=['GET', 'POST'])  # Note the plural 'budgets'
@handle_errors
def handle_budgets():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.get_json()  # Use get_json() instead of .json
            if not data:
                return jsonify({'error': 'No data provided'}), 400
                
            budget = Budget(
                category=data['category'],
                limit=float(data['limit']),
                user_id=session['user_id']
            )
            db.session.add(budget)
            db.session.commit()
            return jsonify({
                'message': 'Budget set successfully',
                'data': {'category': budget.category, 'limit': budget.limit}
            })
        except (KeyError, ValueError, TypeError) as e:
            return jsonify({'error': f'Invalid data: {str(e)}'}), 400

    budgets = Budget.query.filter_by(user_id=session['user_id']).all()
    return jsonify([{
        'category': b.category,
        'limit': b.limit,
        'used': sum(t.amount for t in Transaction.query.filter_by(
            user_id=session['user_id'],
            category=b.category
        ).all() if t.amount < 0)
    } for b in budgets])

@app.route('/api/goals', methods=['GET', 'POST'])
@handle_errors
def handle_goals():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if request.method == 'POST':
        try:
            data = request.get_json()  # Use get_json() instead of .json
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            # Convert kebab-case to snake_case in field names
            goal = SavingsGoal(
                name=data.get('name') or data.get('goal-name'),  # Handle both formats
                target_amount=float(data.get('target_amount') or data.get('target-amount')),
                target_date=datetime.strptime(data.get('target_date') or data.get('target-date'), '%Y-%m-%d'),
                user_id=session['user_id']
            )
            db.session.add(goal)
            db.session.commit()
            return jsonify({
                'message': 'Goal added successfully',
                'data': {
                    'name': goal.name,
                    'target_amount': goal.target_amount,
                    'target_date': goal.target_date.strftime('%Y-%m-%d')
                }
            })
        except Exception as e:
            return jsonify({'error': f'Invalid data: {str(e)}'}), 400

    goals = SavingsGoal.query.filter_by(user_id=session['user_id']).all()
    return jsonify([{
        'name': g.name,
        'target_amount': g.target_amount,
        'current_amount': g.current_amount,
        'target_date': g.target_date.strftime('%Y-%m-%d')
    } for g in goals])

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html', username=session.get('username'))

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
        confirm_password = request.form['confirm_password']
        
        if password != confirm_password:
            return render_template('register.html', error='Passwords do not match')
            
        if User.query.filter_by(username=username).first():
            return render_template('register.html', error='Username already exists')
            
        user = User(
            username=username,
            password_hash=generate_password_hash(password)
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
