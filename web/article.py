from flask import Blueprint, request, Response, json, make_response, jsonify, render_template, send_file
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc
from flask_cors import CORS
import os
from random import randint

db = SQLAlchemy()

# 文章管理模块
"""
提供文章相关功能，包括：
- 文章模型定义
- 文章的 CRUD 操作
- 文章搜索
- 分页显示
"""

# 创建文章模型
class Article(db.Model):
    """文章模型
    
    属性:
        id: 主键
        article_id: 文章唯一标识
        title: 标题
        content: 内容
        image_url: 配图URL
        created_at: 创建时间
        n_date: 发布日期
        tag: 文章标签 (0:软件, 1:游戏, 2:小说)
        status: 文章状态 (0:草稿, 1:已发布)
        views: 浏览量
    """
    __tablename__ = 'articles'
    
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.String(50))
    title = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    image_url = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.now)
    n_date = db.Column(db.Date, nullable=True)
    tag = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.Integer, nullable=False, default=0)
    views = db.Column(db.Integer, default=0)

    def to_dict(self, include_views=False):
        data = {
            'id': self.id,
            'article_id': self.article_id,
            'title': self.title,
            'content': self.content,
            'image_url': self.image_url,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if isinstance(self.created_at, datetime) else self.created_at,
            'n_date': self.n_date.strftime('%Y-%m-%d') if isinstance(self.n_date, datetime) else self.n_date,
            'tag': self.tag,
            'status': self.status
        }
        if include_views:
            data['views'] = self.views
        return data

# 创建文章内容模型
class ArticleContent(db.Model):
    """文章详情模型
    
    用于存储文章的完整内容
    与 Article 模型通过 article_id 关联
    """
    __tablename__ = 'articleContent'
    
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.String(50), index=True)
    title = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'article_id': self.article_id,
            'title': self.title,
            'content': self.content
        }

# 改评论模型
class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, nullable=False)
    username = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    parent_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'article_id': self.article_id,
            'user_id': self.user_id,
            'username': self.username,
            'content': self.content,
            'parent_id': self.parent_id,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

# 游戏下载信息模型
class GameDownload(db.Model):
    """游戏下载信息模型
    
    属性:
        id: 主键
        article_id: 关联的文章ID
        url: 下载链接
        code: 提取码
        decryption: 解压密码
        created_at: 创建时间
    """
    __tablename__ = 'game_downloads'
    
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.String(50), db.ForeignKey('articles.article_id'), nullable=False)
    url = db.Column(db.String(255), nullable=False)
    code = db.Column(db.String(50))
    decryption = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'article_id': self.article_id,
            'url': self.url,
            'code': self.code,
            'decryption': self.decryption,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

def init_db(app):
    """初始化数据库
    
    - 创建所需的数据表
    - 添加测试数据（如果数据库为空）
    """
    with app.app_context():
        try:
            # 创建表
            db.create_all()
            print("Tables created successfully")
            
            # 检查是否需要添加测试数据
            if Article.query.count() == 0:
                # 添加测试数据
                test_articles = [
                    Article(
                        title=f'测试文章 {i}',
                        content=f'这是测试文章 {i} 的内容'
                    ) for i in range(1, 6)
                ]
                
                db.session.add_all(test_articles)
                db.session.commit()
                print("Test data added successfully")
                
            # 添加 ArticleContent 测试数据
            if ArticleContent.query.count() == 0:
                test_contents = [
                    ArticleContent(
                        title=f'文章详情 {i}',
                        content=f'这是文章详情 {i} 的详细内容'
                    ) for i in range(1, 6)
                ]
                
                db.session.add_all(test_contents)
                db.session.commit()
                print("ArticleContent test data added successfully")
                
        except Exception as e:
            print(f"Database initialization error: {str(e)}")
            db.session.rollback()

# 创建蓝图
article_bp = Blueprint('article', __name__)
CORS(article_bp)  # 为蓝图启用 CORS

@article_bp.route('/')
def index():
    """首页路由"""
    try:
        static_folder = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(static_folder, 'src', 'views', 'index.html')
        print(f"Attempting to serve index file from: {file_path}")
        
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            print(f"Index file not found at: {file_path}")
            return "Index page not found", 404
    except Exception as e:
        print(f"Error serving index page: {str(e)}")
        return str(e), 500

