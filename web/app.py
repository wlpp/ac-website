from flask import Flask, send_file, make_response
import os
from .article import article_bp, db, init_db
from .user import auth_bp, init_auth_db
from .resources import resources_bp
from .system import system_bp
from flask_cors import CORS
from flask_mail import Mail
import json

def create_app():
    # 获取项目根目录
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # 配置静态文件目录
    app = Flask(__name__,
                static_folder=os.path.join(root_dir, 'src'),
                static_url_path='')
    
    # 启用 CORS
    CORS(app)
    
    # MySQL 数据库配置
    app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:123456@localhost:3306/ac-website'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['DEBUG'] = True
    app.config['SQLALCHEMY_ECHO'] = True
    
    # 邮件配置
    app.config['MAIL_SERVER'] = 'smtp.qq.com'  # QQ邮箱的SMTP服务器
    app.config['MAIL_PORT'] = 587  # SMTP端口号
    app.config['MAIL_USE_TLS'] = True  # 使用TLS加密
    app.config['MAIL_USERNAME'] = '409974326@qq.com'  # 你的QQ邮箱
    app.config['MAIL_PASSWORD'] = 'wfcflanbdoiwbhjf'  # 你的邮箱授权码（不是QQ密码）
    
    # 静态文件配置
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # 禁用缓存
    app.config['STATIC_FOLDER'] = os.path.join(os.path.dirname(__file__), '..', 'static')
    
    # 添加静态文件路由
    @app.route('/<path:filename>')
    def serve_static(filename):
        return send_file(os.path.join(app.config['STATIC_FOLDER'], filename))
    
    # 初始化数据库
    db.init_app(app)
    
    # 初始化Mail
    mail = Mail(app)
    
    # 注册蓝图
    app.register_blueprint(article_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(resources_bp)
    app.register_blueprint(system_bp)
    
    # 创建数据库表并添加测试数据
    with app.app_context():
        try:
            db.create_all()
            init_db(app)
            init_auth_db()
        except Exception as e:
            print(f"Error creating tables or initializing data: {str(e)}")
    
    # 添加 JSON 配置
    app.config['JSON_AS_ASCII'] = False
    app.config['JSONIFY_MIMETYPE'] = "application/json;charset=utf-8"
    
    return app

app = create_app()

@app.route('/')
def index():
    """首页路由"""
    try:
        file_path = os.path.join(app.static_folder, 'views', 'index.html')
        print(f"Attempting to serve index file from: {file_path}")
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"Index file not found at: {file_path}")
            return "Index page not found", 404
    except Exception as e:
        print(f"Error serving index page: {str(e)}")
        return str(e), 500

# 修改 after_request 处理器
@app.after_request
def after_request(response):
    # 只对 JSON 响应进行处理
    if response.mimetype == 'application/json':
        try:
            # 获取原始数据
            data = response.get_json()
            # 重新设置响应，移除 encoding 参数
            response.set_data(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
        except Exception as e:
            print(f"Error in after_request: {str(e)}")
            pass
    
    # 添加 CORS 头
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    
    return response

# 添加错误处理器
@app.errorhandler(Exception)
def handle_error(error):
    response = make_response(
        json.dumps({
            'message': str(error),
            'error': True
        }, ensure_ascii=False).encode('utf-8'),
        500 if not hasattr(error, 'code') else error.code
    )
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)