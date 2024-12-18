from flask import Blueprint, send_file, request, redirect, url_for
from functools import wraps
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

def require_main_entry(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 检查 Referer 头，确保请求来自合法页面
        referer = request.headers.get('Referer', '')
        allowed_paths = ['/system/index.html', '/system/views/index.html']
        
        # 如果是直接访问子页面（非 AJAX 请求）且不是来自允许的页面
        if (not request.headers.get('X-Requested-With') == 'XMLHttpRequest' and 
            not any(path in referer for path in allowed_paths)):
            return redirect('/system/index.html')
            
        return f(*args, **kwargs)
    return decorated_function

# 修改子页面路由
@system_bp.route('/views/<path:subpath>.html')
@require_main_entry
def serve_views(subpath):
    """处理视图文件的路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'views', f"{subpath}.html")
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            return f"View not found: {subpath}.html", 404
    except Exception as e:
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
@system_bp.route('/login.html')
def system_login():
    """系统登录页面路由"""
    try:
        root_dir = get_root_dir()
        file_path = os.path.join(root_dir, 'system', 'views', 'login.html')
        print(f"Login path: {file_path}")  # 调试信息
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"Login file not found at: {file_path}")  # 添加更详细的调试信息
            return "Login page not found", 404
    except Exception as e:
        print(f"Error serving login page: {str(e)}")
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