@article_bp.route('/api/articles')
def get_articles():
    """获取文章列表
    
    支持分页查询:
        page: 页码（默认1）
        per_page: 每页数量（默认10，可选值：10,12,16,20,30）
        type: 查询类型（0:返回所有文章，不传或其他值:只返回已发布文章）
        sort: 排序方式（0:按article_id字符串排序，1:按views排序，不传或其他值:按created_at排序）
        tag: 文章标签（0:软件, 1:游戏, 2:小说，不传则返回所有）
    """
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        query_type = request.args.get('type')
        sort_type = request.args.get('sort')
        tag = request.args.get('tag')
        
        # 限制per_page的可选值
        allowed_per_page = [10, 12, 16, 20, 30]
        if per_page not in allowed_per_page:
            per_page = 10
            
        # 构建基础查询
        query = Article.query
        
        # 默认回已发布文章
        if query_type != '0':
            query = query.filter(Article.status == 1)
            
        # 根据tag参数筛选文章
        include_views = False
        if tag is not None:
            query = query.filter(Article.tag == int(tag))
            # 当tag=1（游戏）时，设置include_views为True
            if int(tag) == 1:
                include_views = True
        
        # 排序处理
        if sort_type == '0':
            query = query.order_by(Article.article_id)
        elif sort_type == '1':
            query = query.order_by(desc(Article.views))  # 按浏览量降序排序
        else:
            query = query.order_by(desc(Article.created_at))
        
        # 分页
        articles = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        if articles.items:
            return jsonify({
                'success': True,
                'data': [article.to_dict(include_views=include_views) for article in articles.items],
                'total': articles.total,
                'pages': articles.pages,
                'current_page': page
            })
        
        return jsonify({
            'success': True,
            'data': [],
            'total': 0,
            'pages': 0,
            'current_page': page
        })
            
    except Exception as e:
        print("Error getting articles:", str(e))
        return jsonify({
            'success': False,
            'error': '服务器错误',
            'message': str(e)
        }), 500

@article_bp.route('/api/articles', methods=['POST'])
def create_article():
    """创建新文章"""
    data = request.get_json()
    
    if not data or 'title' not in data or 'content' not in data:
        return Response(
            json.dumps({'error': '标题和内容不能为空'}, ensure_ascii=False),
            status=400,
            mimetype='application/json'
        )
    
    try:
        # 查询是否存在相同标题的文章
        existing_article = Article.query.filter_by(title=data['title']).first()
        
        if existing_article:
            # 如果存在，更新现有文章
            existing_article.content = data['content']
            existing_article.image_url = data.get('image_url')
            existing_article.tag = data.get('tag', 0)
            existing_article.status = data.get('status', 0)
            db.session.commit()
            
            return Response(
                json.dumps({
                    'message': '文章已更新',
                    'data': existing_article.to_dict()
                }, ensure_ascii=False),
                status=200,
                mimetype='application/json'
            )
        else:
            # 如果不存在，创建新文章
            article = Article(
                title=data['title'],
                content=data['content'],
                image_url=data.get('image_url'),
                tag=data.get('tag', 0),
                status=data.get('status', 0)
            )
            
            # 先保存以获取 id
            db.session.add(article)
            db.session.commit()
            
            # 生成带随机数的 article_id
            random_num = randint(100, 1000)
            article.article_id = f'{article.id}{random_num}'
            db.session.commit()
            
            return Response(
                json.dumps({
                    'message': '文章已创建',
                    'data': article.to_dict()
                }, ensure_ascii=False),
                status=201,
                mimetype='application/json'
            )
            
    except Exception as e:
        db.session.rollback()
        return Response(
            json.dumps({
                'error': '创建文章失败',
                'message': str(e)
            }, ensure_ascii=False),
            status=500,
            mimetype='application/json'
        )

