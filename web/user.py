from flask import Flask, request, jsonify, Blueprint, send_file, current_app, make_response, render_template_string
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
from datetime import datetime, timedelta
import os
from .article import db
import jwt
from functools import wraps
import json
from flask_mail import Mail, Message

# 创建蓝图
auth_bp = Blueprint('auth', __name__)
CORS(auth_bp)

# 添加 JWT 密钥配置
JWT_SECRET_KEY = 'your-secret-key'  # 在实际应用中应该使用环境变量
JWT_EXPIRATION_DELTA = timedelta(days=1)  # Token 有效期1天

# 配置邮件发送
mail = Mail()

# 用户认证模块
"""
提供用户认证相关功能，包括：
- 用户模型定义
- 登录/注册处理
- 密码重置
- JWT token 认证
- 邮件发送
"""

# 用户模型
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    pwd = db.Column(db.String(128))  # 存储明文密码
    role = db.Column(db.Integer, nullable=False, default=1)  # 0: 管理员, 1: 用户
    status = db.Column(db.Integer, nullable=False, default=0)  # 0: 启用, 1: 禁用
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'status': self.status,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

    # 移除密码哈希相关方法
    def set_password(self, password):
        """设置用户密码
        TODO: 需要实现密码加密存储
        """
        self.pwd = password  # 安全隐患：当前为明文存储

    def check_password(self, password):
        """验证用户密码
        TODO: 需要实现加密密码验证
        """
        return self.pwd == password  # 安全隐患：明文比较

# 登录路由
@auth_bp.route('/api/login', methods=['POST'])
def login():
    """处理用户登录请求
    
    接受 POST 请求，包含:
        username: 用户名或邮箱
        password: 密码
    
    返回:
        成功: JWT token 和用户信息
        失败: 错误信息和状态码
    """
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
        # 检查用户状态
        if user.status != 0:
            response = make_response(
                json.dumps({
                    'message': '账号已被禁用'
                }, ensure_ascii=False)
            )
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response, 403

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
                'username': user.username,
                'id': user.id
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 200
    
    return jsonify({'message': '用户名或密码错误'}), 401

