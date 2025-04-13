from flask import Blueprint, jsonify, request, make_response, send_file, render_template
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
from .config import Config
import random
import time
from lxml import etree

# 设置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 创建蓝图
crawling_bp = Blueprint('crawling', __name__)
CORS(crawling_bp)

# 使用配置
PROXY = Config.PROXY

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

def get_proxies():
    """获取代理配置"""
    if PROXY:
        return {
            'http': PROXY,
            'https': PROXY
        }
    return None  # 如果没有配置代理，返回None

@crawling_bp.route('/gallery')
def gallery_page():
    """画廊页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'gallery.html')
    return send_file(file_path)

@crawling_bp.route('/api/gallery-list')
def gallery_list():
    """获取图片列表"""
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

        # 创建会话
        session = get_session()

        # 发送GET请求，使用传入的页码
        url = f'https://www.wnacg.com/albums-index-page-{page}-cate-22.html'
        response = session.get(
            url, 
            headers=headers, 
            proxies=get_proxies(),
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'
        print(response)
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
def gallery_imgs():
    """获取画廊图片列表"""
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

        # 创建会话
        session = get_session()

        # 构造URL并发送请求
        url = f'https://www.wnacg.com/photos-gallery-aid-{aid}.html'
        response = session.get(
            url, 
            headers=headers, 
            proxies=get_proxies(),
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

        # 拼接完成的URL
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
def gallery_search():
    """搜索图片列表"""
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

        # 创建会话
        session = get_session()

        # 构造搜索URL
        url = f'https://www.wnacg.com/search/index.php?q={q}&m=&syn=yes&f=_all&s=create_time_DESC&p={page}'
        
        response = session.get(
            url, 
            headers=headers, 
            proxies=get_proxies(),
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
            proxies=get_proxies(),
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

        # 创建会话
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
            proxies=get_proxies(),
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
            proxies=get_proxies(),
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

@crawling_bp.route('/vodplay')
def vod_play_page():
    """视频播放页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'vodplay.html')
    return send_file(file_path)

@crawling_bp.route('/api/vod-stream')
def vod_stream():
    """获取视频流链接"""
    try:
        # 创建会话
        session = get_session()
        
        # 更新 m3u8_url 链接
        m3u8_url = "https://delivery-node-2sswyguyhsj4lxd9.voe-network.net/engine/hls2/01/11323/w5yqsyujmkxw_,n,.urlset/index-v1-a1.m3u8"  # 修改为新的链接
        params = {
            't': '4Sq9I5zTS859kXMz8yduqQhkg_ZUOOj8V34lhzP_ByU',
            's': '1736751907',
            'e': '14400',
            'f': '56617602',
            'node': 'RPkITe6xxE3U13wyoHeVW ARovZW4geIqHi3XEhOGlg=',
            'i': '64.32',
            'sp': '2500',
            'asn': '46844',
            'q': 'n'
        }
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }

        response = session.get(
            url=m3u8_url,
            params=params,
            headers=headers,
            proxies=get_proxies(),
            timeout=(5, 30),
            verify=False
        )

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 获取m3u8内容并处理
        m3u8_content = response.text
        
        # 过滤掉不需要的元数据行
        filtered_lines = []
        skip_patterns = [
            '#EXTM3U',
            '#EXT-X-VERSION:',
            '#EXT-X-MEDIA-SEQUENCE:',
            '#EXT-X-ALLOW-CACHE:',
            '#EXT-X-TARGETDURATION:',
            '#EXTINF:',
            "#EXT-X-ENDLIST",
            "#EXT-X-DISCONTINUITY",
            "#EXT-X-PROGRAM-DATE-TIME",
            "#EXT-X-KEY",
            "#EXT-X-MAP",
            "#EXT-X-MEDIA",
            "#EXT-X-PLAYLIST-TYPE",
            "#EXT-X-I-FRAMES-ONLY",
            "#EXT-X-SESSION-DATA",
            "#EXT-X-SESSION-KEY",
        ]
        
        for line in m3u8_content.splitlines():
            if not any(line.startswith(pattern) for pattern in skip_patterns):
                # 确保行不为空且不只包含空白字符
                if line.strip():
                    filtered_lines.append(line.strip())

        # 返回处理后的数据
        result_data = {
            'success': True,
            'data': {
                'ts_urls': filtered_lines,  # 只包含 .ts 文件的 URL
                'base_url': response.url
            }
        }
        
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

