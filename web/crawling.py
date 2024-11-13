from flask import Blueprint, jsonify, request, make_response, send_file
from flask_cors import CORS
import os
import requests
from bs4 import BeautifulSoup
import logging
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry # type: ignore
import re
from functools import lru_cache
from datetime import datetime, timedelta
import threading
from .user import token_required  # 导入token验证装饰器

# 设置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 创建蓝图
crawling_bp = Blueprint('crawling', __name__)
CORS(crawling_bp)

# 固定代理配置
PROXY = 'http://127.0.0.1:7890'

# 缓存字典，用于存储图片列表数据
gallery_cache = {}
gallery_imgs_cache = {}

# 缓存过期时间（分钟）
CACHE_EXPIRE_MINUTES = 5

def create_session():
    """创建一个带有重试机制的会话"""
    session = requests.Session()
    
    # 配置重试策略
    retry_strategy = Retry(
        total=3,  # 最大重试次数
        backoff_factor=1,  # 重试间隔
        status_forcelist=[500, 502, 503, 504]  # 需重试的HTTP状态码
    )
    
    # 配置适配器
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session

# 创建会话池
session_pool = {}

def get_session():
    """从会话池获取或创建新的会话"""
    thread_id = threading.get_ident()
    if thread_id not in session_pool:
        session_pool[thread_id] = create_session()
    return session_pool[thread_id]

@crawling_bp.route('/gallery')
def gallery_page():
    """画廊页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'gallery.html')
    return send_file(file_path)

@crawling_bp.route('/api/gallery-list')
@token_required
def gallery_list(current_user):
    """获取图片列表"""
    # 检查用户权限
    if current_user.role != 0:
        return jsonify({
            'success': False,
            'message': '权限不足'
        }), 403
    
    try:
        page = request.args.get('page', 1, type=int)
        if page < 1:
            page = 1
            
        # 检查缓存
        cache_key = f'gallery_list_{page}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 发送GET请求，使用传入的页码
        url = f'https://www.wnacg.com/albums-index-page-{page}-cate-22.html'
        response = session.get(
            url, 
            headers=headers, 
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        gallery_items = soup.select('.gallary_item .pic_box a')

        # 提取数据
        result = []
        for item in gallery_items:
            title = item.get('title', '')
            # 移除<em>和</em>标签
            title = title.replace('<em>', '').replace('</em>', '')
            img = item.find('img')
            
            # 提取aid
            href = item.get('href', '')
            aid = None
            if href:
                # 提取href中最后一个'-'到'.html'之间的数字
                start_index = href.rfind('-') + 1
                end_index = href.rfind('.html')
                if start_index > 0 and end_index > start_index:
                    aid = href[start_index:end_index]
            
            if img:
                img_url = img.get('src', '')
                if img_url.startswith('/'):
                    img_url = f"https://{img_url}"
                
                result.append({
                    'title': title,
                    'image_url': img_url,
                    'aid': aid
                })

        # 缓存结果
        result_data = {
            'success': True,
            'data': result,
            'total': len(result)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()

@crawling_bp.route('/api/gallery-imgs')
@token_required
def gallery_imgs(current_user):
    """获取画廊图片列表"""
    # 检查用户权限
    if current_user.role != 0:
        return jsonify({
            'success': False,
            'message': '权限不足'
        }), 403
        
    try:
        aid = request.args.get('aid')
        if not aid:
            return jsonify({
                'success': False,
                'message': '缺少aid参数'
            }), 400
            
        # 检查缓存
        cache_key = f'gallery_imgs_{aid}'
        cached_data = gallery_imgs_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 构造URL并发送请求
        url = f'https://www.wnacg.com/photos-gallery-aid-{aid}.html'
        response = session.get(
            url, 
            headers=headers, 
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析图片URL
        imglist_content = response.text
        img_urls = re.findall(r'{ url:(.*?)"}', imglist_content)
        img_urls2 = []
        
        for url in img_urls:
            # 找到第一个'//'和第一个'\'之间的内容
            start_idx = url.find('//') + 2
            end_idx = url.find('", caption')
            if start_idx != -1 and end_idx != -1:
                cleaned_url = url[start_idx:end_idx]
                cleaned_url = cleaned_url.replace('\\', '')
                img_urls2.append(cleaned_url)

        # 拼接完整的URL
        full_img_urls = [f"https://{img_url}" for img_url in img_urls2]

        # 缓存结果
        result_data = {
            'success': True,
            'data': {
                'images': full_img_urls,
                'total': len(full_img_urls)
            }
        }
        gallery_imgs_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()

@crawling_bp.route('/api/gallery-search')
@token_required
def gallery_search(current_user):
    """搜索图片列表"""
    # 检查用户权限
    if current_user.role != 0:
        return jsonify({
            'success': False,
            'message': '权限不足'
        }), 403
        
    try:
        # 获取搜索参数
        q = request.args.get('q', '')
        page = request.args.get('page', 1, type=int)
        
        if not q:
            return jsonify({
                'success': False,
                'message': '缺少搜索关键词'
            }), 400
            
        if page < 1:
            page = 1
            
        # 检查缓存
        cache_key = f'gallery_search_{q}_{page}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 构造搜索URL
        url = f'https://www.wnacg.com/search/index.php?q={q}&m=&syn=yes&f=_all&s=create_time_DESC&p={page}'
        
        response = session.get(
            url, 
            headers=headers, 
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"��求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        gallery_items = soup.select('.gallary_item .pic_box a')

        # 提取数据
        result = []
        for item in gallery_items:
            title = item.get('title', '')
            # 移除<em>和</em>标签
            title = title.replace('<em>', '').replace('</em>', '')
            img = item.find('img')
            
            # 提取aid
            href = item.get('href', '')
            aid = None
            if href:
                # 提取href中最后一个'-'到'.html'之间的数字
                start_index = href.rfind('-') + 1
                end_index = href.rfind('.html')
                if start_index > 0 and end_index > start_index:
                    aid = href[start_index:end_index]
            
            if img:
                img_url = img.get('src', '')
                if img_url.startswith('/'):
                    img_url = f"https://{img_url}"
                
                result.append({
                    'title': title,
                    'image_url': img_url,
                    'aid': aid
                })

        # 缓存结果
        result_data = {
            'success': True,
            'data': result,
            'total': len(result)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()

# 定期清理过期缓存
def clean_expired_cache():
    current_time = datetime.now()
    expire_time = timedelta(minutes=CACHE_EXPIRE_MINUTES)
    
    # 清理gallery_cache
    expired_keys = [
        key for key, (cache_time, _) in gallery_cache.items()
        if current_time - cache_time > expire_time
    ]
    for key in expired_keys:
        del gallery_cache[key]
    
    # 清理gallery_imgs_cache
    expired_keys = [
        key for key, (cache_time, _) in gallery_imgs_cache.items()
        if current_time - cache_time > expire_time
    ]
    for key in expired_keys:
        del gallery_imgs_cache[key]

@crawling_bp.route('/novel')
def novel_page():
    """小说页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'novel.html')
    return send_file(file_path)