# 添加验证 token 的装饰器
def token_required(f):
    """JWT token 验证装饰器
    
    验证请求头中的 Authorization token
    格式: Bearer <token>
    
    装饰的函数将获得 current_user 参数
    """
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
        return jsonify({'message': '请提供完注册信息'}), 400
    
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
    
    if not data or not data.get('username_or_email'):
        response = make_response(
            json.dumps({
                'message': '请提供用户名或邮箱地址'
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 400
    
    username_or_email = data.get('username_or_email')
    user = None
    
    # 先尝试按邮箱查找
    user = User.query.filter_by(email=username_or_email).first()
    
    # 如果没找到，再按用户名查找
    if not user:
        user = User.query.filter_by(username=username_or_email).first()
    
    if not user:
        response = make_response(
            json.dumps({
                'message': '未找到该用户'
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 404
    
    try:
        # 生成重置密码的临时令牌
        reset_token = jwt.encode(
            {
                'user_id': user.id,
                'exp': datetime.utcnow() + timedelta(hours=1)  # 1小时有效期
            },
            JWT_SECRET_KEY,
            algorithm='HS256'
        )
        
        # 构建重置密码链接
        reset_url = f"{request.host_url}reset-password?token={reset_token}"
        
        # 发送重置密码邮件
        msg = Message(
            '重置密码请求 - AC.蚂蚁',
            sender='409974326@qq.com',
            recipients=[user.email]
        )
        msg.html = f'''
        <h2>重置密码</h2>
        <p>您好，我们收到了您的密码重置请求。</p>
        <p>请点击下面的链接重置您的密码：</p>
        <p><a href="{reset_url}">{reset_url}</a></p>
        <p>此链接将在1小时后失效。</p>
        <p>如果您没有请求重置密码，请忽略此邮件。</p>
        '''
        
        mail.send(msg)
        
        response = make_response(
            json.dumps({
                'message': '重置密码邮件已发送，请检查您的邮箱',
                'success': True
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
        
    except Exception as e:
        print(f"Error sending reset email: {str(e)}")
        response = make_response(
            json.dumps({
                'message': '发送重置邮件失败',
                'error': str(e)
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 500

@auth_bp.route('/reset-password')
def reset_password_page():
    try:
        token = request.args.get('token')
        if not token:
            return render_template_string(
                open(os.path.join(current_app.static_folder, 'views', 'error.html')).read(),
                message="无效的重置链接"
            )
        
        try:
            token_data = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            user = User.query.get(token_data['user_id'])
            
            if not user:
                return render_template_string(
                    open(os.path.join(current_app.static_folder, 'views', 'error.html')).read(),
                    message="用户不存在"
                )
                
        except jwt.ExpiredSignatureError:
            return render_template_string(
                open(os.path.join(current_app.static_folder, 'views', 'error.html')).read(),
                message="重置链接已过期，请重新申请"
            )
        except jwt.InvalidTokenError:
            return render_template_string(
                open(os.path.join(current_app.static_folder, 'views', 'error.html')).read(),
                message="无效的重置链接"
            )
            
        static_folder = current_app.static_folder
        file_path = os.path.join(static_folder, 'views', 'reset-password.html')
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            return render_template_string(
                open(os.path.join(current_app.static_folder, 'views', 'error.html')).read(),
                message="重置密码页面未找到"
            )
            
    except Exception as e:
        print(f"Error serving reset password page: {str(e)}")
        return render_template_string(
            open(os.path.join(current_app.static_folder, 'views', 'error.html')).read(),
            message="页面加载失败"
        )

@auth_bp.route('/api/reset-password', methods=['POST'])
def reset_password():
    """处理重置密码请求"""
    data = request.get_json()
    
    if not data or not data.get('token') or not data.get('password'):
        response = make_response(
            json.dumps({
                'message': '请提供完整的重置信息'
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 400
    
    try:
        # 验证token
        token_data = jwt.decode(data['token'], JWT_SECRET_KEY, algorithms=['HS256'])
        user = User.query.get(token_data['user_id'])
        
        if not user:
            response = make_response(
                json.dumps({
                    'message': '用户不存在'
                }, ensure_ascii=False)
            )
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response, 404
        
        # 更新密码
        user.set_password(data['password'])
        db.session.commit()
        
        response = make_response(
            json.dumps({
                'message': '密码重置成功',
                'success': True
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
        
    except Exception as e:
        print(f"Error resetting password: {str(e)}")
        response = make_response(
            json.dumps({
                'message': '重置密码失败',
                'error': str(e)
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 500

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

# 添加系统登录路由
@auth_bp.route('/api/system/login', methods=['POST'])
def system_login():
    """处理系统管理员登录请求
    
    接受 POST 请求，包含:
        username: 用户名或邮箱
        password: 密码
    
    返回:
        成功: JWT token 和用户信息
        失败: 错误信息和状态码
    """
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        response = make_response(
            json.dumps({
                'message': '请提供用户名和密码'
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 400
    
    # 支持用户名或邮箱登录
    username_or_email = data.get('username')
    user = User.query.filter(
        (User.username == username_or_email) | 
        (User.email == username_or_email)
    ).first()
    
    # 验证用户存在、密码正确且是管理员
    if user and user.check_password(data.get('password')):
        # 检查用户角色
        if user.role != 0:
            response = make_response(
                json.dumps({
                    'message': '权限不足，仅管理员可登录'
                }, ensure_ascii=False)
            )
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response, 403
            
        # 检查用户状态
        if user.status != 0:
            response = make_response(
                json.dumps({
                    'message': '账号已被禁用'
                }, ensure_ascii=False)
            )
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response, 403
        
        # 生成 JWT token
        token_data = {
            'user_id': user.id,
            'username': user.username,
            'role': user.role,
            'exp': datetime.utcnow() + JWT_EXPIRATION_DELTA
        }
        
        token = jwt.encode(token_data, JWT_SECRET_KEY, algorithm='HS256')
        if isinstance(token, bytes):
            token = token.decode('utf-8')
        
        # 返回成功响应
        response = make_response(
            json.dumps({
                'message': '登录成功',
                'token': token,
                'data': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'role': user.role
                }
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 200
    
    # 返回错误信息
    response = make_response(
        json.dumps({
            'message': '用户名或密码错误'
        }, ensure_ascii=False)
    )
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response, 401

@auth_bp.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    """获取用户列表
    
    Query参数:
    - page: 页码（默认1）
    - per_page: 每页数量（默认10）
    - username: 用户名搜索（可选）
    - role: 角色筛选（可选）
    - status: 状态筛选（可选）
    """
    # 检查是否是管理员
    if current_user.role != 0:
        return jsonify({'message': '权限不足'}), 403
    
    # 获取查询参数
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    username = request.args.get('username', '')
    role = request.args.get('role', type=int)
    status = request.args.get('status', type=int)
    
    # 构建查询
    query = User.query
    
    # 添加过滤条件
    if username:
        query = query.filter(User.username.like(f'%{username}%'))
    if role is not None:
        query = query.filter(User.role == role)
    if status is not None:
        query = query.filter(User.status == status)
    
    # 执行分页查询
    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, 
        per_page=per_page,
        error_out=False
    )
    
    # 构建响应数据
    response_data = {
        'users': [user.to_dict() for user in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page
    }
    
    return jsonify(response_data)

@auth_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@token_required
def update_user(current_user, user_id):
    """更新用户信息"""
    try:
        data = request.get_json()
        user = User.query.get(user_id)
        
        if not user:
            response = make_response(
                json.dumps({
                    'message': '用户不存在'
                }, ensure_ascii=False)
            )
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response, 404

        # 检查用户名是否已存在（排除当前用户）
        if 'username' in data:
            existing_user = User.query.filter(
                User.username == data['username'],
                User.id != user_id
            ).first()
            if existing_user:
                response = make_response(
                    json.dumps({
                        'message': '用户名已存在'
                    }, ensure_ascii=False)
                )
                response.headers['Content-Type'] = 'application/json; charset=utf-8'
                return response, 400

        # 检查邮箱是否已存在（排除当前用户）
        if 'email' in data:
            existing_user = User.query.filter(
                User.email == data['email'],
                User.id != user_id
            ).first()
            if existing_user:
                response = make_response(
                    json.dumps({
                        'message': '邮箱已存在'
                    }, ensure_ascii=False)
                )
                response.headers['Content-Type'] = 'application/json; charset=utf-8'
                return response, 400
            
        # 更新用户信息
        if 'username' in data:
            user.username = data['username']
        if 'email' in data:
            user.email = data['email']
        if 'role' in data:
            user.role = data['role']
        if 'status' in data:
            user.status = data['status']
        if 'password' in data and data['password']:
            user.set_password(data['password'])
            
        db.session.commit()
        
        response = make_response(
            json.dumps({
                'message': '更新成功',
                'data': user.to_dict()
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
        
    except Exception as e:
        print(f"Error updating user: {str(e)}")
        response = make_response(
            json.dumps({
                'message': '更新用户失败',
                'error': str(e)
            }, ensure_ascii=False)
        )
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response, 500

if __name__ == '__main__':
    app.run(debug=True)
