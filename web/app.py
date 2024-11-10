from flask import Flask, send_file
import os
from .article import article_bp, db, init_db
from .user import auth_bp, init_auth_db
from .resources import resources_bp
from .system import system_bp
from flask_cors import CORS
from flask_mail import Mail

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