@crawling_bp.route('/vods')
def vods_page():
    """视频列表页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'vods.html')
    return send_file(file_path)

@crawling_bp.route('/api/vods-anime')
def vods_anime():
    """获取动漫视频列表"""
    try:
        # 获取页码参数，默认为1
        page = request.args.get('page', 1, type=int)
        if page < 1:
            page = 1
        
        # 获取类型参数，默认为0（热门列表）
        video_type = request.args.get('type', 0, type=int)
        if video_type not in [0, 1]:
            video_type = 0  # 默认值

        # 根据类型构造URL
        if video_type == 0:
            url = f'https://www.acgnya.com/vodshow/20--hits------{page}---/'
        else:
            url = f'https://www.acgnya.com/vodshow/20--time------{page}---/'

        # 检查缓存
        cache_key = f'vods_hits_page_{page}_type_{video_type}'
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
            'Cookie':'__51vcke__JlffvrDSaxhmAK3d=eef083e1-9892-59c3-a020-a6e1671cc80f; __51vuft__JlffvrDSaxhmAK3d=1736076215649; mac_history_mxpro=%5B%7B%22vod_name%22%3A%22%E6%96%97%E7%BD%97%E5%A4%A7%E9%99%862%EF%BC%9A%E7%BB%9D%E4%B8%96%E5%94%90%E9%97%A8%22%2C%22vod_url%22%3A%22https%3A%2F%2Fwww.acgnya.com%2Fvodplay%2F4104-2-74%2F%22%2C%22vod_part%22%3A%2274%22%7D%2C%7B%22vod_name%22%3A%22%E4%BB%99%E9%80%86%22%2C%22vod_url%22%3A%22https%3A%2F%2Fwww.acgnya.com%2Fvodplay%2F4049-2-1%2F%22%2C%22vod_part%22%3A%221%22%7D%2C%7B%22vod_name%22%3A%22%E5%B8%88%E5%85%84%E5%95%8A%E5%B8%88%E5%85%84%22%2C%22vod_url%22%3A%22https%3A%2F%2Fwww.acgnya.com%2Fvodplay%2F5050-1-1%2F%22%2C%22vod_part%22%3A%221%22%7D%2C%7B%22vod_name%22%3A%22%E4%BA%94%E8%A1%8C%E6%88%98%E7%A5%9E%22%2C%22vod_url%22%3A%22https%3A%2F%2Fwww.acgnya.com%2Fvodplay%2F5934-1-1%2F%22%2C%22vod_part%22%3A%221%22%7D%5D; __51uvsct__JlffvrDSaxhmAK3d=5; mx_style=black; showBtn=true; PHPSESSID=bm3ilb68klmcvq3ckjktm92ua0; __vtins__JlffvrDSaxhmAK3d=%7B%22sid%22%3A%20%22aca8bb67-bbf8-5a87-9690-51a2e324855b%22%2C%20%22vd%22%3A%204%2C%20%22stt%22%3A%2028754%2C%20%22dr%22%3A%207187%2C%20%22expires%22%3A%201736245634201%2C%20%22ct%22%3A%201736243834201%7D'
        }

        # 创建会话
        session = get_session()

        # 发送GET请求
        response = session.get(
            url, 
            headers=headers,
            proxies=get_proxies(),
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
        
        # 找到所有的热门视频项目
        vod_items = soup.select('.module-poster-item')
        # 存储结果的列表
        results = []
        
        # 遍历每个热门视频项目
        for item in vod_items:
           
            # 获取链接和标题
            link = item.get('href', '')
            title = item.get('title', '')
            
            # 获取备注信息
            note_elem = item.select_one('.module-item-note')
            note_text = note_elem.get_text(strip=True) if note_elem else ''
            
            # 获取图片链接
            img_elem = item.select_one('.module-item-pic img')
            img_url = img_elem.get('data-original', '') if img_elem else ''
            
            # 将数据添加到结果列表
            results.append({
                'title': title,
                'link': link,
                'note': note_text,
                'img': img_url
            })

        # 缓存结果
        result_data = {
            'success': True,
            'data': results,
            'total': len(results)
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

@crawling_bp.route('/cartoon')
def cartoon_page():
    """漫画页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'cartoon.html')
    return send_file(file_path)

