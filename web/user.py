from flask import Flask, request, jsonify, Blueprint, send_file, current_app, make_response
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
from datetime import datetime, timedelta
import os
from .article import db
import jwt
from functools import wraps
import json

# 创建蓝图
auth_bp = Blueprint('auth', __name__)
CORS(auth_bp)

# 添加 JWT 密钥配置
JWT_SECRET_KEY = 'your-secret-key'  # 在实际应用中应该使用环境变量
JWT_EXPIRATION_DELTA = timedelta(days=1)  # Token 有效期1天

# 用户模型
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    pwd = db.Column(db.String(128))  # 存储明文密码
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

    # 移除密码哈希相关方法
    def set_password(self, password):
        self.pwd = password  # 直接存储明文密码

    def check_password(self, password):
        return self.pwd == password  # 直接比较明文密码

# 登录路由
@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': '请提供用户名和密码'}), 400
    
    # 支持用户名或邮箱登录
    username_or_email = data.get('username')
    user = User.query.filter(
        (User.username == username_or_email) | 
        (User.email == username_or_email)
    ).first()
    
    if user and user.check_password(data.get('password')):
        # 生成 JWT token
        token_data = {
            'user_id': user.id,
            'username': user.username,
            'exp': datetime.utcnow() + JWT_EXPIRATION_DELTA
        }
        
        token = jwt.encode(token_data, JWT_SECRET_KEY, algorithm='HS256')
        if isinstance(token, bytes):
            token = token.decode('utf-8')
        
        # 使用 Response 对象返回，设置 ensure_ascii=False
        response = make_response(
            json.dumps({
                'message': '登录成功',
                'token': token,
                'username': user.username
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 200
    
    return jsonify({'message': '用户名或密码错误'}), 401

# 添加验证 token 的装饰器
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': '缺少认证token'}), 401
        
        try:
            # 去掉 'Bearer ' 前缀
            if token.startswith('Bearer '):
                token = token[7:]
            data = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            current_user = User.query.get(data['user_id'])
        except:
            return jsonify({'message': '无效的token'}), 401
            
        return f(current_user, *args, **kwargs)
    
    return decorated

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
            email=data['email'],
            pwd=data['password']  # 直接存储密码
        )
        
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

def init_auth_db():
    """初始化用户数据库"""
    try:
        # 检查是否需要添加测试用户
        if User.query.count() == 0:
            test_user = User(
                username='test_user',
                email='test@example.com'
            )
            test_user.set_password('password123')
            db.session.add(test_user)
            db.session.commit()
            print("Test user added successfully")
                
    except Exception as e:
        print(f"User database initialization error: {str(e)}")
        db.session.rollback()

if __name__ == '__main__':
    app.run(debug=True)
