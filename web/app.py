from flask import Flask, send_file
import os
from .article import article_bp, db, init_db
from .user import auth_bp, init_auth_db
from flask_cors import CORS

def create_app():
    # 获取项目根目录
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # 配置静态文件目录
    app = Flask(__name__,
                static_folder=os.path.join(root_dir, 'src'),
                static_url_path='')
    
    # 添加调试路由来验证路径
    @app.route('/debug/paths')
    def debug_paths():
        return {
            'static_folder': app.static_folder,
            'root_dir': root_dir,
            'login_path': os.path.join(app.static_folder, 'views', 'login.html'),
            'exists': os.path.exists(os.path.join(app.static_folder, 'views', 'login.html'))
        }
    
    # 启用 CORS
    CORS(app)
    
    # 添加根路由
    @app.route('/')
    def index():
        index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'src', 'views', 'index.html')
        return send_file(index_path)
    
    # MySQL 数据库配置
    app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:123456@localhost:3306/ac-website'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # 启用详细错误信息
    app.config['DEBUG'] = True
    app.config['SQLALCHEMY_ECHO'] = True
    
    # 初始化数据库
    db.init_app(app)
    
    # 注册蓝图
    app.register_blueprint(article_bp)
    app.register_blueprint(auth_bp)
    
    # 创建数据库表并添加测试数据
    with app.app_context():
        try:
            db.create_all()
            init_db(app)
            init_auth_db(app)
        except Exception as e:
            print(f"Error creating tables or initializing data: {str(e)}")
    
    return app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
