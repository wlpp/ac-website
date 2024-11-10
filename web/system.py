from flask import Blueprint, send_file
import os

# 创建系统管理蓝图
system_bp = Blueprint('system', __name__, url_prefix='/system')

# 添加这个函数来获取正确的根目录
def get_root_dir():
    """获取项目根目录"""
    current_dir = os.path.dirname(os.path.abspath(__file__))  # web目录
    return os.path.dirname(current_dir)  # 项目根目录

@system_bp.route('/')
@system_bp.route('/index.html')
def system_index():
    """系统管理后台首页路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'views', 'index.html')
        print(f"Index path: {file_path}")  # 调试信息
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"File not found: {file_path}")  # 添加调试日志
            return "System admin page not found", 404
    except Exception as e:
        print(f"Error: {str(e)}")  # 调试信息
        return str(e), 500

# 添加新的路由处理子页面
@system_bp.route('/views/<path:subpath>.html')
def serve_views(subpath):
    """处理视图文件的路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'views', f"{subpath}.html")
        print(f"View path: {file_path}")  # 调试日志
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"View file not found: {file_path}")  # 调试日志
            return f"View not found: {subpath}.html", 404
    except Exception as e:
        print(f"Error serving view: {str(e)}")  # 调试日志
        return str(e), 404

@system_bp.route('/css/<path:filename>')
def serve_css(filename):
    """处理 CSS 文件的路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'css', filename)
        print(f"CSS path: {file_path}")
        
        if os.path.exists(file_path):
            return send_file(file_path, mimetype='text/css')
        else:
            return f"CSS file not found: {file_path}", 404
    except Exception as e:
        print(f"Error serving CSS: {str(e)}")
        return str(e), 404

@system_bp.route('/js/<path:filename>')
def serve_js(filename):
    """处理 JS 文件的路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'js', filename)
        print(f"JS path: {file_path}")
        
        if os.path.exists(file_path):
            return send_file(file_path, mimetype='application/javascript')
        else:
            return f"JavaScript file not found: {file_path}", 404
    except Exception as e:
        print(f"Error serving JS: {str(e)}")
        return str(e), 404

@system_bp.route('/login')
def system_login():
    """系统登录页面路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'login.html')
        print(f"Login path: {file_path}")  # 调试信息
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            return "Login page not found", 404
    except Exception as e:
        print(f"Error serving login page: {str(e)}")  # 调试信息
        return str(e), 500

# 添加静态文件路由
@system_bp.route('/<path:filename>')
def serve_static(filename):
    """处理静态文件的路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', filename)
        print(f"Static file path: {file_path}")  # 调试日志
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"Static file not found: {file_path}")  # 调试日志
            return f"File not found: {filename}", 404
    except Exception as e:
        print(f"Error serving static file: {str(e)}")  # 调试日志
        return str(e), 404
