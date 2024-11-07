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
    
    # 启用 CORS
    CORS(app)
    
    # MySQL 数据库配置
    app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:123456@localhost:3306/ac-website'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
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
            init_db()
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