@crawling_bp.route('/cartoon/detail/<cid>')
def cartoon_detail_page(cid):
    """漫画详情页面"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'cartoon-detail.html')
    return send_file(file_path)

@crawling_bp.route('/api/cartoon-hans')
def cartoon_hans():
    """获取漫画列表"""
    try:
        page = request.args.get('page', 1, type=int)
        if page < 1:
            page = 1
            
        # 获取类型参数，默认为0（推荐漫画）
        manga_type = request.args.get('type', 0, type=int)
        if manga_type not in [0, 1, 2]:
            manga_type = 0  # 默认值
            
        # 检查缓存
        cache_key = f'cartoon_hans_{manga_type}_{page}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头，模拟真实浏览器
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        # 创建会话
        session = get_session()

        # 根据类型构造URL
        if manga_type == 0:
            # 漫画推荐
            url = f'https://www.cartoon18.com/zh-hans?sort=likes&page={page}'
        elif manga_type == 1:
            # 精漫3D
            url = f'https://www.cartoon18.com/zh-hans/q/3d?page={page}'
        elif manga_type == 2:
            # 绅士漫画
            url = f'https://www.wnacg.com/albums-index-page-{page}-cate-22.html'

        # 发送GET请求
        response = session.get(
            url, 
            headers=headers, 
            proxies=get_proxies(),
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
        result = []

        if manga_type == 2:
            # 绅士漫画数据提取
            gallery_items = soup.select('.gallary_item .pic_box a')
            for item in gallery_items:
                title = item.get('title', '')
                # 移除<em>和</em>标签
                title = title.replace('<em>', '').replace('</em>', '')
                img = item.find('img')
                
                # 提取aid
                href = item.get('href', '')
                pid = None
                if href:
                    # 提取href中最后一个'-'到'.html'之间的数字
                    start_index = href.rfind('-') + 1
                    end_index = href.rfind('.html')
                    if start_index > 0 and end_index > start_index:
                        pid = href[start_index:end_index]
                
                if img:
                    img_url = img.get('src', '')
                    if img_url.startswith('/'):
                        img_url = f"https:{img_url}"
                    
                    
                    result.append({
                        'title': title,
                        'img': img_url,
                        'link': f"https://www.wnacg.com{href}" if href else '',
                        'pid': pid,
                        'manga_type': manga_type
                    })
        else:
            # cartoon18数据提取
            cartoon_items = soup.select('.card .visited')
            for item in cartoon_items:
                img = item.find('img')
                if img:
                    img_url = img.get('data-src', '')
                    title = img.get('alt', '')
                    link = item.get('href', '')
                    
                    # 提取pid
                    pid = ''
                    if link:
                        pid_match = re.findall(r'v/(.*)', link)
                        if pid_match:
                            pid = pid_match[0]
                    
                    # 确保链接是完整的URL
                    if link and not link.startswith('http'):
                        link = f"https://www.cartoon18.com{link}"
                    
                    result.append({
                        'title': title,
                        'img': img_url,
                        'link': link,
                        'pid': pid,
                        'manga_type': manga_type
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

@crawling_bp.route('/api/cartoon-hans/detail')
def cartoon_hans_detail():
    """获取漫画详情"""
    try:
        cid = request.args.get('cid')
        manga_type = request.args.get('type', 0, type=int)
        
        if not cid:
            return jsonify({
                'success': False,
                'message': '缺少漫画ID'
            }), 400
            
        # 检查缓存
        cache_key = f'cartoon_hans_detail_{manga_type}_{cid}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头，模拟真实浏览器
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'Referer': 'https://www.cartoon18.com/',
            'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'DNT': '1',
        }

        # 创建会话
        session = get_session()

        result = {}
        
        if manga_type == 2:
            # 绅士漫画数据爬取方式
            url = f'https://www.wnacg.com/photos-gallery-aid-{cid}.html'
            response = session.get(
                url, 
                headers=headers, 
                proxies=get_proxies(),
                timeout=(5, 30),
                verify=False
            )
            response.encoding = 'utf-8'

            if response.status_code != 200:
                logger.error(f"请求失败，状态码：{response.status_code}")
                return jsonify({
                    'success': False,
                    'message': '获取数据失败',
                    'error': f'HTTP {response.status_code}'
                }), 500
            
            # 解析图片URL
            imglist_content = response.text
            print(imglist_content,'imglist_contentimglist_content')
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
            
            # 解析HTML获取其他信息
            soup = BeautifulSoup(imglist_content, 'html.parser')
            
            # 提取标题
            title_elem = soup.select_one('.bread') or soup.select_one('h2')
            title = title_elem.get_text(strip=True) if title_elem else '未知标题'
            
            # 构造结果
            result = {
                'title': title,
                'author': '未知作者',  # wnacg.com通常不显示作者信息
                'description': '',  # wnacg.com通常不显示描述
                'tags': [],  # wnacg.com通常不显示标签
                'images': full_img_urls,
                'total_images': len(full_img_urls)
            }
            
        else:
            # cartoon18数据爬取方式
            url = f'https://www.cartoon18.com/story/{cid}/full'
            response = session.get(
                url, 
                headers=headers, 
                proxies=get_proxies(),
                timeout=(5, 30),
                verify=False
            )
            response.encoding = 'utf-8'
            
            if response.status_code != 200:
                logger.error(f"请求失败，状态码：{response.status_code}")
                return jsonify({
                    'success': False,
                    'message': '获取数据失败',
                    'error': f'HTTP {response.status_code}'
                }), 500
            
            content = response.text
            
            # 先提取图片数字路径部分
            image_num_pattern = r'https:\/\/img\.cartoon18\.com\/images\/image\/(\d+)\/'
            image_num_matches = re.findall(image_num_pattern, content)
            
            if not image_num_matches:
                logger.error("未找到图片路径数字部分")
                return jsonify({
                    'success': False,
                    'message': '未找到图片',
                    'error': '无法识别图片格式'
                }), 500
                
            # 使用找到的数字组装正则表达式
            image_pattern = r'https:\/\/img\.cartoon18\.com\/images\/image\/' + image_num_matches[0] + r'\/(.*?)(?:\'|"|>|\s)'
            image_matches = re.findall(image_pattern, content)
            
            # 构建完整的图片URL列表
            image_urls = [f'https://img.cartoon18.com/images/image/{image_num_matches[0]}/{match}' for match in image_matches]
            
            # 去重
            image_urls = list(dict.fromkeys(image_urls))
            
            # 解析HTML以获取其他信息
            soup = BeautifulSoup(content, 'html.parser')
            
            # 提取标题
            title_elem = soup.select_one('h1') or soup.select_one('.story-title') or soup.select_one('title')
            title = title_elem.get_text(strip=True) if title_elem else '未知标题'
            
            # 提取作者
            author_elem = soup.select_one('.author-name') or soup.select_one('.info-author')
            author = author_elem.get_text(strip=True) if author_elem else '未知作者'
            
            # 提取简介
            description_elem = soup.select_one('.story-description') or soup.select_one('.description')
            description = description_elem.get_text(strip=True) if description_elem else '暂无简介'
            
            # 提取标签
            tags = [tag.get_text(strip=True) for tag in soup.select('.tag-item') or soup.select('.tag')]
            
            # 构造结果
            result = {
                'title': title,
                'author': author,
                'description': description,
                'tags': tags,
                'images': image_urls,
                'total_images': len(image_urls)
            }

        # 缓存结果
        result_data = {
            'success': True,
            'data': result
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

@crawling_bp.route('/api/cartoon-diversity')
def cartoon_diversity():
    """获取漫画章节列表"""
    try:
        pid = request.args.get('pid')
        if not pid:
            return jsonify({
                'success': False,
                'message': '缺少漫画ID'
            }), 400
        
        # 检查缓存
        cache_key = f'cartoon_diversity_{pid}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头，模拟真实浏览器
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'Referer': 'https://www.cartoon18.com/'
        }
        
        # 创建会话
        session = get_session()
        
        # 构造URL
        url = f'https://www.cartoon18.com/v/{pid}'

        # 发送GET请求
        response = session.get(
            url, 
            headers=headers, 
            proxies=get_proxies(),
            timeout=(5, 30),
            verify=False
        )
        
        # 尝试使用不同的编码方式
        encodings = ['utf-8', 'gbk', 'gb2312', 'big5', 'shift_jis']
        content = None
        
        for encoding in encodings:
            try:
                # 尝试不同的编码
                response.encoding = encoding
                content = response.text
                # 移除对is_content_garbled的调用，直接使用第一个成功的编码
                logger.info(f"尝试使用 {encoding} 编码解析内容")
                break
            except Exception as e:
                logger.warning(f"使用 {encoding} 编码解析失败: {str(e)}")
        
        if not content or is_content_garbled(content):
            # 如果所有编码都失败，尝试直接获取内容
            content = response.content.decode('utf-8', errors='ignore')
        
        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(content, 'html.parser')
        diversity_list = []
        
        # 使用lxml解析HTML
        tree = etree.HTML(content)
        # 使用XPath提取所有包含btn类的a标签文本和链接
        try:
            btn_texts = tree.xpath('//div/div/a[contains(@class,"btn")]/text()')
            btn_hrefs = tree.xpath('//div/div/a[contains(@class,"btn")]/@href')
            print(btn_hrefs,'btn_hrefsbtn_hrefsbtn_hrefsbtn_hrefs')
            diversity_list = []
            for text,href in zip(btn_texts,btn_hrefs):
                # 从链接中提取数字部分
                cid = re.findall(r'\d+', href)
                cid = cid[-1] if cid else ''  # 取最后一组数字
                print(cid,'cidcidcidcidcidcidcidcid')
                if text:  # 只添加有文本的元素
                    if '開始閱讀' in text:
                        text = '01話'
                    diversity_list.append({
                        'diversity': text,
                        'cid': cid
                    })
        except Exception as e:
            logger.error(f"XPath解析失败: {str(e)}")
        
        print(diversity_list,'88484')
        # 构造结果
        result = {
            'diversityList': diversity_list,
            'total': len(diversity_list)
        }
        print(result,'8888888888888888')
        
        # 缓存结果
        result_data = {
            'success': True,
            'data': result
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

# 用于检测文本是否为乱码
def is_content_garbled(content):
    if not content:
        return True
    
    # 如果乱码比例过高，认为是乱码
    sample = content[:1000] if len(content) > 1000 else content
    garbled_chars = sum(1 for c in sample if ord(c) > 0x7E or ord(c) < 0x20 and c not in '\n\r\t')
    
    # 乱码字符比例
    garbled_ratio = garbled_chars / len(sample)
    
    # 包含基本HTML标签
    has_html_structure = '<html' in content.lower() and '<body' in content.lower()
    
    return garbled_ratio > 0.3 or not has_html_structure

@crawling_bp.route('/api/cartoon-search')
def cartoon_search():
    """搜索漫画
    
    type参数说明：
    0 - 漫画搜索 (cartoon18.com)
    1 - 预留其他漫画源1
    2 - 预留其他漫画源2
    3 - 预留其他漫画源3
    """
    try:
        # 获取搜索参数
        kw = request.args.get('kw', '')
        manga_type = request.args.get('type', 0, type=int)
        
        if not kw:
            return jsonify({
                'success': False,
                'message': '请输入搜索关键词'
            }), 400
            
        # 检查缓存
        cache_key = f'cartoon_search_{manga_type}_{kw}'
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
            'Referer': 'https://www.cartoon18.com/'
        }
        
        # 创建会话
        session = get_session()
        
        # 根据type构造不同的搜索URL
        if manga_type == 0 or  manga_type == 1:
            # cartoon18.com搜索
            url = f'https://www.cartoon18.com/q/{kw}?page=1'
            
            # 发送GET请求
            response = session.get(
                url,
                headers=headers,
                proxies=get_proxies(),
                timeout=(5, 30),
                verify=False
            )
            response.encoding = 'utf-8'
            
            # 检查响应状态
            if response.status_code != 200:
                logger.error(f"搜索请求失败，状态码：{response.status_code}")
                return jsonify({
                    'success': False,
                    'message': '搜索失败',
                    'error': f'HTTP {response.status_code}'
                }), 500
                
            # 解析HTML
            soup = BeautifulSoup(response.text, 'html.parser')
            cartoon_items = soup.select('.card .visited')
            
            # 提取数据
            result = []
            for item in cartoon_items:
                img = item.find('img')
                if img:
                    img_url = img.get('data-src', '')
                    title = img.get('alt', '')
                    link = item.get('href', '')
                    
                    # 提取pid
                    pid = ''
                    if link:
                        pid_match = re.findall(r'v/(.*)', link)
                        if pid_match:
                            pid = pid_match[0]
                    
                    # 确保链接是完整的URL
                    if link and not link.startswith('http'):
                        link = f"https://www.cartoon18.com{link}"
                    
                    result.append({
                        'title': title,
                        'img': img_url,
                        'link': link,
                        'pid': pid,
                        'manga_type': manga_type
                    })
        elif manga_type == 2:
            # 绅士漫画搜索 (wnacg.com)
            url = f'https://www.wnacg.com/search/index.php?q={kw}&m=&syn=yes&f=_all&s=create_time_DESC&p=1'
            
            # 发送GET请求
            response = session.get(
                url,
                headers=headers,
                proxies=get_proxies(),
                timeout=(5, 30),
                verify=False
            )
            response.encoding = 'utf-8'
            
            # 检查响应状态
            if response.status_code != 200:
                logger.error(f"搜索请求失败，状态码：{response.status_code}")
                return jsonify({
                    'success': False,
                    'message': '搜索失败',
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
                pid = None
                if href:
                    # 提取href中最后一个'-'到'.html'之间的数字
                    start_index = href.rfind('-') + 1
                    end_index = href.rfind('.html')
                    if start_index > 0 and end_index > start_index:
                        pid = href[start_index:end_index]
                
                if img:
                    img_url = img.get('src', '')
                    if img_url.startswith('/'):
                        img_url = f"https:{img_url}"
                    
                    result.append({
                        'title': title,
                        'img': img_url,
                        'link': f"https://www.wnacg.com{href}" if href else '',
                        'pid': pid
                    })
        else:
            return jsonify({
                'success': False,
                'message': '暂不支持该搜索类型'
            }), 400
            
        # 缓存结果
        result_data = {
            'success': True,
            'data': result,
            'total': len(result)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)
        
    except requests.Timeout as e:
        logger.error(f"搜索请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"搜索网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"搜索处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()