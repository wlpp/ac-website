from flask import Flask, request, jsonify, Blueprint, send_file, current_app
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
from datetime import datetime
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 创建蓝图
auth_bp = Blueprint('auth', __name__)
CORS(auth_bp)  # 为蓝图启用 CORS

# 用户模型
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    pwd = db.Column(db.String(128))
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

    def set_password(self, password):
        self.pwd = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.pwd, password)

# 登录路由
@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': '请提供用户名和密码'}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if user and user.check_password(data['password']):
        return jsonify({'message': '登录成功'}), 200
    
    return jsonify({'message': '用户名或密码错误'}), 401

# 注册路由
@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password') or not data.get('email'):
        return jsonify({'message': '请提供完整的注册信息'}), 400
    
    # 检查用户名是否存在
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': '用户名已存在'}), 400
    
    # 检查邮箱是否存在
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'message': '该邮箱已被注册'}), 400
    
    try:
        user = User(
            username=data['username'],
            email=data['email']
        )
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({'message': '注册成功'}), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '注册失败，请稍后重试'}), 500

@auth_bp.route('/login')
def login_page():
    """登录页面路由"""
    try:
        static_folder = current_app.static_folder
        file_path = os.path.join(static_folder, 'views', 'login.html')
        print(f"Attempting to serve file from: {file_path}")
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"File not found at: {file_path}")
            return "Login page not found", 404
    except Exception as e:
        print(f"Error serving login page: {str(e)}")
        return str(e), 500

@auth_bp.route('/register')
def register_page():
    """注册页面路由"""
    try:
        static_folder = current_app.static_folder
        file_path = os.path.join(static_folder, 'views', 'register.html')
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            return "Register page not found", 404
    except Exception as e:
        return str(e), 500

@auth_bp.route('/forgot-password')
def forgot_password_page():
    """忘记密码页面路由"""
    try:
        static_folder = current_app.static_folder
        file_path = os.path.join(static_folder, 'views', 'forgot-password.html')
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            return "Forgot password page not found", 404
    except Exception as e:
        return str(e), 500

@auth_bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    """处理忘记密码请求"""
    data = request.get_json()
    
    if not data or not data.get('email'):
        return jsonify({'message': '请提供邮箱地址'}), 400
    
    email = data.get('email')
    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({'message': '该邮箱未注册'}), 404
    
    try:
        # TODO: 实现发送重置密码邮件的逻辑
        # 1. 生成重置密码的临时令牌
        # 2. 发送包含重置链接的邮件
        # 3. 存储令牌到数据库或缓存中
        
        return jsonify({
            'message': '重置密码邮件已发送，请检查您的邮箱',
            'success': True
        })
    except Exception as e:
        return jsonify({
            'message': '发送重置邮件失败',
            'error': str(e)
        }), 500

def init_auth_db(app):
    """初始化用户数据库"""
    with app.app_context():
        try:
            db.create_all()
            print("User tables created successfully")
            
            # 检查是否需要添加测试用户
            if User.query.count() == 0:
                test_user = User(username='test_user')
                test_user.set_password('password123')
                db.session.add(test_user)
                db.session.commit()
                print("Test user added successfully")
                
        except Exception as e:
            print(f"User database initialization error: {str(e)}")
            db.session.rollback()

if __name__ == '__main__':
    app.run(debug=True)
