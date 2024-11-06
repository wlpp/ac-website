from flask import Blueprint, request, Response, json, make_response, jsonify, render_template, send_file
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc
from flask_cors import CORS
import os

db = SQLAlchemy()

# 创建文章模型
class Article(db.Model):
    __tablename__ = 'articles'
    
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.String(50))
    title = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    image_url = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.now)
    n_date = db.Column(db.Date, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'article_id': self.article_id,
            'title': self.title,
            'content': self.content,
            'image_url': self.image_url,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if isinstance(self.created_at, datetime) else self.created_at,
            'n_date': self.n_date.strftime('%Y-%m-%d') if isinstance(self.n_date, datetime) else self.n_date
        }

# 创建文章内容模型
class ArticleContent(db.Model):
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

def init_db(app):
    """初始化数据库"""
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

@article_bp.route('/api/articles')
def get_articles():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = 10
        
        articles = db.paginate(
            db.select(Article).order_by(desc(Article.created_at)),
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        if articles.items:
            return jsonify({
                'success': True,
                'data': [article.to_dict() for article in articles.items],
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
        return jsonify({
            'success': False,
            'error': '服务器部错误',
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
    
    article = Article(
        title=data['title'],
        content=data['content'],
        image_url=data.get('image_url'),
        n_date=datetime.strptime(data['n_date'], '%Y-%m-%d') if 'n_date' in data else None
    )
    
    db.session.add(article)
    db.session.commit()
    
    return Response(
        json.dumps(article.to_dict(), ensure_ascii=False),
        status=201,
        mimetype='application/json'
    )

@article_bp.route('/articles/<int:article_id>', methods=['GET'])
def get_article(article_id):
    """获取指定文章"""
    article = Article.query.get(article_id)
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

@article_bp.route('/articles/<int:article_id>', methods=['PUT'])
def update_article(article_id):
    """更新指定文章"""
    article = Article.query.get(article_id)
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
    
    if 'title' in data:
        article.title = data['title']
    if 'content' in data:
        article.content = data['content']
    if 'image_url' in data:
        article.image_url = data['image_url']
    if 'n_date' in data:
        article.n_date = datetime.strptime(data['n_date'], '%Y-%m-%d')
    
    db.session.commit()
    
    return Response(
        json.dumps(article.to_dict(), ensure_ascii=False),
        mimetype='application/json'
    )

@article_bp.route('/articles/<int:article_id>', methods=['DELETE'])
def delete_article(article_id):
    """删除指定文章"""
    article = Article.query.get(article_id)
    if article is None:
        return Response(
            json.dumps({'error': '文章不存在'}, ensure_ascii=False),
            status=404,
            mimetype='application/json'
        )
    
    db.session.delete(article)
    db.session.commit()
    
    return '', 204

@article_bp.route('/article/<int:article_id>')
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
    """搜索文章"""
    try:
        keyword = request.args.get('keyword', '')
        page = request.args.get('page', 1, type=int)
        per_page = 10
        
        if not keyword:
            return jsonify({
                'success': False,
                'error': '搜索关键词不能为空'
            }), 400
        
        # 使用 SQLAlchemy 的 or_ 进行标题和内容的模糊搜索
        query = Article.query.filter(
            db.or_(
                Article.title.ilike(f'%{keyword}%'),
                Article.content.ilike(f'%{keyword}%')
            )
        ).order_by(desc(Article.created_at))
        
        articles = db.paginate(
            query,
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        return jsonify({
            'success': True,
            'data': [article.to_dict() for article in articles.items],
            'total': articles.total,
            'pages': articles.pages,
            'current_page': page
        })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': '服务器内部错误',
            'message': str(e)
        }), 500