@crawling_bp.route('/api/novel-chapters')
def novel_chapters():
    """获取小说章节列表"""
    session = None
    try:
        # 获取小说ID
        novel_id = request.args.get('id')
        if not novel_id:
            return jsonify({
                'success': False,
                'message': '缺少小说ID'
            }), 400
            
        # 检查缓存
        cache_key = f'novel_chapters_{novel_id}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)

        # 创建会话
        session = get_session()

        # 发送GET请求
        url = f'http://banzhu2.net/{novel_id}/'
        response = session.get(
            url, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
            },
            proxies={
                'http': PROXY,
                'https': PROXY
            },
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        chapter_items = soup.select('.mulu ul li a')

        # 使用集合来去重
        seen_chapters = set()
        chapters = []

        # 提取数据
        for item in chapter_items:
            chapter = item.get_text(strip=True)
            href = item.get('href', '')
            
            # 确保href是完整的URL
            if href and not href.startswith('http'):
                href = f'http://banzhu2.net{href}'
            
            # 从href中提取章节ID和数字ID
            chapter_id = None
            number_id = None
            if href:
                # 修改正则表达式，只匹配.html前的部分
                match = re.search(r'/(\d+_\d+/\d+)\.html', href)
                if match:
                    chapter_id = match.group(1)  # 现在chapter_id格式为: 39_39228/2
                    # 提取数字ID用于排序
                    number_match = re.search(r'/(\d+)$', chapter_id)
                    if number_match:
                        number_id = int(number_match.group(1))

            # 使用chapter_id作为唯一标识符来去重
            if chapter_id and chapter_id not in seen_chapters:
                seen_chapters.add(chapter_id)
                chapters.append({
                    'id': chapter_id,  # 现在id格式为: 39_39228/2
                    'chapter': chapter,
                    'href': href,
                    'number_id': number_id
                })

        # 根据number_id排序
        chapters.sort(key=lambda x: x['number_id'] if x['number_id'] is not None else 0)
        
        # 移除number_id字段
        for chapter in chapters:
            del chapter['number_id']

        # 缓存结果
        result_data = {
            'success': True,
            'data': chapters,
            'total': len(chapters)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except Exception as e:
        logger.error(f"获取章节列表时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if session:
            session.close()

@crawling_bp.route('/api/novel-content')
def novel_content():
    """获取小说章节内容"""
    session = None
    try:
        # 获取章节ID
        chapter_id = request.args.get('id')
        if not chapter_id:
            return jsonify({
                'success': False,
                'message': '缺少章节ID'
            }), 400
            
        # 检查缓存
        cache_key = f'novel_content_{chapter_id}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)

        # ��建会话
        session = get_session()
        
        # 首先获取第一页内容来确定总页数
        base_url = f'http://banzhu2.net/{chapter_id}.html'
        first_page = fetch_page_content(session, base_url)
        
        if not first_page:
            return jsonify({
                'success': False,
                'message': '获取内容失败'
            }), 500

        title = first_page['title']
        total_pages = first_page['total_pages']
        all_content = first_page['content']

        # 如果有多页，获取剩余页面的内容
        if total_pages > 1:
            # 获取剩余页面的内容，页码从1开始
            for page in range(1, total_pages):
                page_url = f'http://banzhu2.net/{chapter_id}_{page}.html'
                page_content = fetch_page_content(session, page_url)
                if page_content:
                    all_content.extend(page_content['content'])

        # 缓存结果
        result_data = {
            'success': True,
            'data': {
                'title': title,
                'content': all_content,
                'total_pages': total_pages
            }
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except Exception as e:
        logger.error(f"获取章节内容时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if session:
            session.close()

def fetch_page_content(session, url):
    """获取单页内容的辅助函数"""
    try:
        response = session.get(
            url, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
            },
            proxies={
                'http': PROXY,
                'https': PROXY
            },
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return None

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 获取标题和页码信息
        title = ''
        total_pages = 1
        
        title_elem = soup.find('h1')
        if title_elem:
            title = title_elem.get_text(strip=True)
            # 从标题中提取页码信息，格式为 (1/5)
            page_match = re.search(r'\((\d+)/(\d+)\)', title)
            if page_match:
                total_pages = int(page_match.group(2))
                # 移除标题中的页码信息
                title = re.sub(r'\s*\(\d+/\d+\)', '', title).strip()

        # 获取内容
        content = []
        content_elem = soup.find(id='content')
        if content_elem:
            # 将<br>标签替换为换行符
            for br in content_elem.find_all('br'):
                br.replace_with('\n')
            
            # 获取文本内容
            text = content_elem.get_text()
            
            # 移除特殊字符和广告文本
            text = re.sub(r'(笔趣阁|www\.banzhu2\.net|http://banzhu2\.net|手机阅读)', '', text)
            
            # 按换行符分割成段落并清理
            paragraphs = [p.strip() for p in text.split('\n')]
            content = [p for p in paragraphs if len(p) > 1]

        return {
            'title': title,
            'content': content,
            'total_pages': total_pages
        }

    except Exception as e:
        logger.error(f"获取页面内容时发生错误: {str(e)}", exc_info=True)
        return None

@crawling_bp.route('/api/novel-search')
def novel_search():
    """搜索小说"""
    try:
        # 获取搜索关键词
        q = request.args.get('q', '')
        if not q:
            return jsonify({
                'success': False,
                'message': '缺少搜索关键词'
            }), 400
            
        # 检查缓存
        cache_key = f'novel_search_{q}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Content-Type': 'application/x-www-form-urlencoded',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 构造POST数据
        data = {
            'action': 'search',
            'q': q
        }

        # 发送POST请求
        url = 'http://banzhu2.net/home/search'
        response = session.post(
            url, 
            headers=headers,
            data=data,
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        novel_items = soup.select('.fengtui dl')  # 修改选择器以匹配整个小说项

        # 提取数据
        result = []
        for item in novel_items:
            # 获取标题和链接
            title_elem = item.select_one('dd h3 a')
            if not title_elem:
                continue
                
            title = title_elem.get_text(strip=True)
            href = title_elem.get('href', '')
            
            # 提取aid（格式为：41_41724）
            aid = None
            if href:
                match = re.search(r'(\d+_\d+)', href)
                aid = match.group(1) if match else None
            
            # 获取简介
            description = ''
            desc_elem = item.select_one('dd p')  # 修改选择器以匹配简介
            if desc_elem:
                description = desc_elem.get_text(strip=True)
            
            # 获取封面图片
            cover_url = ''
            img_elem = item.select_one('dt img')  # 修改选择器以匹配封面图片
            if img_elem:
                cover_url = img_elem.get('src', '')
                if cover_url.startswith('//'):
                    cover_url = 'https:' + cover_url
                elif cover_url.startswith('/'):
                    cover_url = 'http://banzhu2.net' + cover_url
            
            result.append({
                'id': aid,
                'title': title,
                'description': description,
                'cover_url': cover_url,
                'url': href if href.startswith('http') else f'http://banzhu2.net{href}'
            })

        # 缓存结果
        result_data = {
            'success': True,
            'data': result,
            'total': len(result)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()