@article_bp.route('/articles/<string:article_id>', methods=['GET'])
def get_article(article_id):
    """获取指定文章"""
    article = Article.query.filter_by(article_id=article_id).first()
    if article is None:
        return Response(
            json.dumps({'error': '文章不存在'}, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    return Response(
        json.dumps(article.to_dict(), ensure_ascii=False),
        mimetype='application/json'
    )

@article_bp.route('/articles/<string:article_id>', methods=['PUT'])
def update_article(article_id):
    """更新指定文章"""
    article = Article.query.filter_by(article_id=article_id).first()
    if article is None:
        return Response(
            json.dumps({'error': '文章不存在'}, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    
    data = request.get_json()
    if not data:
        return Response(
            json.dumps({'error': '更新数据不能为空'}, ensure_ascii=False),
            status=400,
            mimetype='application/json'
        )
    
    try:
        # 更新字段
        if 'title' in data:
            article.title = data['title']
        if 'content' in data:
            article.content = data['content']
        if 'image_url' in data:
            article.image_url = data['image_url']
        if 'tag' in data:
            article.tag = data['tag']
        if 'status' in data:  # 添加 status 字段处理
            article.status = data['status']
            # 如果发布文章，设置发布日期
            if data['status'] == 1:
                article.n_date = datetime.now().date()
        if 'n_date' in data:
            article.n_date = datetime.strptime(data['n_date'], '%Y-%m-%d')
        
        db.session.commit()
        
        return Response(
            json.dumps({
                'success': True,
                'message': '文章状态更新成功',
                'data': article.to_dict()
            }, ensure_ascii=False),
            mimetype='application/json'
        )
        
    except Exception as e:
        db.session.rollback()
        return Response(
            json.dumps({
                'success': False,
                'error': '更新文章失败',
                'message': str(e)
            }, ensure_ascii=False),
            status=500,
            mimetype='application/json'
        )

@article_bp.route('/articles/<string:article_id>', methods=['DELETE'])
def delete_article(article_id):
    """删除指定文章"""
    article = Article.query.filter_by(article_id=article_id).first()
    if article is None:
        return Response(
            json.dumps({'error': '文章不存在'}, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    
    db.session.delete(article)
    db.session.commit()
    
    return '', 204

@article_bp.route('/article/<string:article_id>')
def article_page(article_id):
    """文章详情页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'article.html')
    return send_file(file_path)

@article_bp.route('/api/article-content/<string:article_id>', methods=['GET'])
def get_article_content(article_id):
    """获取文章详情内容"""
    article_content = ArticleContent.query.filter_by(article_id=article_id).first()
    if article_content is None:
        return Response(
            json.dumps({'error': '文章详情不存在'}, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    return Response(
        json.dumps(article_content.to_dict(), ensure_ascii=False),
        mimetype='application/json'
    )

@article_bp.route('/api/articles/search')
def search_articles():
    """搜索文章
    
    支持以下搜索参数:
    - keyword: 搜索关键词（标题和内容）
    - tag: 文章标签（0:软件, 1:游戏, 2:小说）
    - page: 页码（默认1）
    - per_page: 每页数量（默认10）
    - sort: 排序方式（created_at: 创建时间, views: 浏览量）
    """
    try:
        # 获取搜索参数
        keyword = request.args.get('keyword', '')
        tag = request.args.get('tag', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        sort = request.args.get('sort', 'created_at')
        
        # 构建基础查询
        query = Article.query.filter(Article.status == 1)  # 只搜索已发布文章
        
        # 关键词搜索
        if keyword:
            query = query.filter(
                db.or_(
                    Article.title.ilike(f'%{keyword}%'),
                    Article.content.ilike(f'%{keyword}%')
                )
            )
        
        # 标签筛选
        if tag is not None:
            query = query.filter(Article.tag == tag)
        
        # 排序处理
        if sort == 'views':
            query = query.order_by(desc(Article.views))
        else:
            query = query.order_by(desc(Article.created_at))
        
        # 执行分页查询
        pagination = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        # 构建响应数据
        return jsonify({
            'success': True,
            'data': [article.to_dict(include_views=(tag == 1)) for article in pagination.items],
            'total': pagination.total,
            'pages': pagination.pages,
            'current_page': page,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev
        })
            
    except Exception as e:
        print("Error searching articles:", str(e))
        return jsonify({
            'success': False,
            'message': '搜索失败，请稍后重试',
            'error': str(e)
        }), 500

@article_bp.route('/api/comments', methods=['POST'])
def create_comment():
    """创建评论"""
    try:
        data = request.get_json()
        
        # 验证必要字段
        if not all(key in data for key in ['article_id', 'content', 'user_id', 'username']):
            return Response(
                json.dumps({
                    'success': False,
                    'message': '缺少必要字段'
                }, ensure_ascii=False),
                status=400,
                mimetype='application/json; charset=utf-8'
            )

        comment = Comment(
            article_id=data['article_id'],
            user_id=data['user_id'],
            username=data['username'],
            content=data['content'],
            parent_id=data.get('parent_id')
        )
        
        db.session.add(comment)
        db.session.commit()
        
        return Response(
            json.dumps({
                'success': True,
                'message': '评论发表成功',
                'data': comment.to_dict()
            }, ensure_ascii=False),
            mimetype='application/json; charset=utf-8'
        )
        
    except Exception as e:
        print("Error creating comment:", str(e))
        return Response(
            json.dumps({
                'success': False,
                'message': '评论发表失败'
            }, ensure_ascii=False),
            status=500,
            mimetype='application/json; charset=utf-8'
        )

@article_bp.route('/api/comments/<string:article_id>', methods=['GET'])
def get_comments(article_id):
    """获取文章评论列表"""
    try:
        # 获取所有评论，按创建时间排序
        comments = Comment.query.filter_by(article_id=article_id).order_by(Comment.created_at.asc()).all()
        
        # 构建评论树
        comment_dict = {}
        root_comments = []
        
        # 首先将所有评论转换为字典格式
        for comment in comments:
            comment_data = comment.to_dict()
            comment_data['children'] = []
            comment_dict[comment.id] = comment_data
        
        # 构建树形结构
        for comment in comments:
            comment_data = comment_dict[comment.id]
            if comment.parent_id:
                # 如果有父评论，添加到父评论的children中
                parent_comment = comment_dict.get(comment.parent_id)
                if parent_comment:
                    # 添加回复对象信息
                    comment_data['reply_to'] = parent_comment['username']
                    # 将回复添加到父评论的children中
                    parent_comment['children'].append(comment_data)
            else:
                # 如果是根评论，添加到根列表中
                root_comments.append(comment_data)
        
        # 按时间排序
        for comment in comment_dict.values():
            comment['children'].sort(key=lambda x: x['created_at'])
        
        root_comments.sort(key=lambda x: x['created_at'])
        
        return Response(
            json.dumps({
                'success': True,
                'data': root_comments
            }, ensure_ascii=False),
            mimetype='application/json; charset=utf-8'
        )
        
    except Exception as e:
        print("Error getting comments:", str(e))
        return Response(
            json.dumps({
                'success': False,
                'message': '获取评论列表失败'
            }, ensure_ascii=False),
            status=500,
            mimetype='application/json; charset=utf-8'
        )

@article_bp.route('/api/article-content', methods=['POST'])
def create_article_content():
    """创建或更新文章详情内容"""
    try:
        data = request.get_json()
        
        # 验证必要字段
        if not data or 'article_id' not in data or 'content' not in data:
            return Response(
                json.dumps({
                    'success': False,
                    'message': '缺少必要字段'
                }, ensure_ascii=False),
                status=400,
                mimetype='application/json'
            )
            
        # 根据 article_id 查询原文章标题
        article = Article.query.filter_by(article_id=data['article_id']).first()
        if not article:
            return Response(
                json.dumps({
                    'success': False,
                    'message': '原文章不存在'
                }, ensure_ascii=False),
                status=404,
                mimetype='application/json'
            )
            
        # 查询是否存在文章详情
        existing_content = ArticleContent.query.filter_by(article_id=data['article_id']).first()
        
        if existing_content:
            # 如果存在，更新内容
            existing_content.content = data['content']
            existing_content.title = article.title  # 同步更新标题
            db.session.commit()
            
            return Response(
                json.dumps({
                    'success': True,
                    'message': '文章详情更新成功',
                    'data': existing_content.to_dict()
                }, ensure_ascii=False),
                status=200,
                mimetype='application/json'
            )
        else:
            # 如果不存在，创建新的文章详情
            article_content = ArticleContent(
                article_id=data['article_id'],
                title=article.title,
                content=data['content']
            )
            
            db.session.add(article_content)
            db.session.commit()
            
            return Response(
                json.dumps({
                    'success': True,
                    'message': '文章详情创建成功',
                    'data': article_content.to_dict()
                }, ensure_ascii=False),
                status=201,
                mimetype='application/json'
            )
        
    except Exception as e:
        db.session.rollback()
        print("Error creating/updating article content:", str(e))
        return Response(
            json.dumps({
                'success': False,
                'message': '操作文章详情失败',
                'error': str(e)
            }, ensure_ascii=False),
            status=500,
            mimetype='application/json'
        )

# 修改获取文章详情的路由，支持通过 article_id 查询
@article_bp.route('/api/articles/<string:article_id>', methods=['GET'])
def get_article_by_id(article_id):
    """获取指定文章"""
    article = Article.query.filter_by(article_id=article_id).first()
    if article is None:
        return Response(
            json.dumps({
                'success': False,
                'message': '文章不存在'
            }, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    
    return Response(
        json.dumps({
            'success': True,
            'data': article.to_dict()
        }, ensure_ascii=False),
        mimetype='application/json'
    )

# 修改更新文章的路由，支持通过 article_id 更新
@article_bp.route('/api/articles/<string:article_id>', methods=['PUT'])
def update_article_by_id(article_id):
    """更新指定文章"""
    article = Article.query.filter_by(article_id=article_id).first()
    if article is None:
        return Response(
            json.dumps({
                'success': False,
                'message': '文章不存在'
            }, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    
    data = request.get_json()
    if not data:
        return Response(
            json.dumps({
                'success': False,
                'message': '更新数据不能为空'
            }, ensure_ascii=False),
            status=400,
            mimetype='application/json'
        )
    
    try:
        # 更新字段
        if 'title' in data:
            article.title = data['title']
        if 'description' in data:
            article.description = data['description']
        if 'tag' in data:
            article.tag = data['tag']
        
        db.session.commit()
        
        return Response(
            json.dumps({
                'success': True,
                'message': '文章更新成功',
                'data': article.to_dict()
            }, ensure_ascii=False),
            mimetype='application/json'
        )
        
    except Exception as e:
        db.session.rollback()
        return Response(
            json.dumps({
                'success': False,
                'message': '更新文章失败',
                'error': str(e)
            }, ensure_ascii=False),
            status=500,
            mimetype='application/json'
        )

@article_bp.route('/game')
def game_page():
    """游戏页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'game.html')
    return send_file(file_path)

# 添加游戏下载相关的路由
@article_bp.route('/api/game-download/<string:article_id>', methods=['GET'])
def get_game_download(article_id):
    """获取游戏下载信息"""
    try:
        # 检查文章是否存在且是游戏类型
        article = Article.query.filter_by(article_id=article_id).first()
        if not article:
            return jsonify({
                'success': False,
                'message': '文章不存在'
            }), 404
            
        if article.tag != 1:  # 确保是游戏类型
            return jsonify({
                'success': False,
                'message': '该文章不是游戏类型'
            }), 400
            
        # 获取下载信息
        download_info = GameDownload.query.filter_by(article_id=article_id).first()
        if not download_info:
            return jsonify({
                'success': False,
                'message': '暂无下载信息'
            }), 404
            
        return jsonify({
            'success': True,
            'data': download_info.to_dict()
        })
        
    except Exception as e:
        print("Error getting game download:", str(e))
        return jsonify({
            'success': False,
            'message': '获取下载信息失败'
        }), 500

@article_bp.route('/api/game-download', methods=['POST'])
def create_game_download():
    """创建游戏下载信息"""
    try:
        data = request.get_json()
        
        # 验证必要字段
        if not data or 'article_id' not in data or 'url' not in data:
            return jsonify({
                'success': False,
                'message': '缺少必要字段'
            }), 400
            
        # 检查文章是否存在且是游戏类型
        article = Article.query.filter_by(article_id=data['article_id']).first()
        if not article:
            return jsonify({
                'success': False,
                'message': '文章不存在'
            }), 404
            
        if article.tag != 1:
            return jsonify({
                'success': False,
                'message': '该文章不是游戏类型'
            }), 400
            
        # 检查是否已存在下载信息
        existing_download = GameDownload.query.filter_by(article_id=data['article_id']).first()
        if existing_download:
            return jsonify({
                'success': False,
                'message': '下载信息已存在'
            }), 400
            
        # 创建新的下载信息
        game_download = GameDownload(
            article_id=data['article_id'],
            url=data['url'],
            code=data.get('code', ''),  # 可选字段
            decryption=data.get('decryption', '')  # 可选字段
        )
        
        db.session.add(game_download)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '下载信息创建成功',
            'data': game_download.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print("Error creating game download:", str(e))
        return jsonify({
            'success': False,
            'message': '创建下载信息失败'
        }), 500

# 添加搜索路由
@article_bp.route('/search')
def search_page():
    """搜索页面路由"""
    # 获取项目根目录
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # 构建 search.html 文件路径
    file_path = os.path.join(current_dir, 'src', 'views', 'search.html') 
    return send_file(file_path)
